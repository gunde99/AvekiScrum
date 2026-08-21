import { useCallback, useEffect, useMemo, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { useToast } from "../../components/Toast";
import { fetchDailys, type DailyStoryDto, type DailysResponse, type DeveloperTeamId } from "../../api/dailys";
import { fetchTeamRoles } from "../../api/people";
import { updateWorkItemFields } from "../../api/workitems";
import { WorkItemModal } from "../../components/workitem/WorkItemModal";
import { FilterPanel, WORK_ITEM_TYPES, type TagFilterState, type WorkItemTypeKey } from "../dailys/FilterPanel";
import {
  buildGroups,
  isStaleClosed,
  matchesTestFilter,
  samePerson,
  UNASSIGNED_GROUP_LABEL,
  type GroupMode,
  type TestFilterKey,
} from "../dailys/dailysLogic";
import { ReviewCard } from "./ReviewCard";
import { ReviewPreviewModal } from "./ReviewPreviewModal";
import { laneOf, REVIEW_LANES, tagsForLane, type ReviewLane, type ReviewLaneKey } from "./reviewLogic";
import "./ReviewBoard.css";

const TEAMS: { id: DeveloperTeamId; label: string }[] = [
  { id: "Nord", label: "Team Nord" },
  { id: "Syd", label: "Team Syd" },
];

/**
 * Sprint review prep: every card the team worked on has to be tagged with how it will be
 * presented. The left half is the sprint board, filtered and grouped the same way as Dailys; the
 * right half is one panel per review tag. Cards are dragged (or sent with a button) into a panel,
 * which writes the tag and moves them out of the list - so what's left on the left is exactly
 * what still needs deciding.
 */
interface ReviewBoardProps {
  onNavigate?: (board: "dailys" | "review") => void;
}

export function ReviewBoard({ onNavigate }: ReviewBoardProps) {
  const { showToast } = useToast();
  const [team, setTeam] = useState<DeveloperTeamId>("Syd");
  const [mode, setMode] = useState<GroupMode>("developer");
  const [data, setData] = useState<DailysResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string> | null>(null);
  const [tagFilters, setTagFilters] = useState<Map<string, TagFilterState>>(new Map());
  const [hideStaleClosed, setHideStaleClosed] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<WorkItemTypeKey>>(new Set(["story", "bug"]));
  const [testFilters, setTestFilters] = useState<Set<TestFilterKey>>(new Set());
  const [developerRoster, setDeveloperRoster] = useState<string[]>([]);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [dragOverLane, setDragOverLane] = useState<ReviewLaneKey | null>(null);
  const [openWorkItemId, setOpenWorkItemId] = useState<number | null>(null);
  // Progress of a multi-card move. Each card is its own Azure write, so a batch of ten takes long
  // enough that the board would otherwise just look frozen.
  const [moveProgress, setMoveProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchDailys(team, controller.signal)
      .then((response) => {
        setData(response);
        setSelectedStatuses(null);
        setTagFilters(new Map());
        setSelectedTypes(new Set(WORK_ITEM_TYPES.map((t) => t.key)));
        setTestFilters(new Set());
        setSelection(new Set());
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [team]);

  useEffect(() => {
    const controller = new AbortController();
    fetchTeamRoles(team, controller.signal)
      .then((roles) => setDeveloperRoster(roles.developers.map((d) => d.displayName)))
      .catch(() => setDeveloperRoster([]));
    return () => controller.abort();
  }, [team]);

  const stories = useMemo(() => data?.teams[0]?.stories ?? [], [data]);

  const availableStatuses = useMemo(
    () => [...new Set(stories.map((s) => s.azureStatus).filter(Boolean))].sort(),
    [stories],
  );
  const availableTags = useMemo(() => [...new Set(stories.flatMap((s) => s.tags))].sort(), [stories]);
  const activeStatuses = selectedStatuses ?? new Set(availableStatuses);

  /** Everything matching the filters - before the review lanes are taken out of it. */
  const filtered = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const include = [...tagFilters.entries()].filter(([, v]) => v === "include").map(([t]) => t);
    const exclude = [...tagFilters.entries()].filter(([, v]) => v === "exclude").map(([t]) => t);
    return stories.filter((s) => {
      if (s.ownedByProductOwner) return false;
      if (!activeStatuses.has(s.azureStatus)) return false;
      if (hideStaleClosed && isStaleClosed(s)) return false;
      const typeKey: WorkItemTypeKey = s.type === "Bug" ? "bug" : "story";
      if (!selectedTypes.has(typeKey)) return false;
      if (testFilters.size > 0 && ![...testFilters].some((k) => matchesTestFilter(s, k))) return false;
      if (query && !s.title.toLowerCase().includes(query) && !String(s.id).includes(query)) return false;
      if (include.some((t) => !s.tags.includes(t))) return false;
      if (exclude.some((t) => s.tags.includes(t))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, searchText, selectedStatuses, tagFilters, hideStaleClosed, selectedTypes, testFilters]);

  /** Cards still waiting for a decision - the ones the meeting prep is actually about. */
  const untagged = useMemo(() => filtered.filter((s) => laneOf(s) === null), [filtered]);

  // Panels show every tagged card regardless of the filters: a filter is for finding what's left
  // to sort, and hiding already-sorted cards from their own panel would just look like data loss.
  const byLane = useMemo(() => {
    const map = new Map<ReviewLaneKey, DailyStoryDto[]>(REVIEW_LANES.map((l) => [l.key, []]));
    for (const story of stories) {
      if (story.ownedByProductOwner) continue;
      const lane = laneOf(story);
      if (lane) map.get(lane)!.push(story);
    }
    return map;
  }, [stories]);

  // buildGroups deliberately repeats a card under everyone who touched it - useful at a standup,
  // wrong here, where each card is sorted exactly once and seeing it twice invites tagging it
  // twice. In developer mode each group is narrowed to the cards that person actually owns, which
  // partitions the board; "Ej tilldelad" keeps whatever has no owner.
  const groups = useMemo(() => {
    const built = buildGroups(untagged, mode, developerRoster);
    if (mode !== "developer") return built;
    return built
      .map((g) =>
        g.label === UNASSIGNED_GROUP_LABEL ? g : { ...g, stories: g.stories.filter((s) => samePerson(s.developer, g.label)) },
      )
      .filter((g) => g.stories.length > 0);
  }, [untagged, mode, developerRoster]);

  const toggleSelect = useCallback((id: number, additive: boolean) => {
    setSelection((prev) => {
      const next = additive ? new Set(prev) : new Set<number>(prev.has(id) && prev.size === 1 ? [] : prev);
      if (!additive) {
        // A plain click selects just this card, or clears it when it was the only one selected.
        if (prev.has(id) && prev.size === 1) return new Set();
        return new Set([id]);
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Writes the lane's tag (or clears every review tag) on each card, one request per card. */
  async function moveToLane(ids: number[], lane: ReviewLane | null) {
    const targets = ids.map((id) => stories.find((s) => s.id === id)).filter((s): s is DailyStoryDto => !!s);
    if (targets.length === 0) return;

    setBusyIds((prev) => new Set([...prev, ...targets.map((t) => t.id)]));
    // A single card shows its own busy state on the card itself; only a batch gets the splash,
    // which blocks input and would be needless ceremony for one quick write.
    const label = lane ? lane.label : "listan";
    if (targets.length > 1) setMoveProgress({ done: 0, total: targets.length, label });
    const done: DailyStoryDto[] = [];
    const failed: string[] = [];
    for (const story of targets) {
      try {
        await updateWorkItemFields(story.id, { tags: tagsForLane(story, lane) });
        done.push(story);
      } catch (err) {
        failed.push(`#${story.id} (${err instanceof Error ? err.message : "okänt fel"})`);
      }
      if (targets.length > 1) setMoveProgress({ done: done.length + failed.length, total: targets.length, label });
    }
    setMoveProgress(null);

    // Patch the local copy so the card moves immediately - a full refetch of the sprint takes
    // seconds, which is far too slow for something meant to be done in a few sweeps.
    if (done.length > 0) {
      const doneIds = new Set(done.map((d) => d.id));
      setData((prev) =>
        prev
          ? {
              ...prev,
              teams: prev.teams.map((t) => ({
                ...t,
                stories: t.stories.map((s) => (doneIds.has(s.id) ? { ...s, tags: tagsForLane(s, lane) } : s)),
              })),
            }
          : prev,
      );
      setSelection((prev) => new Set([...prev].filter((id) => !doneIds.has(id))));
      showToast(
        lane
          ? `${done.length === 1 ? "1 kort" : `${done.length} kort`} taggade som ${lane.label}.`
          : `${done.length === 1 ? "1 kort" : `${done.length} kort`} tillbaka i listan.`,
        "success",
      );
    }
    if (failed.length > 0) showToast(`Kunde inte tagga ${failed.join(", ")}.`, "error");
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const t of targets) next.delete(t.id);
      return next;
    });
  }

  function handleDragStart(e: React.DragEvent, id: number) {
    // Dragging an unselected card acts on that card alone; dragging a selected one takes the
    // whole selection, which is what makes sorting a sprint quick.
    const ids = selection.has(id) ? [...selection] : [id];
    e.dataTransfer.setData("application/json", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, lane: ReviewLane) {
    e.preventDefault();
    setDragOverLane(null);
    try {
      const ids = JSON.parse(e.dataTransfer.getData("application/json")) as number[];
      if (Array.isArray(ids) && ids.length > 0) void moveToLane(ids, lane);
    } catch {
      /* a drag from outside the board - nothing to do */
    }
  }

  const selectedInList = untagged.filter((s) => selection.has(s.id)).length;
  const taggedCount = useMemo(() => [...byLane.values()].reduce((sum, list) => sum + list.length, 0), [byLane]);

  return (
    <BoardShell
      activeBoard="review"
      onNavigate={onNavigate}
      title="Review"
      subtitle={data ? `${data.meta.sprint} · ${data.meta.sprintStart} – ${data.meta.sprintEnd}` : undefined}
    >
      <div className="dailys-board__toolbar">
        <div className="dailys-board__group" role="group" aria-label="Team">
          <span className="dailys-board__group-label">Team</span>
          <div className="dailys-board__group-body">
            {TEAMS.map((t) => (
              <button
                key={t.id}
                className={"dailys-board__tab" + (t.id === team ? " dailys-board__tab--active" : "")}
                onClick={() => setTeam(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dailys-board__group" role="group" aria-label="Gruppering">
          <span className="dailys-board__group-label">Gruppera på</span>
          <div className="dailys-board__group-body">
            {(
              [
                ["goals", "Sprintmål"],
                ["developer", "Utvecklare"],
                ["none", "Ogrupperat"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={"dailys-board__tab dailys-board__tab--mode" + (mode === key ? " dailys-board__tab--active" : "")}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="dailys-board__filter">
          <FilterPanel
            searchText={searchText}
            onSearchTextChange={setSearchText}
            statuses={availableStatuses}
            selectedStatuses={activeStatuses}
            onToggleStatus={(status) =>
              setSelectedStatuses((prev) => {
                const next = new Set(prev ?? availableStatuses);
                if (next.has(status)) next.delete(status);
                else next.add(status);
                return next;
              })
            }
            onSelectAll={() => setSelectedStatuses(new Set(availableStatuses))}
            onSelectNone={() => setSelectedStatuses(new Set())}
            tags={availableTags}
            tagFilters={tagFilters}
            onCycleTag={(tag) =>
              setTagFilters((prev) => {
                const next = new Map(prev);
                const current = next.get(tag);
                if (!current) next.set(tag, "include");
                else if (current === "include") next.set(tag, "exclude");
                else next.delete(tag);
                return next;
              })
            }
            onClearTags={() => setTagFilters(new Map())}
            hideStaleClosed={hideStaleClosed}
            onToggleStaleClosed={() => setHideStaleClosed((v) => !v)}
            staleClosedCount={stories.filter((s) => !s.ownedByProductOwner && isStaleClosed(s)).length}
            selectedTypes={selectedTypes}
            onToggleType={(type) =>
              setSelectedTypes((prev) => {
                const next = new Set(prev);
                if (next.has(type)) next.delete(type);
                else next.add(type);
                return next;
              })
            }
            testFilters={testFilters}
            onToggleTestFilter={(key) =>
              setTestFilters((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          />
        </div>

        <div className="dailys-board__group rv-toolbar__preview" role="group" aria-label="Förhandsgranska">
          <span className="dailys-board__group-label">Inför mötet</span>
          <div className="dailys-board__group-body">
            <button
              type="button"
              className="wi-btn wi-btn--primary"
              onClick={() => setPreviewOpen(true)}
              disabled={taggedCount === 0}
              title={taggedCount === 0 ? "Tagga minst ett kort först" : "Gå igenom vad som ska tas upp och publicera i Teams"}
            >
              Förhandsgranska ({taggedCount})
            </button>
          </div>
        </div>
      </div>

      {loading && <LoadingOverlay message="Hämtar sprintens kort…" />}
      {moveProgress && (
        <LoadingOverlay
          message={`Taggar kort som ${moveProgress.label}…`}
          sub={`${moveProgress.done} av ${moveProgress.total} klara`}
        />
      )}
      {error && <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>}

      {!loading && !error && (
        <div className="rv-layout">
          <section className="rv-list">
            <header className="rv-list__head">
              <h2>Kvar att tagga</h2>
              <span className="rv-list__count">
                {untagged.length} kort
                {selectedInList > 0 && ` · ${selectedInList} markerade`}
              </span>
              {selection.size > 0 && (
                <button type="button" className="wi-btn rv-list__clear" onClick={() => setSelection(new Set())}>
                  Avmarkera
                </button>
              )}
            </header>
            <p className="rv-list__hint">
              Klicka för att markera, ctrl/skift för flera. Dra dem till en panel, eller använd panelens knapp.
            </p>

            {untagged.length === 0 ? (
              <p className="rv-empty">Alla kort som matchar filtret är taggade. 🎉</p>
            ) : (
              groups.map((group) => (
                <div className="rv-group" key={group.id}>
                  {mode !== "none" && (
                    <div className="rv-group__head">
                      <span>{group.label}</span>
                      <span className="rv-group__count">{group.stories.length}</span>
                    </div>
                  )}
                  <div className="rv-group__cards">
                    {group.stories.map((s) => (
                      <ReviewCard
                        key={s.id}
                        story={s}
                        selected={selection.has(s.id)}
                        busy={busyIds.has(s.id)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, s.id)}
                        onToggleSelect={toggleSelect}
                        onOpen={setOpenWorkItemId}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="rv-panels">
            {REVIEW_LANES.map((lane) => {
              const laneStories = byLane.get(lane.key) ?? [];
              return (
                <div
                  key={lane.key}
                  className={"rv-panel" + (dragOverLane === lane.key ? " rv-panel--over" : "")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverLane(lane.key);
                  }}
                  onDragLeave={() => setDragOverLane((prev) => (prev === lane.key ? null : prev))}
                  onDrop={(e) => handleDrop(e, lane)}
                >
                  <header className="rv-panel__head">
                    <span className="rv-panel__icon" aria-hidden="true">
                      {lane.icon}
                    </span>
                    <div className="rv-panel__title-block">
                      <h3 className="rv-panel__title">{lane.label}</h3>
                      <span className="rv-panel__hint">{lane.hint}</span>
                    </div>
                    <span className="rv-panel__count">{laneStories.length}</span>
                  </header>

                  <button
                    type="button"
                    className="wi-btn rv-panel__assign"
                    disabled={selection.size === 0}
                    onClick={() => void moveToLane([...selection], lane)}
                    title={selection.size === 0 ? "Markera kort först" : `Tagga ${selection.size} kort som ${lane.label}`}
                  >
                    Lägg hit {selection.size > 0 ? `(${selection.size})` : ""}
                  </button>

                  <div className="rv-panel__cards">
                    {laneStories.length === 0 ? (
                      <p className="rv-panel__empty">Dra kort hit.</p>
                    ) : (
                      laneStories.map((s) => (
                        // Draggable too, so a card in the wrong panel is moved by dragging it to
                        // the right one rather than having to send it back to the list first.
                        // Selection doesn't apply here - a panel card drags on its own.
                        <ReviewCard
                          key={s.id}
                          story={s}
                          selected={false}
                          busy={busyIds.has(s.id)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/json", JSON.stringify([s.id]));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onToggleSelect={() => undefined}
                          onOpen={setOpenWorkItemId}
                          onRemove={() => void moveToLane([s.id], null)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {previewOpen && data && (
        <ReviewPreviewModal
          team={team}
          sprint={data.meta.sprint}
          sprintStart={data.meta.sprintStart}
          sprintEnd={data.meta.sprintEnd}
          byLane={byLane}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {openWorkItemId !== null && <WorkItemModal workItemId={openWorkItemId} onClose={() => setOpenWorkItemId(null)} />}
    </BoardShell>
  );
}
