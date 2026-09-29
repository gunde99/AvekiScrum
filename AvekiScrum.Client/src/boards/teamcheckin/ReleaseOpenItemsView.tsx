import { useEffect, useState } from "react";
import { fetchDailys, fetchSprints, type DailyStoryDto, type DailyTaskDto, type DeveloperTeamId } from "../../api/dailys";
import { useToast } from "../../components/Toast";
import { useWorkItemModals } from "../../components/workitem/useWorkItemModals";
import { updateWorkItemFields } from "../../api/workitems";
import { GroupCard } from "../dailys/GroupCard";
import { DOD_TAG, type FlowLaneStage, type StoryGroup } from "../dailys/dailysLogic";

// Mirrors DailysBoard's own lane maps - kept local since nothing else in this view touches the
// kanban drag/drop surface, only GroupCard's StoryTable does (via onTaskDrop).
const LANE_TO_AZURE_STATE: Record<FlowLaneStage, string> = { New: "New", Active: "Active", Resolved: "Resolved", Done: "Closed" };
const LANE_TO_STATUS: Record<FlowLaneStage, string> = { New: "New", Active: "Active", Resolved: "Active", Done: "Closed" };
const LANE_LABEL: Record<FlowLaneStage, string> = { New: "Ny", Active: "Aktiv", Resolved: "Löst", Done: "Klar" };

const TEAMS: DeveloperTeamId[] = ["Nord", "Syd"];

function updateStory(groups: StoryGroup[], storyId: number, updater: (s: DailyStoryDto) => DailyStoryDto): StoryGroup[] {
  return groups.map((g) => ({ ...g, stories: g.stories.map((s) => (s.id === storyId ? updater(s) : s)) }));
}

function updateTask(groups: StoryGroup[], taskId: number, updater: (t: DailyTaskDto) => DailyTaskDto): StoryGroup[] {
  return groups.map((g) => ({ ...g, stories: g.stories.map((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === taskId ? updater(t) : t)) })) }));
}

/**
 * The Release tab of Release/Test-ansvarigs agenda step: cards left lingering, still open, in
 * sprints that have otherwise moved on - exactly the "forgot to close this one" cards a release
 * check exists to surface. One group per (team, sprint), rendered with the same GroupCard/StoryTable
 * the daily board itself uses, auto-expanded since the whole point is to see everything at once.
 */
export function ReleaseOpenItemsView() {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<StoryGroup[] | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const perTeamSprints = await Promise.all(TEAMS.map((t) => fetchSprints(t)));
        // One job per (team, sprint) to look at - built up front so every fetchDailys call below
        // can run concurrently instead of one at a time. fetchDailys does a full per-story PR/test-
        // timeline enrichment (see DailyDashboardDataBuilder), so awaiting these in a loop instead
        // of together turned a handful of old sprints into a multi-minute wait in practice.
        const jobs: { team: DeveloperTeamId; sprintPath: string; sprintName: string }[] = [];
        for (let i = 0; i < TEAMS.length; i++) {
          const team = TEAMS[i];
          const sprints = perTeamSprints[i];
          const current = sprints.find((s) => s.isCurrent);
          // Only genuinely past sprints - fetchSprints' own window can include the release ahead
          // of the current one too, which has nothing "left over" to report yet.
          const older = current
            ? sprints.filter((s) => !s.isCurrent && new Date(s.startDate).getTime() < new Date(current.startDate).getTime())
            : sprints.filter((s) => !s.isCurrent);
          // Capped to the 4 most recent - a card still open from a year ago is real, but chasing
          // every sprint the project has ever had would make this view too slow to be worth opening
          // during a meeting. Most recent first, so the cap keeps the sprints that matter most.
          const recentOlder = [...older].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 4);
          for (const sprint of recentOlder) {
            jobs.push({ team, sprintPath: sprint.path, sprintName: sprint.name });
          }
        }

        const responses = await Promise.all(jobs.map((j) => fetchDailys(j.team, undefined, j.sprintPath)));
        const built: StoryGroup[] = [];
        jobs.forEach((job, i) => {
          const response = responses[i];
          const openStories = (response.teams[0]?.stories ?? []).filter(
            (s) => (s.azureStatus || "").trim().toLowerCase() !== "closed",
          );
          if (openStories.length > 0) {
            built.push({ id: `${job.team}|${job.sprintPath}`, label: `Team ${job.team} - ${job.sprintName}`, mode: "none", stories: openStories });
          }
        });
        // Most recently started sprint first - the freshest "still shouldn't be open" cards matter most.
        built.sort((a, b) => b.id.localeCompare(a.id));
        if (!cancelled) {
          setGroups(built);
          setOpenGroups(new Set(built.map((g) => g.id)));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Kunde inte hämta äldre sprintar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { setOpenWorkItemId, setOpenValidationId, modals } = useWorkItemModals({
    team: "Nord",
    getStory: (id) => groups?.flatMap((g) => g.stories).find((s) => s.id === id),
    onDodApproved: (storyId) =>
      setGroups((prev) =>
        prev ? updateStory(prev, storyId, (s) => (s.tags.includes(DOD_TAG) ? s : { ...s, tags: [...s.tags, DOD_TAG] })) : prev,
      ),
  });

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function quickSetState(story: DailyStoryDto, state: string) {
    const previous = story.azureStatus;
    setGroups((prev) => (prev ? updateStory(prev, story.id, (s) => ({ ...s, azureStatus: state })) : prev));
    try {
      await updateWorkItemFields(story.id, { state });
      showToast(`#${story.id} satt till "${state}".`, "success");
    } catch (err) {
      setGroups((prev) => (prev ? updateStory(prev, story.id, (s) => ({ ...s, azureStatus: previous })) : prev));
      showToast(`Kunde inte ändra #${story.id}: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
    }
  }

  async function quickApproveDod(story: DailyStoryDto) {
    try {
      await updateWorkItemFields(story.id, { tags: [...story.tags, DOD_TAG] });
      setGroups((prev) => (prev ? updateStory(prev, story.id, (s) => ({ ...s, tags: [...s.tags, DOD_TAG] })) : prev));
      showToast(`#${story.id} godkänd enligt Definition of Done.`, "success");
    } catch (err) {
      showToast(`Kunde inte godkänna #${story.id}: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
    }
  }

  async function handleTaskDrop(taskId: number, targetLane: FlowLaneStage) {
    const before = groups;
    setGroups((prev) => (prev ? updateTask(prev, taskId, (t) => ({ ...t, stage: targetLane, status: LANE_TO_STATUS[targetLane] })) : prev));
    try {
      await updateWorkItemFields(taskId, { state: LANE_TO_AZURE_STATE[targetLane] });
      showToast(`Task #${taskId} flyttad till "${LANE_LABEL[targetLane]}".`, "success");
    } catch (err) {
      setGroups(before);
      showToast(`Kunde inte flytta task #${taskId}: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
    }
  }

  if (loading) return <p className="dailys-board__status">Letar igenom äldre sprintar för båda teamen…</p>;
  if (error) return <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>;
  if (!groups || groups.length === 0) return <p className="dailys-board__status">Inga öppna kort hittades i äldre sprintar. 🎉</p>;

  return (
    <div className="dailys-board__groups">
      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          isOpen={openGroups.has(group.id)}
          onToggle={() => toggleGroup(group.id)}
          onOpenWorkItem={setOpenWorkItemId}
          onOpenValidation={setOpenValidationId}
          onQuickApproveDod={quickApproveDod}
          onQuickSetState={quickSetState}
          onTaskDrop={handleTaskDrop}
        />
      ))}
      {modals}
    </div>
  );
}
