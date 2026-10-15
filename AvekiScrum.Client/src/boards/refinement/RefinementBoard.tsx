import { useEffect, useMemo, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { useWorkItemModals } from "../../components/workitem/useWorkItemModals";
import { WorkItemRefCard } from "../../components/workitem/WorkItemRefCard";
import { fetchSprints, type DeveloperTeamId, type SprintOption } from "../../api/dailys";
import {
  fetchProductBacklog,
  fetchRefinementTeams,
  fetchRefinementSprint,
  fetchRefinementTagged,
  fetchRefinementSearch,
  type ProductBacklogItem,
  type ProductBacklogResponse,
  type RefinementTeam,
} from "../../api/refinement";
import {
  buildBacklogSections,
  buildSprintGroups,
  epicChain,
  isOtherTeamPoCard,
  itemsById,
  matchesSearch,
  matchesStatusFilter,
  matchesTag,
  STATUS_FILTER_OPTIONS,
  toRelationRef,
  type StatusFilterKey,
} from "./refinementLogic";
import "./RefinementBoard.css";

type Source = "backlog" | "sprint" | "tagged" | "custom";

/** Fixed by convention, not user-configurable - same idea as the hardcoded "PO produktstyrning"
 *  default team below. */
const REFINEMENT_TAG = "Refinement";

interface RefinementBoardProps {
  onNavigate?: (board: "team-home" | "refinement" | "dailys" | "review" | "test" | "teamcheckin") => void;
  onHome?: () => void;
  team: DeveloperTeamId;
  onTeamChange: (team: DeveloperTeamId) => void;
}

/** "27.1" out of "Utveckling\27.1" - all a release heading needs. */
function releaseLabel(folder: string): string {
  const parts = folder.split("\\");
  return parts[parts.length - 1] || folder;
}

function EpicChain({ chain, onOpen }: { chain: ProductBacklogItem[]; onOpen: (id: number) => void }) {
  if (chain.length === 0) return null;
  return (
    <div className="rf-chain">
      {chain.map((e, i) => (
        <span key={e.id} className="rf-chain__hop">
          {i > 0 && <span className="rf-chain__sep">›</span>}
          <button type="button" className="rf-chain__link" onClick={() => onOpen(e.id)}>
            {e.type} #{e.id} {e.title}
          </button>
        </span>
      ))}
    </div>
  );
}

/** A Feature, its Epic chain above and its User Story/Bug children below - the same shape the
 *  product backlog and the sprint source both render, just reached differently. */
function FeatureBlock({
  feature,
  byId,
  onOpen,
}: {
  feature: ProductBacklogItem;
  byId: Map<number, ProductBacklogItem>;
  onOpen: (id: number) => void;
}) {
  const chain = epicChain(feature, byId);
  const children = feature.childIds.map((id) => byId.get(id)).filter((c): c is ProductBacklogItem => !!c);
  return (
    <div className="rf-feature">
      <EpicChain chain={chain} onOpen={onOpen} />
      <WorkItemRefCard item={toRelationRef(feature)} onOpen={() => onOpen(feature.id)} />
      {children.length > 0 && (
        <div className="rf-feature__children">
          {children.map((c) => (
            <WorkItemRefCard key={c.id} item={toRelationRef(c)} onOpen={() => onOpen(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One tagged match plus its Epic chain above - "Taggade kort" has no swimlanes/children, just the
 *  match itself in context, unlike FeatureBlock's Feature-with-children shape above. */
function TaggedCardBlock({
  item,
  byId,
  onOpen,
}: {
  item: ProductBacklogItem;
  byId: Map<number, ProductBacklogItem>;
  onOpen: (id: number) => void;
}) {
  const chain = epicChain(item, byId);
  return (
    <div className="rf-feature">
      <EpicChain chain={chain} onOpen={onOpen} />
      <WorkItemRefCard item={toRelationRef(item)} onOpen={() => onOpen(item.id)} />
    </div>
  );
}

export function RefinementBoard({ onNavigate, onHome, team, onTeamChange }: RefinementBoardProps) {
  // "Taggade kort" is the default - the product backlog is heavy to load and shouldn't fetch on
  // every visit to the board.
  const [source, setSource] = useState<Source>("tagged");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>("open");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // --- Produktbacklogg ---
  const [boardTeams, setBoardTeams] = useState<RefinementTeam[]>([]);
  const [boardTeam, setBoardTeam] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [iterationInput, setIterationInput] = useState("");
  const [areaPathInput, setAreaPathInput] = useState("");
  const [backlog, setBacklog] = useState<ProductBacklogResponse | null>(null);
  const [backlogLoading, setBacklogLoading] = useState(false);
  const [backlogError, setBacklogError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchRefinementTeams(controller.signal)
      .then((teams) => {
        setBoardTeams(teams);
        setBoardTeam((current) => current || teams.find((t) => t.name === "PO produktstyrning")?.name || teams[0]?.name || "");
      })
      .catch(() => setBoardTeams([]));
    return () => controller.abort();
  }, []);

  async function loadBacklog() {
    setBacklogLoading(true);
    setBacklogError(null);
    try {
      const result = await fetchProductBacklog({
        boardTeam: boardTeam || undefined,
        tag: tagInput || undefined,
        iteration: iterationInput || undefined,
        areaPath: areaPathInput || undefined,
      });
      setBacklog(result);
      setCollapsed(new Set());
    } catch (err) {
      setBacklogError(err instanceof Error ? err.message : "Kunde inte hämta produktbackloggen.");
    } finally {
      setBacklogLoading(false);
    }
  }

  // First load, once there's a team to load with.
  useEffect(() => {
    if (source === "backlog" && boardTeam && !backlog && !backlogLoading) void loadBacklog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, boardTeam]);

  // --- Sprint ---
  // Team-scoped, unlike the product backlog above - a sprint's User Stories/Bugs belong to one
  // Scrum team, so switching Nord<->Syd in the shared header has to pick a fresh sprint and refetch.
  const [sprintOptions, setSprintOptions] = useState<SprintOption[]>([]);
  const [sprintOptionsLoading, setSprintOptionsLoading] = useState(false);
  const [selectedSprint, setSelectedSprint] = useState<string>("");
  const [sprintData, setSprintData] = useState<ProductBacklogResponse | null>(null);
  const [sprintLoading, setSprintLoading] = useState(false);
  const [sprintError, setSprintError] = useState<string | null>(null);

  // A sprint picked for one team means nothing for the other - drop it the moment team changes so
  // the effect below chooses a fresh default instead of re-fetching the old team's sprint under
  // the new team's area-path scope.
  useEffect(() => {
    setSelectedSprint("");
    setSprintData(null);
  }, [team]);

  useEffect(() => {
    if (source !== "sprint") return;
    const controller = new AbortController();
    setSprintOptionsLoading(true);
    fetchSprints(team, undefined, controller.signal)
      .then((options) => {
        // Only this release and the next one - refinement looks forward, not back.
        const currentFolder = options.find((o) => o.isCurrent)?.releaseFolder;
        const currentIndex = currentFolder ? options.findIndex((o) => o.releaseFolder === currentFolder) : -1;
        const forward = currentIndex < 0 ? options : options.slice(currentIndex);
        setSprintOptions(forward);
        setSprintOptionsLoading(false);
        setSelectedSprint((current) => current || forward.find((o) => o.isCurrent)?.path || forward[0]?.path || "");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSprintOptions([]);
        setSprintOptionsLoading(false);
      });
    return () => controller.abort();
  }, [source, team]);

  useEffect(() => {
    if (source !== "sprint" || !selectedSprint) return;
    const controller = new AbortController();
    setSprintLoading(true);
    setSprintError(null);
    fetchRefinementSprint(team, selectedSprint, controller.signal)
      .then((result) => {
        setSprintData(result);
        setSprintLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSprintError(err instanceof Error ? err.message : "Kunde inte hämta sprintens kort.");
        setSprintLoading(false);
      });
    return () => controller.abort();
  }, [source, team, selectedSprint]);

  // --- Taggade kort ---
  // Release-scoped, not sprint-scoped - the tag can land on a card in any sprint under the
  // release (or none yet), so the picker offers whole releases ("27.1") rather than one sprint.
  const [releaseOptions, setReleaseOptions] = useState<{ folder: string; label: string; isCurrent: boolean }[]>([]);
  const [releaseOptionsLoading, setReleaseOptionsLoading] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState("");
  const [taggedData, setTaggedData] = useState<ProductBacklogResponse | null>(null);
  const [taggedLoading, setTaggedLoading] = useState(false);
  const [taggedError, setTaggedError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedRelease("");
    setTaggedData(null);
  }, [team]);

  useEffect(() => {
    if (source !== "tagged") return;
    const controller = new AbortController();
    setReleaseOptionsLoading(true);
    fetchSprints(team, undefined, controller.signal)
      .then((options) => {
        const currentFolder = options.find((o) => o.isCurrent)?.releaseFolder;
        const currentIndex = currentFolder ? options.findIndex((o) => o.releaseFolder === currentFolder) : -1;
        const forward = currentIndex < 0 ? options : options.slice(currentIndex);
        const seen = new Set<string>();
        const releases: { folder: string; label: string; isCurrent: boolean }[] = [];
        for (const o of forward) {
          if (seen.has(o.releaseFolder)) continue;
          seen.add(o.releaseFolder);
          releases.push({ folder: o.releaseFolder, label: releaseLabel(o.releaseFolder), isCurrent: o.releaseFolder === currentFolder });
        }
        setReleaseOptions(releases);
        setReleaseOptionsLoading(false);
        setSelectedRelease((current) => current || releases.find((r) => r.isCurrent)?.folder || releases[0]?.folder || "");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setReleaseOptions([]);
        setReleaseOptionsLoading(false);
      });
    return () => controller.abort();
  }, [source, team]);

  useEffect(() => {
    if (source !== "tagged" || !selectedRelease) return;
    const controller = new AbortController();
    setTaggedLoading(true);
    setTaggedError(null);
    fetchRefinementTagged(team, selectedRelease, controller.signal)
      .then((result) => {
        setTaggedData(result);
        setTaggedLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTaggedError(err instanceof Error ? err.message : "Kunde inte hämta taggade kort.");
        setTaggedLoading(false);
      });
    return () => controller.abort();
  }, [source, team, selectedRelease]);

  const taggedById = useMemo(() => (taggedData ? itemsById(taggedData) : new Map<number, ProductBacklogItem>()), [taggedData]);
  const taggedMatches = useMemo(() => {
    if (!taggedData) return [];
    return taggedData.items
      .filter((i) => matchesTag(i, REFINEMENT_TAG))
      .filter((i) => !isOtherTeamPoCard(i, team) && matchesStatusFilter(i, statusFilter) && matchesSearch(i, searchText))
      .sort((a, b) => a.title.localeCompare(b.title, "sv"));
  }, [taggedData, statusFilter, searchText, team]);

  // --- Custom Search ---
  // Unscoped by team/area/iteration on purpose - an id or title fragment can match a card
  // anywhere in the project, so this is an explicit search action (not a live filter of an
  // already-loaded source) with its own wait splash while the request is in flight.
  const [customQuery, setCustomQuery] = useState("");
  const [customData, setCustomData] = useState<ProductBacklogResponse | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  async function runCustomSearch() {
    const q = customQuery.trim();
    if (q.length < 2) {
      setCustomError("Skriv minst två tecken.");
      return;
    }
    setCustomLoading(true);
    setCustomError(null);
    try {
      const result = await fetchRefinementSearch(q);
      setCustomData(result);
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : "Kunde inte söka bland korten.");
    } finally {
      setCustomLoading(false);
    }
  }

  // No status/text filtering here, unlike the other three sources - a targeted id/title search
  // should show exactly what Azure DevOps matched (a Closed card included), not silently drop
  // hits because the top toolbar's "Ej klara" default (meant for browsing a whole backlog) is
  // still selected.
  const customResults = customData?.items ?? [];

  const activeBacklog = source === "backlog" ? backlog : sprintData;
  const byId = useMemo(() => (activeBacklog ? itemsById(activeBacklog) : new Map<number, ProductBacklogItem>()), [activeBacklog]);

  const featureMatches = (feature: ProductBacklogItem) => {
    if (!matchesStatusFilter(feature, statusFilter)) {
      // A Feature that's itself "done" but still has open children should stay visible - the
      // filter describes what still needs refining, and an open child still does.
      const children = feature.childIds.map((id) => byId.get(id)).filter((c): c is ProductBacklogItem => !!c);
      if (!children.some((c) => matchesStatusFilter(c, statusFilter))) return false;
    }
    if (!searchText.trim()) return true;
    const children = feature.childIds.map((id) => byId.get(id)).filter((c): c is ProductBacklogItem => !!c);
    return matchesSearch(feature, searchText) || children.some((c) => matchesSearch(c, searchText));
  };

  const sections = useMemo(
    () => (backlog ? buildBacklogSections(backlog, featureMatches) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backlog, statusFilter, searchText],
  );

  const sprintGroups = useMemo(() => {
    if (!sprintData) return [];
    const groups = buildSprintGroups(sprintData);
    return groups
      .map((g) => ({
        ...g,
        children: g.children.filter(
          (c) => !isOtherTeamPoCard(c, team) && matchesStatusFilter(c, statusFilter) && matchesSearch(c, searchText),
        ),
      }))
      .filter((g) => g.children.length > 0);
  }, [sprintData, statusFilter, searchText, team]);

  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalFeatures = sections.reduce((sum, s) => sum + s.features.length, 0);

  // No getStory here - Refinement's rows are ProductBacklogItem, not the DailyStoryDto the
  // Definition of Done tab needs, so that tab just stays hidden. Everything else (Korthygien,
  // Behovsbedömning, INVEST, Godkännande) works the same as on every other board.
  const { setOpenWorkItemId, modals: workItemModals } = useWorkItemModals({ team });

  return (
    <BoardShell activeBoard="refinement" onNavigate={onNavigate} onHome={onHome} team={team} onTeamChange={onTeamChange} title="Refinement">
      <div className="rf-toolbar">
        <div className="dailys-board__group" role="group" aria-label="Källa">
          <span className="dailys-board__group-label">Källa</span>
          <div className="dailys-board__group-body">
            <button
              type="button"
              className={"dailys-board__tab" + (source === "backlog" ? " dailys-board__tab--active" : "")}
              onClick={() => setSource("backlog")}
            >
              Produktbacklogg
            </button>
            <button
              type="button"
              className={"dailys-board__tab" + (source === "sprint" ? " dailys-board__tab--active" : "")}
              onClick={() => setSource("sprint")}
            >
              Sprint
            </button>
            <button
              type="button"
              className={"dailys-board__tab" + (source === "tagged" ? " dailys-board__tab--active" : "")}
              onClick={() => setSource("tagged")}
            >
              Taggade kort
            </button>
            <button
              type="button"
              className={"dailys-board__tab" + (source === "custom" ? " dailys-board__tab--active" : "")}
              onClick={() => setSource("custom")}
            >
              Custom Search
            </button>
          </div>
        </div>

        {source === "backlog" && (
          <div className="rf-filters">
            <label className="rf-filters__field">
              <span>Produktboard</span>
              <select value={boardTeam} onChange={(e) => setBoardTeam(e.target.value)}>
                {boardTeams.length === 0 && <option value="">Laddar…</option>}
                {boardTeams.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="rf-filters__field">
              <span>Tagg</span>
              <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="valfri" />
            </label>
            <label className="rf-filters__field">
              <span>Iteration</span>
              <input type="text" value={iterationInput} onChange={(e) => setIterationInput(e.target.value)} placeholder="valfri" />
            </label>
            <label className="rf-filters__field">
              <span>Area Path</span>
              <input type="text" value={areaPathInput} onChange={(e) => setAreaPathInput(e.target.value)} placeholder="Alla Area Paths" />
            </label>
            <button type="button" className="wi-btn wi-btn--primary" onClick={() => void loadBacklog()} disabled={backlogLoading || !boardTeam}>
              {backlogLoading ? "Hämtar…" : "Hämta"}
            </button>
            {backlog && (
              <span className="rf-filters__summary">
                {totalFeatures} Features · {backlog.board?.team}
              </span>
            )}
          </div>
        )}

        {source === "sprint" && (
          <div className="rf-filters">
            <label className="rf-filters__field">
              <span>Sprint</span>
              <select value={selectedSprint} onChange={(e) => setSelectedSprint(e.target.value)}>
                {sprintOptions.map((o) => (
                  <option key={o.path} value={o.path}>
                    {releaseLabel(o.releaseFolder)} {o.name}
                    {o.isCurrent ? " (nu)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {sprintLoading && <span className="rf-filters__summary">Hämtar…</span>}
          </div>
        )}

        {source === "tagged" && (
          <div className="rf-filters">
            <label className="rf-filters__field">
              <span>Version</span>
              <select value={selectedRelease} onChange={(e) => setSelectedRelease(e.target.value)}>
                {releaseOptions.map((r) => (
                  <option key={r.folder} value={r.folder}>
                    {r.label}
                    {r.isCurrent ? " (nu)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {(releaseOptionsLoading || taggedLoading) && <span className="rf-filters__summary">Hämtar…</span>}
            {taggedData && !taggedLoading && <span className="rf-filters__summary">{taggedMatches.length} taggade kort</span>}
          </div>
        )}

        {source === "custom" && (
          <div className="rf-filters">
            <label className="rf-filters__field">
              <span>ID eller rubrik</span>
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runCustomSearch();
                }}
                placeholder="t.ex. 12345 eller ett ord ur rubriken"
              />
            </label>
            <button
              type="button"
              className="wi-btn wi-btn--primary"
              onClick={() => void runCustomSearch()}
              disabled={customLoading || customQuery.trim().length < 2}
            >
              {customLoading ? "Söker…" : "Sök"}
            </button>
            {customData && !customLoading && <span className="rf-filters__summary">{customResults.length} kort</span>}
          </div>
        )}

        <div className="dailys-board__filter">
          <input
            type="text"
            className="rf-search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Sök Feature, Epic, User Story, Bug eller tagg."
          />
          <select className="rf-status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilterKey)}>
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {source === "backlog" && (
        <>
          {backlogLoading && <LoadingOverlay message="Hämtar produktbackloggen…" />}
          {backlogError && <p className="dailys-board__status dailys-board__status--error">Fel: {backlogError}</p>}
          {backlog && (
            <div className="rf-sections">
              {sections.map((section) => {
                const isOpen = !collapsed.has(section.key);
                return (
                  <div className={`rf-section rf-section--${section.kind}`} key={section.key}>
                    <button
                      type="button"
                      className="rf-section__head"
                      style={section.color ? { background: `#${section.color.replace("#", "")}` } : undefined}
                      onClick={() => toggleSection(section.key)}
                    >
                      <span className="rf-section__chevron">{isOpen ? "▾" : "▸"}</span>
                      <span className="rf-section__label">{section.label}</span>
                      <span className="rf-section__count">{section.features.length} Features</span>
                    </button>
                    {isOpen && section.kind === "row" && (
                      <div className="rf-lanes">
                        {section.lanes.map((lane) => (
                          <div className="rf-lane" key={lane.key}>
                            <div className="rf-lane__head">
                              <span className="rf-lane__label">{lane.label}</span>
                              <span className="rf-lane__count">{lane.features.length}</span>
                            </div>
                            <div className="rf-lane__body">
                              {lane.features.length === 0 ? (
                                <p className="rf-lane__empty">Tom lane</p>
                              ) : (
                                lane.features.map((f) => <FeatureBlock key={f.id} feature={f} byId={byId} onOpen={setOpenWorkItemId} />)
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {isOpen && section.kind !== "row" && (
                      <div className="rf-section__body">
                        {section.features.length === 0 ? (
                          <p className="rf-section__empty">Inga Features matchar filtren i denna lane.</p>
                        ) : (
                          section.features.map((f) => <FeatureBlock key={f.id} feature={f} byId={byId} onOpen={setOpenWorkItemId} />)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {source === "sprint" && (
        <>
          {(sprintOptionsLoading || sprintLoading) && <LoadingOverlay message="Hämtar sprintens kort…" />}
          {sprintError && <p className="dailys-board__status dailys-board__status--error">Fel: {sprintError}</p>}
          {sprintData && (
            <div className="rf-sections">
              {sprintGroups.length === 0 && <p className="dailys-board__status">Inga kort matchar filtret.</p>}
              {sprintGroups.map((group) => (
                <div className="rf-feature" key={group.feature?.id ?? "unassigned"}>
                  <EpicChain chain={group.chain} onOpen={setOpenWorkItemId} />
                  {group.feature ? (
                    <WorkItemRefCard item={toRelationRef(group.feature)} onOpen={() => setOpenWorkItemId(group.feature!.id)} />
                  ) : (
                    <div className="rf-feature__no-parent">Utan Feature-koppling</div>
                  )}
                  <div className="rf-feature__children">
                    {group.children.map((c) => (
                      <WorkItemRefCard key={c.id} item={toRelationRef(c)} onOpen={() => setOpenWorkItemId(c.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {source === "tagged" && (
        <>
          {(releaseOptionsLoading || taggedLoading) && <LoadingOverlay message="Hämtar taggade kort…" />}
          {taggedError && <p className="dailys-board__status dailys-board__status--error">Fel: {taggedError}</p>}
          {taggedData && (
            <div className="rf-sections">
              {taggedMatches.length === 0 ? (
                <p className="dailys-board__status">Inga taggade kort matchar filtren.</p>
              ) : (
                taggedMatches.map((item) => <TaggedCardBlock key={item.id} item={item} byId={taggedById} onOpen={setOpenWorkItemId} />)
              )}
            </div>
          )}
        </>
      )}

      {source === "custom" && (
        <>
          {customLoading && <LoadingOverlay message="Söker i Azure DevOps…" />}
          {customError && <p className="dailys-board__status dailys-board__status--error">Fel: {customError}</p>}
          {customData && (
            <div className="rf-sections">
              {customResults.length === 0 ? (
                <p className="dailys-board__status">Inga kort matchar sökningen.</p>
              ) : (
                <div className="rf-feature__children">
                  {customResults.map((item) => (
                    <WorkItemRefCard key={item.id} item={toRelationRef(item)} onOpen={() => setOpenWorkItemId(item.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {workItemModals}
    </BoardShell>
  );
}
