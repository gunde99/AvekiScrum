import { useEffect, useState } from "react";
import { fetchDailys, type DailysResponse, type DailyStoryDto } from "../../api/dailys";
import { TestTaskBoard } from "../dailys/TestTaskBoard";
import { applyWorkItemSave } from "../dailys/dailysLogic";
import { useWorkItemModals } from "../../components/workitem/useWorkItemModals";

type TeamFilter = "Nord" | "Syd" | "Alla";

/** Patches whichever story/task a save/reassignment touched, across both teams' cached responses -
 *  same idea as TestBoard.tsx's own patchTask, just fanned out over two fixed team slots instead of
 *  a dynamic map of extra iterations. */
function patchTaskAssignment(response: DailysResponse, taskId: number, assignedTo: string): DailysResponse {
  return {
    ...response,
    teams: response.teams.map((team) => ({
      ...team,
      stories: team.stories.map((story) => ({
        ...story,
        tasks: story.tasks.map((task) => (task.id === taskId ? { ...task, assignedTo } : task)),
      })),
    })),
  };
}

/**
 * The Test tab of Release/Test-ansvarigs agenda step: the same TestTaskBoard used everywhere else,
 * fed both teams' current-sprint stories at once - "kombinerad med bägge teamen" - with a team
 * filter layered on top. Status filtering and free-text search are already built into
 * TestTaskBoard itself, so this only adds the one thing it doesn't have: which team(s) to include.
 */
export function CombinedTestView() {
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("Alla");
  const [nordData, setNordData] = useState<DailysResponse | null>(null);
  const [sydData, setSydData] = useState<DailysResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchDailys("Nord"), fetchDailys("Syd")])
      .then(([nord, syd]) => {
        if (cancelled) return;
        setNordData(nord);
        setSydData(syd);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Kunde inte hämta testkort.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nordStories: DailyStoryDto[] = nordData?.teams[0]?.stories ?? [];
  const sydStories: DailyStoryDto[] = sydData?.teams[0]?.stories ?? [];
  const combined = teamFilter === "Alla" ? [...nordStories, ...sydStories] : teamFilter === "Nord" ? nordStories : sydStories;

  const { setOpenWorkItemId, modals } = useWorkItemModals({
    // Only used by the Validering sub-flow's own team-scoped side effects - a fixed value is
    // harmless here since this view's cards can come from either team.
    team: "Nord",
    onWorkItemSaved: (updated) => {
      setNordData((prev) => (prev ? applyWorkItemSave(prev, updated) : prev));
      setSydData((prev) => (prev ? applyWorkItemSave(prev, updated) : prev));
    },
  });

  function handleTaskAssigned(taskId: number, displayName: string) {
    setNordData((prev) => (prev ? patchTaskAssignment(prev, taskId, displayName) : prev));
    setSydData((prev) => (prev ? patchTaskAssignment(prev, taskId, displayName) : prev));
  }

  if (loading) return <p className="dailys-board__status">Hämtar testkort för båda teamen…</p>;
  if (error) return <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>;

  return (
    <div>
      <div className="tcb-test__filter" role="group" aria-label="Team">
        {(["Alla", "Nord", "Syd"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={"dailys-board__tab" + (teamFilter === t ? " dailys-board__tab--active" : "")}
            onClick={() => setTeamFilter(t)}
          >
            {t === "Alla" ? "Båda teamen" : `Team ${t}`}
          </button>
        ))}
      </div>
      <TestTaskBoard
        allStories={combined}
        onOpenWorkItem={setOpenWorkItemId}
        onTaskAssigned={handleTaskAssigned}
        currentIteration={nordData ? { path: nordData.meta.sprintPath, label: nordData.meta.sprint } : undefined}
      />
      {modals}
    </div>
  );
}
