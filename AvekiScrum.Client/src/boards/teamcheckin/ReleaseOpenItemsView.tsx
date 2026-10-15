import { useEffect, useState } from "react";
import { type DailyStoryDto, type DailyTaskDto } from "../../api/dailys";
import { useToast } from "../../components/Toast";
import { useWorkItemModals } from "../../components/workitem/useWorkItemModals";
import { updateWorkItemFields } from "../../api/workitems";
import { GroupCard } from "../dailys/GroupCard";
import { DOD_TAG, type FlowLaneStage, type StoryGroup } from "../dailys/dailysLogic";
import { prefetchReleaseData } from "./teamCheckInPrefetch";

// Mirrors DailysBoard's own lane maps - kept local since nothing else in this view touches the
// kanban drag/drop surface, only GroupCard's StoryTable does (via onTaskDrop).
const LANE_TO_AZURE_STATE: Record<FlowLaneStage, string> = { New: "New", Active: "Active", Resolved: "Resolved", Done: "Closed" };
const LANE_TO_STATUS: Record<FlowLaneStage, string> = { New: "New", Active: "Active", Resolved: "Active", Done: "Closed" };
const LANE_LABEL: Record<FlowLaneStage, string> = { New: "Ny", Active: "Aktiv", Resolved: "Löst", Done: "Klar" };

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
 *
 * The actual data-building (fetchSprints + a bunch of fetchDailys calls) lives in
 * teamCheckInPrefetch.ts, warmed up by ScrumMasterView as soon as its own data is ready - this just
 * awaits whatever that returns, so switching here mid-meeting is usually instant instead of cold.
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
    prefetchReleaseData()
      .then((built) => {
        if (cancelled) return;
        setGroups(built);
        setOpenGroups(new Set(built.map((g) => g.id)));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Kunde inte hämta äldre sprintar.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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
