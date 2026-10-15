
import { useEffect, useMemo, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { useToast } from "../../components/Toast";
import {
  fetchDailys,
  TEAM_OPTIONS,
  type DailysResponse,
  type DeveloperTeamId,
  type SprintOption,
} from "../../api/dailys";
import { useWorkItemModals } from "../../components/workitem/useWorkItemModals";
import { SprintPicker } from "../dailys/SprintPicker";
import { TestTaskBoard, type ExtraTestIteration } from "../dailys/TestTaskBoard";
import { applyWorkItemSave } from "../dailys/dailysLogic";
import { buildTestTaskRows } from "../dailys/testBoardLogic";
import { buildTestBoardExportHtml, downloadHtmlFile } from "../dailys/testExport";
import { TestIterationFilter } from "./TestIterationFilter";

interface TestBoardProps {
  onNavigate?: (board: "team-home" | "refinement" | "dailys" | "review" | "test" | "teamcheckin") => void;
  onHome?: () => void;
  team: DeveloperTeamId;
  onTeamChange: (team: DeveloperTeamId) => void;
}

function teamLabelFor(teamId: DeveloperTeamId): string {
  return TEAM_OPTIONS.find((t) => t.id === teamId)?.label ?? teamId;
}

function sprintLabelFor(response: DailysResponse): string {
  const start = new Date(response.meta.sprintStart).toLocaleDateString("sv-SE");
  const end = new Date(response.meta.sprintEnd).toLocaleDateString("sv-SE");
  return `${response.meta.sprint} (${start}–${end})`;
}

function filenameFor(teamId: DeveloperTeamId, sprint: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeSprint = sprint.trim().replace(/[^\w.-]+/g, "_");
  return `testboard-${teamId}-${safeSprint}-${stamp}.html`;
}

async function exportTeam(teamId: DeveloperTeamId, response: DailysResponse): Promise<void> {
  const rows = buildTestTaskRows(response.teams[0]?.stories ?? []);
  const html = await buildTestBoardExportHtml(rows, {
    teamLabel: teamLabelFor(teamId),
    sprintLabel: sprintLabelFor(response),
    generatedAt: new Date(),
  });
  downloadHtmlFile(filenameFor(teamId, response.meta.sprint), html);
}

/** Patches whichever story/task in `response` a save/reassignment touched - the same shape
 *  applyWorkItemSave and handleTaskAssigned already patch `data` with, just generic enough to
 *  reuse across every cached extra iteration too so an edit doesn't go stale the moment it's made
 *  on a card pulled in from an older sprint. */
function patchTask(response: DailysResponse, taskId: number, assignedTo: string): DailysResponse {
  return {
    ...response,
    teams: response.teams.map((loadedTeam) => ({
      ...loadedTeam,
      stories: loadedTeam.stories.map((story) => ({
        ...story,
        tasks: story.tasks.map((task) => (task.id === taskId ? { ...task, assignedTo } : task)),
      })),
    })),
  };
}

export function TestBoard({ onNavigate, onHome, team, onTeamChange }: TestBoardProps) {
  const [selectedIteration, setSelectedIteration] = useState<string | undefined>();
  const [data, setData] = useState<DailysResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"current" | "both" | null>(null);
  // The iteration filter's own state: which extra sprints are checked, their fetched data (kept
  // around so unchecking and re-checking the same one doesn't refetch), which are still in flight,
  // and whether their closed test tasks should count - see TestIterationFilter/TestTaskBoard.
  const [extraSelected, setExtraSelected] = useState<Map<string, SprintOption>>(new Map());
  const [extraData, setExtraData] = useState<Map<string, DailysResponse>>(new Map());
  const [extraLoading, setExtraLoading] = useState<Set<string>>(new Set());
  const [includeClosedFromExtra, setIncludeClosedFromExtra] = useState(false);
  const { showToast } = useToast();

  useEffect(() => setSelectedIteration(undefined), [team]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchDailys(team, controller.signal, selectedIteration)
      .then((response) => {
        setData(response);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [team, selectedIteration]);

  // "Older than X" only means something relative to whichever sprint is primary - switching team
  // or the main sprint picker starts the iteration filter over rather than carrying a now-stale
  // selection forward.
  useEffect(() => {
    setExtraSelected(new Map());
    setExtraData(new Map());
    setExtraLoading(new Set());
    setIncludeClosedFromExtra(false);
  }, [team, selectedIteration]);

  function toggleExtraIteration(option: SprintOption) {
    if (extraSelected.has(option.path)) {
      setExtraSelected((prev) => {
        const next = new Map(prev);
        next.delete(option.path);
        return next;
      });
      return;
    }

    setExtraSelected((prev) => new Map(prev).set(option.path, option));
    if (extraData.has(option.path)) return; // already fetched from an earlier toggle - reuse it

    setExtraLoading((prev) => new Set(prev).add(option.path));
    fetchDailys(team, undefined, option.path)
      .then((response) => setExtraData((prev) => new Map(prev).set(option.path, response)))
      .catch((err: unknown) => {
        showToast(`Kunde inte hämta ${option.name}: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
        setExtraSelected((prev) => {
          const next = new Map(prev);
          next.delete(option.path);
          return next;
        });
      })
      .finally(() => {
        setExtraLoading((prev) => {
          const next = new Set(prev);
          next.delete(option.path);
          return next;
        });
      });
  }

  const extraIterations = useMemo<ExtraTestIteration[]>(() => {
    const result: ExtraTestIteration[] = [];
    for (const option of extraSelected.values()) {
      const response = extraData.get(option.path);
      if (response) result.push({ path: option.path, label: response.meta.sprint, stories: response.teams[0]?.stories ?? [] });
    }
    return result;
  }, [extraSelected, extraData]);

  const stories = useMemo(() => data?.teams[0]?.stories ?? [], [data]);
  const allLoadedStories = useMemo(
    () => (extraIterations.length === 0 ? stories : [...stories, ...extraIterations.flatMap((it) => it.stories)]),
    [stories, extraIterations],
  );

  const { setOpenWorkItemId, modals: workItemModals } = useWorkItemModals({
    team,
    getStory: (id) => allLoadedStories.find((story) => story.id === id),
    onWorkItemSaved: (updated) => {
      setData((current) => (current ? applyWorkItemSave(current, updated) : current));
      // An edit can land on a card pulled in from an older sprint just as easily as on the current
      // one - patch every cached iteration, not just the primary one, so it doesn't go stale.
      setExtraData((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map<string, DailysResponse>();
        for (const [path, response] of prev) next.set(path, applyWorkItemSave(response, updated));
        return next;
      });
    },
  });

  function handleTaskAssigned(taskId: number, displayName: string) {
    setData((current) => (current ? patchTask(current, taskId, displayName) : current));
    setExtraData((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map<string, DailysResponse>();
      for (const [path, response] of prev) next.set(path, patchTask(response, taskId, displayName));
      return next;
    });
  }

  async function handleExportCurrent() {
    if (!data) return;
    setExporting("current");
    try {
      await exportTeam(team, data);
      showToast(`Testboard för ${teamLabelFor(team)} sparad i Hämtade filer.`, "success");
    } catch (err) {
      showToast(`Kunde inte exportera testboarden: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportBoth() {
    if (!data) return;
    setExporting("both");
    try {
      const otherTeam = TEAM_OPTIONS.find((t) => t.id !== team)?.id;
      if (!otherTeam) throw new Error("Hittade inte det andra teamet.");
      const otherResponse = await fetchDailys(otherTeam, undefined, selectedIteration);
      await exportTeam(team, data);
      await exportTeam(otherTeam, otherResponse);
      showToast(`Testboard sparad i Hämtade filer för ${teamLabelFor(team)} och ${teamLabelFor(otherTeam)}.`, "success");
    } catch (err) {
      showToast(`Kunde inte exportera testboarden: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
    } finally {
      setExporting(null);
    }
  }

  return (
    <BoardShell
      activeBoard="test"
      onNavigate={onNavigate}
      onHome={onHome}
      team={team}
      onTeamChange={onTeamChange}
      title="Test"
      subtitle={
        data && (
          <SprintPicker
            team={team}
            sprint={data.meta.sprint}
            sprintStart={data.meta.sprintStart}
            sprintEnd={data.meta.sprintEnd}
            sprintPath={data.meta.sprintPath}
            onSelect={setSelectedIteration}
          />
        )
      }
    >
      {loading && <LoadingOverlay message="Hämtar test-tasks…" />}
      {error && <p className="daily-flow__empty">Fel: {error}</p>}
      {!loading && !error && data && (
        <>
          <div className="test-board__toprow">
            <TestIterationFilter
              team={team}
              currentPath={data.meta.sprintPath}
              selectedPaths={new Set(extraSelected.keys())}
              onToggle={toggleExtraIteration}
              loadingPaths={extraLoading}
              includeClosed={includeClosedFromExtra}
              onToggleIncludeClosed={() => setIncludeClosedFromExtra((v) => !v)}
            />
            <div className="test-board__export">
              <button
                type="button"
                className="wi-btn"
                onClick={() => void handleExportCurrent()}
                disabled={exporting !== null}
                title="Sparar en fristående html-fil med hela testboarden - länkarna går direkt in i Azure DevOps."
              >
                {exporting === "current" ? "Exporterar…" : `Exportera ${teamLabelFor(team)}`}
              </button>
              <button
                type="button"
                className="wi-btn"
                onClick={() => void handleExportBoth()}
                disabled={exporting !== null}
                title="Sparar en html-fil per team."
              >
                {exporting === "both" ? "Exporterar…" : "Exportera bägge"}
              </button>
            </div>
          </div>
          <TestTaskBoard
            allStories={stories}
            onOpenWorkItem={setOpenWorkItemId}
            onTaskAssigned={handleTaskAssigned}
            currentIteration={{ path: data.meta.sprintPath, label: data.meta.sprint }}
            extraIterations={extraIterations}
            includeClosedFromExtra={includeClosedFromExtra}
          />
        </>
      )}
      {workItemModals}
    </BoardShell>
  );
}
