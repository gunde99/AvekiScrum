import { fetchDailys, fetchSprints, type DailysResponse, type DeveloperTeamId } from "../../api/dailys";
import type { StoryGroup } from "../dailys/dailysLogic";

const TEAMS: DeveloperTeamId[] = ["Nord", "Syd"];

/**
 * Warms up the Release/Test-ansvarig step's own (heavy) data in the background while the Scrum
 * Master step is still showing - see ScrumMasterView, the only caller of the two prefetch functions
 * below. By the time the agenda actually reaches Release/Test-ansvarig, CombinedTestView and
 * ReleaseOpenItemsView just await the same already-in-flight (often already-settled) promise
 * instead of starting cold.
 *
 * Deliberately simple module-level caching, not a general-purpose query cache: this board is a
 * short-lived, single-sitting view of one meeting, not something left open across sprint changes.
 */

export interface TestPrefetchData {
  nord: DailysResponse;
  syd: DailysResponse;
}

let testDataPromise: Promise<TestPrefetchData> | null = null;

export function prefetchTestData(): Promise<TestPrefetchData> {
  if (!testDataPromise) {
    testDataPromise = Promise.all([fetchDailys("Nord"), fetchDailys("Syd")]).then(([nord, syd]) => ({ nord, syd }));
  }
  return testDataPromise;
}

let releaseDataPromise: Promise<StoryGroup[]> | null = null;

export function prefetchReleaseData(): Promise<StoryGroup[]> {
  if (!releaseDataPromise) {
    releaseDataPromise = buildReleaseGroups();
  }
  return releaseDataPromise;
}

async function buildReleaseGroups(): Promise<StoryGroup[]> {
  const perTeamSprints = await Promise.all(TEAMS.map((t) => fetchSprints(t)));
  // One job per (team, sprint) to look at, built up front so every fetchDailys call below can run
  // concurrently instead of one at a time - see ReleaseOpenItemsView's original comment on why that
  // matters (a sequential loop turned a handful of old sprints into a multi-minute wait).
  const jobs: { team: DeveloperTeamId; sprintPath: string; sprintName: string }[] = [];
  for (let i = 0; i < TEAMS.length; i++) {
    const team = TEAMS[i];
    const sprints = perTeamSprints[i];
    const current = sprints.find((s) => s.isCurrent);
    const older = current
      ? sprints.filter((s) => !s.isCurrent && new Date(s.startDate).getTime() < new Date(current.startDate).getTime())
      : sprints.filter((s) => !s.isCurrent);
    // Capped to the 4 most recent per team - see ReleaseOpenItemsView's original rationale.
    const recentOlder = [...older].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 4);
    for (const sprint of recentOlder) {
      jobs.push({ team, sprintPath: sprint.path, sprintName: sprint.name });
    }
  }

  const responses = await Promise.all(jobs.map((j) => fetchDailys(j.team, undefined, j.sprintPath)));
  const built: StoryGroup[] = [];
  jobs.forEach((job, i) => {
    const response = responses[i];
    const openStories = (response.teams[0]?.stories ?? []).filter((s) => (s.azureStatus || "").trim().toLowerCase() !== "closed");
    if (openStories.length > 0) {
      built.push({ id: `${job.team}|${job.sprintPath}`, label: `Team ${job.team} - ${job.sprintName}`, mode: "none", stories: openStories });
    }
  });
  built.sort((a, b) => b.id.localeCompare(a.id));
  return built;
}
