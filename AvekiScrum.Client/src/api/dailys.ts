import { apiFetch, describeFailure } from "../lib/apiFetch";
export type DeveloperTeamId = "Nord" | "Syd";

/** The two teams, everywhere a page needs to offer a switcher - see BoardShell's header, which is
 *  the one place team is actually chosen now that every board tab shares it. */
export const TEAM_OPTIONS: { id: DeveloperTeamId; label: string }[] = [
  { id: "Nord", label: "Team Nord" },
  { id: "Syd", label: "Team Syd" },
];

export interface DailyTaskDto {
  id: number;
  key: number;
  storyId: number;
  title: string;
  stage: string; // New | Active | Resolved | Done | CodeReview | Test | Documentation
  status: string; // New | Active | Resolved | Closed | NotOk
  assignedTo: string | null;
  activity: string | null;
  isBlocked: boolean;
  tags: string[];
  priority: number | null;
  createdDate: string | null;
  completedDate: string | null;
  statusChangedDate: string | null;
  /** When the task first got an owner - used instead of statusChangedDate for "time in status" on
   *  an assigned-but-not-started test task, where what matters is how long it's sat with someone
   *  rather than how long since its Azure state last changed. */
  assignedDate: string | null;
  webUrl: string;
}

export interface DailyPullRequestDto {
  pullRequestId: number;
  storyId: number;
  sourceTaskId: number | null;
  title: string;
  status: string;
  targetBranch: string;
  reviewers: string[];
  webUrl: string;
  createdDate: string | null;
  closedDate: string | null;
  createdBy: string | null;
  createdByUniqueName: string | null;
}

export interface DailyStoryDto {
  id: number;
  key: number;
  type: string; // "User Story" | "Bug"
  title: string;
  azureStatus: string;
  lastChangedDate: string | null;
  createdDate: string | null;
  addedDuringSprint: boolean;
  developer: string | null;
  developmentPartner: string | null;
  assignedTeam: string | null;
  areaPath: string | null;
  /** Azure DevOps "Source" på buggar: Customer | Development | Internal | Test | Unset. Tomt/null
   *  för korttyper som inte har fältet (t.ex. stories). */
  source: string | null;
  /** Underlaget för korthygienvarningarna på raden - se korthygienWarnings i dailysLogic. */
  hasParent: boolean;
  hasDescription: boolean;
  hasAcceptanceCriteria: boolean;
  tags: string[];
  stakeholders: string[];
  sprintGoal: string;
  storyPoints: number;
  stage: string; // New | Development | CodeReview | Testing | Documentation | Done
  stageLabel: string;
  alertLevel: "None" | "Notice" | "Warning" | "Critical" | string;
  alertSummary: string;
  alertDetails: string[];
  releaseBranchWarnings: string[];
  webUrl: string;
  completedDate: string | null;
  /** True when the card's owner is the team's own PO rather than a developer - such cards are
   *  intentionally left out of the developer-focused sprint board, but should still surface
   *  during the daily flow's PO turn. */
  ownedByProductOwner: boolean;
  tasks: DailyTaskDto[];
  pullRequests: DailyPullRequestDto[];
}

export interface DailyTeamDto {
  id: string;
  name: string;
  sprintBoardUrl: string;
  stories: DailyStoryDto[];
}

export interface DailysResponse {
  meta: {
    sprint: string;
    sprintStart: string;
    sprintEnd: string;
    /** The iteration path - round-tripped back as ?iteration=... when switching sprints via the
     *  picker, and used to anchor the picker's own list on whichever sprint is on screen. */
    sprintPath: string;
    generatedAt: string;
  };
  teams: DailyTeamDto[];
}

/** One entry in the sprint picker's list - see SprintPicker.tsx. */
export interface SprintOption {
  path: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  /** Iteration path of the release folder this sprint belongs to - sprints from the same release
   *  are grouped under one heading in the picker. */
  releaseFolder: string;
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

// On a fresh `start-local.bat` run the API (dotnet run) can still be starting up when the
// client's first request goes out, which surfaces as a network-level "Failed to fetch" rather
// than an HTTP error. Retry to ride out that cold-start window.
//
// ~30s of patience: a cold start does a NuGet restore plus a full build, which measured well
// past the 4.5s the first version allowed - so it still failed in exactly the case it was
// written for. Costs nothing when the API is already up (the first attempt just succeeds), and
// aborts (team switch, unmount) still bail out immediately.
async function fetchWithRetry(url: string, signal: AbortSignal | undefined, attempts = 20, delayMs = 1500): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await apiFetch(url, { signal });
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** `iteration` pins the board to that sprint instead of the date-based default - the sprint
 *  picker's job. Omit it for the normal "today's sprint" behaviour. */
export async function fetchDailys(team: DeveloperTeamId, signal?: AbortSignal, iteration?: string): Promise<DailysResponse> {
  const params = new URLSearchParams({ team });
  if (iteration) params.set("iteration", iteration);
  const response = await fetchWithRetry(`${API_BASE_URL}/api/dailys?${params}`, signal);
  if (!response.ok) {
    throw new Error(await describeFailure(response, `Kunde inte hämta dailys för team ${team}`));
  }
  return (await response.json()) as DailysResponse;
}

/** One person's stories, freshly rebuilt - the response shape from /api/dailys/person. */
export interface DailyPersonResponse {
  team: string;
  person: string;
  generatedAt: string;
  stories: DailyStoryDto[];
}

/** Refreshes just one person's cards instead of the whole team's board - see the comment on
 *  DailyDashboardDataBuilder.BuildPersonJsonAsync for why this comes back faster than fetchDailys.
 *  Used by the daily-flow's "Uppdatera korten" button so a card that just changed under someone's
 *  turn can be re-checked without waiting out a full-team refresh. */
export async function fetchDailyPerson(
  team: DeveloperTeamId,
  person: string,
  signal?: AbortSignal,
  iteration?: string,
): Promise<DailyPersonResponse> {
  const params = new URLSearchParams({ team, person });
  if (iteration) params.set("iteration", iteration);
  const response = await apiFetch(`${API_BASE_URL}/api/dailys/person?${params}`, { signal });
  if (!response.ok) {
    throw new Error(await describeFailure(response, `Kunde inte uppdatera kort för ${person}`));
  }
  return (await response.json()) as DailyPersonResponse;
}

/** One incheckningssiffra from a finished daily-flow round - see DailyFlow.tsx's persistCheckIns. */
export interface DailyCheckInEntry {
  /** "developer" | "goal" | "po" | "testlead" - which flow turn this came from. */
  kind: string;
  /** The flow step's own key - a developer/goal group id, or "po"/"testlead". */
  key: string;
  /** Display label at the time of check-in (person name, goal title, "Product Owner", …). */
  label: string;
  score: number;
}

/**
 * Saves a finished daily flow's check-in numbers. Upserted server-side by (team, sprintPath, date,
 * kind, key) - a repeated save for the same calendar day (a practice run of the flow before the
 * real daily, say) overwrites that day's numbers rather than piling up a duplicate, so this is
 * safe to call every time the flow completes without tracking whether it already ran today.
 */
export async function saveDailyCheckIns(request: {
  team: DeveloperTeamId;
  sprintPath: string;
  sprintName: string;
  /** yyyy-MM-dd, the local calendar day the daily was run. */
  date: string;
  entries: DailyCheckInEntry[];
}): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/dailys/checkins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte spara incheckningssiffrorna"));
  }
}

/** One card's net Story Points change after a given cutoff - see /api/dailys/story-points-changes. */
export interface StoryPointsChangeDto {
  id: number;
  oldStoryPoints: number;
  newStoryPoints: number;
  changedAt: string;
}

/** Checks which of the given (already-on-the-board) cards had their Story Points changed after
 *  `cutoffUtc` - used to build the Dailys board's "SP changed since planning" inflow group. Walks
 *  each card's Azure DevOps revision history server-side, so it's called with a narrow candidate
 *  list (cards that existed before the cutoff) and loaded in the background, not on initial render. */
export async function fetchStoryPointsChanges(
  storyIds: number[],
  cutoffUtc: string,
  signal?: AbortSignal,
): Promise<StoryPointsChangeDto[]> {
  if (storyIds.length === 0) return [];
  const response = await apiFetch(`${API_BASE_URL}/api/dailys/story-points-changes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyIds, cutoffUtc }),
    signal,
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte hämta SP-ändringar"));
  }
  return (await response.json()) as StoryPointsChangeDto[];
}

/** The sprints the picker offers: the release the sprint at `around` belongs to, plus the release
 *  before and after it (only the ones that actually have iterations created yet). Omit `around` to
 *  center on whichever sprint /api/dailys would pick by default. */
export async function fetchSprints(team: DeveloperTeamId, around?: string, signal?: AbortSignal): Promise<SprintOption[]> {
  const params = new URLSearchParams({ team });
  if (around) params.set("around", around);
  const response = await apiFetch(`${API_BASE_URL}/api/sprints?${params}`, { signal });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte hämta sprintlistan"));
  }
  return (await response.json()) as SprintOption[];
}
