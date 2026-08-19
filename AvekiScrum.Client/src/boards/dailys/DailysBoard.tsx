import { useCallback, useEffect, useMemo, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { useToast } from "../../components/Toast";
import { fetchDailys, type DailysResponse, type DeveloperTeamId } from "../../api/dailys";
import { fetchSprintGoals, type SprintGoal } from "../../api/sprintGoals";
import { fetchTeamRoles } from "../../api/people";
import { updateWorkItemFields } from "../../api/workitems";
import { DailyFlow } from "./DailyFlow";
import { FilterPanel, type TagFilterState } from "./FilterPanel";
import { GroupCard } from "./GroupCard";
import { KpiStrip } from "./KpiStrip";
import { SprintGoalModal } from "./SprintGoalModal";
import { WorkItemModal } from "../../components/workitem/WorkItemModal";
import { WorkItemValidationModal } from "../../components/workitem/WorkItemValidationModal";
import { buildGroups, type GroupMode, type FlowLaneStage } from "./dailysLogic";
import "./DailysBoard.css";

const LANE_TO_AZURE_STATE: Record<FlowLaneStage, string> = {
  New: "New",
  Active: "Active",
  Resolved: "Resolved",
  Done: "Closed",
};

// Mirrors the backend's DeriveTaskStatus: Resolved state still reports status "Active" (there is
// no separate "Resolved" status value), only New/Closed get their own status.
const LANE_TO_STATUS: Record<FlowLaneStage, string> = {
  New: "New",
  Active: "Active",
  Resolved: "Active",
  Done: "Closed",
};

const LANE_LABEL: Record<FlowLaneStage, string> = {
  New: "Ny",
  Active: "Aktiv",
  Resolved: "Löst",
  Done: "Klar",
};

const TEAMS: { id: DeveloperTeamId; label: string }[] = [
  { id: "Nord", label: "Team Nord" },
  { id: "Syd", label: "Team Syd" },
];

export function DailysBoard() {
  const { showToast } = useToast();
  const [team, setTeam] = useState<DeveloperTeamId>("Syd");
  const [mode, setMode] = useState<GroupMode>("goals");
  const [data, setData] = useState<DailysResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string> | null>(null);
  const [tagFilters, setTagFilters] = useState<Map<string, TagFilterState>>(new Map());
  const [openWorkItemId, setOpenWorkItemId] = useState<number | null>(null);
  const [openValidationId, setOpenValidationId] = useState<number | null>(null);
  const [sprintGoals, setSprintGoals] = useState<SprintGoal[]>([]);
  const [developerRoster, setDeveloperRoster] = useState<string[]>([]);
  const [openSprintGoalNumber, setOpenSprintGoalNumber] = useState<number | null>(null);
  const [dailyFlowActive, setDailyFlowActive] = useState(false);
  const [flowHighlightGroupId, setFlowHighlightGroupId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchDailys(team, controller.signal)
      .then((response) => {
        setData(response);
        setOpenGroups(new Set());
        setSelectedStatuses(null); // reset to "all" for the freshly loaded team's status set
        setTagFilters(new Map());
        setDailyFlowActive(false);
        setFlowHighlightGroupId(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // An aborted request (StrictMode's double-invoke, or a fast team switch) is not a
        // real failure - the effect that superseded it owns setting loading/data/error next.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [team]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSprintGoals(team, controller.signal)
      .then((goals) => setSprintGoals(goals))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Sprint goals are a nice-to-have overlay on top of the Azure DevOps card data - if the
        // Wiki page can't be reached, the board should keep working with plain tag labels.
        setSprintGoals([]);
      });
    return () => controller.abort();
  }, [team]);

  // Drives which names get their own top-level "developer" group: this team's actual developer
  // roster, not just whoever happens to be attached to a card - a QA consultant testing a card,
  // or a developer from the other team helping out, shouldn't get a standalone group here.
  useEffect(() => {
    const controller = new AbortController();
    fetchTeamRoles(team, controller.signal)
      .then((roles) => setDeveloperRoster(roles.developers.map((d) => d.displayName)))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Falls back to buildGroups' own card-derived grouping if the roster can't be loaded.
        setDeveloperRoster([]);
      });
    return () => controller.abort();
  }, [team]);

  // Re-fetches just the card/goal data for the current team, leaving filters, the daily flow,
  // and everything else on the page untouched - unlike a team switch, which intentionally resets
  // all of that for a fresh context.
  async function refreshBoard() {
    setRefreshing(true);
    setError(null);
    try {
      const [dailysResponse, goals] = await Promise.all([fetchDailys(team), fetchSprintGoals(team).catch(() => sprintGoals)]);
      setData(dailysResponse);
      setSprintGoals(goals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera boarden.");
    } finally {
      setRefreshing(false);
    }
  }

  const sprintGoalsByNumber = useMemo(() => new Map(sprintGoals.map((g) => [g.number, g])), [sprintGoals]);
  const openSprintGoal = openSprintGoalNumber !== null ? sprintGoalsByNumber.get(openSprintGoalNumber) ?? null : null;

  const stories = data?.teams[0]?.stories ?? [];

  const availableStatuses = useMemo(() => {
    const canonicalOrder = ["New", "Active", "Resolved", "Closed", "Done"];
    const present = new Set(stories.map((s) => s.azureStatus).filter(Boolean));
    const ordered = canonicalOrder.filter((s) => present.has(s));
    const rest = [...present].filter((s) => !canonicalOrder.includes(s)).sort();
    return [...ordered, ...rest];
  }, [stories]);

  const activeStatuses = selectedStatuses ?? new Set(availableStatuses);

  const availableTags = useMemo(() => {
    const present = new Set<string>();
    stories.forEach((s) => s.tags.forEach((t) => present.add(t)));
    return [...present].sort((a, b) => a.localeCompare(b, "sv"));
  }, [stories]);

  const filteredStories = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const includeTags = [...tagFilters.entries()].filter(([, state]) => state === "include").map(([t]) => t);
    const excludeTags = [...tagFilters.entries()].filter(([, state]) => state === "exclude").map(([t]) => t);
    return stories.filter((s) => {
      if (!activeStatuses.has(s.azureStatus)) return false;
      if (query && !s.title.toLowerCase().includes(query) && !String(s.id).includes(query)) return false;
      if (includeTags.some((tag) => !s.tags.includes(tag))) return false;
      if (excludeTags.some((tag) => s.tags.includes(tag))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, searchText, selectedStatuses, tagFilters]);

  // PO-owned cards are intentionally excluded from the developer-focused board (they're not
  // fetched to be worked on by a developer) but still need to reach the daily flow's PO turn, so
  // they stay in filteredStories and are only stripped out here, right before board rendering.
  const boardStories = useMemo(() => filteredStories.filter((s) => !s.ownedByProductOwner), [filteredStories]);

  const groups = useMemo(() => {
    const built = buildGroups(boardStories, mode, developerRoster);
    if (mode !== "goals") return built;
    // Sprint goals with zero cards right now still deserve a row - otherwise a goal nobody has
    // started work on yet would just silently never appear on the board.
    const presentNumbers = new Set(
      built.map((g) => Number(g.label.match(/\d+/)?.[0])).filter((n) => !Number.isNaN(n)),
    );
    const missingGoals = sprintGoals
      .filter((g) => !presentNumbers.has(g.number))
      .map((g) => ({
        id: `g-empty-${g.number}`,
        label: `Sprintmål ${g.number} - ${g.title}`,
        mode: "goals" as const,
        stories: [],
      }));
    // Every numbered goal (real or empty) sorted together by its number - the order stories
    // happened to appear in the API response isn't a meaningful sort key. The "(Inget
    // sprintmål)" catch-all - if present - always stays last.
    const catchAll = built.filter((g) => g.label === "(Inget sprintmål)");
    const numbered = [...built.filter((g) => g.label !== "(Inget sprintmål)"), ...missingGoals].sort(
      (a, b) => (Number(a.label.match(/\d+/)?.[0]) || 0) - (Number(b.label.match(/\d+/)?.[0]) || 0),
    );
    return [...numbered, ...catchAll];
  }, [boardStories, mode, sprintGoals, developerRoster]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeMode(next: GroupMode) {
    setMode(next);
    setOpenGroups(new Set());
    // A running flow's queue was built for the mode it started in (developer roster vs.
    // sprint-goal list) - switching mode mid-flow would leave it pointing at stale groups.
    setDailyFlowActive(false);
    setFlowHighlightGroupId(null);
  }

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) => {
      const base = prev ?? new Set(availableStatuses);
      const next = new Set(base);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const handleTaskAssigned = useCallback((taskId: number, displayName: string) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((t) => ({
              ...t,
              stories: t.stories.map((s) => ({
                ...s,
                tasks: s.tasks.map((task) => (task.id === taskId ? { ...task, assignedTo: displayName } : task)),
              })),
            })),
          }
        : prev,
    );
  }, []);

  const handleFlowHighlightChange = useCallback((groupId: string | null) => {
    setFlowHighlightGroupId(groupId);
    // Only the current developer's group should be expanded during the flow - collapse
    // everything else, even groups the user opened by hand before starting/advancing.
    setOpenGroups(groupId ? new Set([groupId]) : new Set());
    if (groupId) {
      // Wait for the collapse/expand reflow to settle before measuring positions, then scroll
      // so the group's own header lands just under the sticky flow panel - not centered, which
      // would push the header (and often several cards) above the visible viewport.
      window.setTimeout(() => {
        const target = document.getElementById(`group-${groupId}`);
        const flowPanel = document.querySelector(".daily-flow");
        if (!target) return;
        const flowHeight = flowPanel ? flowPanel.getBoundingClientRect().height : 0;
        const targetTop = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: targetTop - flowHeight - 12, behavior: "smooth" });
      }, 120);
    }
  }, []);

  function cycleTag(tag: string) {
    setTagFilters((prev) => {
      const next = new Map(prev);
      const state = next.get(tag);
      // off -> include (must have) -> exclude (must not have) -> off
      if (state === undefined) next.set(tag, "include");
      else if (state === "include") next.set(tag, "exclude");
      else next.delete(tag);
      return next;
    });
  }

  async function handleTaskDrop(taskId: number, targetLane: FlowLaneStage) {
    const previousData = data;
    // Optimistic move first - dragging should feel instant, not wait on a round-trip.
    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((t) => ({
              ...t,
              stories: t.stories.map((s) => ({
                ...s,
                tasks: s.tasks.map((task) =>
                  task.id === taskId ? { ...task, stage: targetLane, status: LANE_TO_STATUS[targetLane] } : task,
                ),
              })),
            })),
          }
        : prev,
    );

    try {
      await updateWorkItemFields(taskId, { state: LANE_TO_AZURE_STATE[targetLane] });
      showToast(`Task #${taskId} flyttad till "${LANE_LABEL[targetLane]}" och sparad i Azure DevOps.`, "success");
    } catch (err) {
      setData(previousData); // revert the optimistic move
      showToast(
        `Kunde inte flytta task #${taskId}: ${err instanceof Error ? err.message : "Okänt fel"}`,
        "error",
      );
    }
  }

  return (
    <BoardShell
      activeBoard="dailys"
      title="Dailys"
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
            <button
              className={"dailys-board__tab dailys-board__tab--mode" + (mode === "goals" ? " dailys-board__tab--active" : "")}
              onClick={() => changeMode("goals")}
            >
              Sprintmål
            </button>
            <button
              className={"dailys-board__tab dailys-board__tab--mode" + (mode === "developer" ? " dailys-board__tab--active" : "")}
              onClick={() => changeMode("developer")}
            >
              Utvecklare
            </button>
            <button
              className={"dailys-board__tab dailys-board__tab--mode" + (mode === "none" ? " dailys-board__tab--active" : "")}
              onClick={() => changeMode("none")}
            >
              Ogrupperat
            </button>
          </div>
        </div>

        <div className="dailys-board__group" role="group" aria-label="Åtgärder">
          <span className="dailys-board__group-label">Åtgärder</span>
          <div className="dailys-board__group-body">
            <button
              type="button"
              className="dailys-board__refresh"
              onClick={refreshBoard}
              disabled={refreshing || loading}
              title="Ladda om boardens innehåll (filter, daily-flöde m.m. påverkas inte)"
            >
              <span className={refreshing ? "dailys-board__refresh-icon dailys-board__refresh-icon--spin" : "dailys-board__refresh-icon"}>
                ⟳
              </span>
              {refreshing ? "Uppdaterar…" : "Uppdatera"}
            </button>
            {!dailyFlowActive && (
              <button className="dailys-board__tab dailys-board__flow-start" onClick={() => setDailyFlowActive(true)}>
                ▶ Starta Daily-flöde
              </button>
            )}
          </div>
        </div>

        <div className="dailys-board__filter">
          <FilterPanel
            searchText={searchText}
            onSearchTextChange={setSearchText}
            statuses={availableStatuses}
            selectedStatuses={activeStatuses}
            onToggleStatus={toggleStatus}
            onSelectAll={() => setSelectedStatuses(new Set(availableStatuses))}
            onSelectNone={() => setSelectedStatuses(new Set())}
            tags={availableTags}
            tagFilters={tagFilters}
            onCycleTag={cycleTag}
            onClearTags={() => setTagFilters(new Map())}
          />
        </div>
      </div>

      {loading && (
        <LoadingOverlay
          message="Hämtar data från Azure DevOps…"
          sub={data === null ? "Det här kan ta några sekunder första gången." : `Byter till ${TEAMS.find((t) => t.id === team)?.label ?? team}…`}
        />
      )}
      {error && <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>}

      {!loading && !error && (
        <>
          {dailyFlowActive && (
            <DailyFlow
              team={team}
              mode={mode}
              groups={groups}
              allStories={filteredStories}
              onHighlightChange={handleFlowHighlightChange}
              onOpenWorkItem={setOpenWorkItemId}
              onTaskAssigned={handleTaskAssigned}
              sprintGoalsByNumber={sprintGoalsByNumber}
              onOpenValidation={setOpenValidationId}
              onClose={() => setDailyFlowActive(false)}
            />
          )}
          <KpiStrip stories={boardStories} />
          <div className="dailys-board__groups">
            {groups.length === 0 && <p className="dailys-board__status">Inga kort matchar filtret.</p>}
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                isOpen={openGroups.has(group.id)}
                isFlowHighlighted={group.id === flowHighlightGroupId}
                onToggle={() => toggleGroup(group.id)}
                onOpenWorkItem={setOpenWorkItemId}
                onOpenValidation={setOpenValidationId}
                onTaskDrop={handleTaskDrop}
                sprintGoalsByNumber={sprintGoalsByNumber}
                onOpenSprintGoal={setOpenSprintGoalNumber}
              />
            ))}
          </div>
        </>
      )}

      {openWorkItemId !== null && (
        <WorkItemModal workItemId={openWorkItemId} onClose={() => setOpenWorkItemId(null)} onOpenValidation={setOpenValidationId} />
      )}
      {openSprintGoal && (
        <SprintGoalModal
          goal={openSprintGoal}
          onClose={() => setOpenSprintGoalNumber(null)}
          onOpenWorkItem={setOpenWorkItemId}
        />
      )}
      {openValidationId !== null && (
        <WorkItemValidationModal
          workItemId={openValidationId}
          team={team}
          onClose={() => setOpenValidationId(null)}
          onApproved={refreshBoard}
          onOpenRelation={(item) => {
            setOpenValidationId(null);
            setOpenWorkItemId(item.id);
          }}
        />
      )}
    </BoardShell>
  );
}
