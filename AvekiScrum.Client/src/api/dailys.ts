export type DeveloperTeamId = "Nord" | "Syd";

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
  createdDate: string | null;
  completedDate: string | null;
  statusChangedDate: string | null;
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
    generatedAt: string;
  };
  teams: DailyTeamDto[];
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
      return await fetch(url, { signal });
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isAbort || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function fetchDailys(team: DeveloperTeamId, signal?: AbortSignal): Promise<DailysResponse> {
  const response = await fetchWithRetry(`${API_BASE_URL}/api/dailys?team=${team}`, signal);
  if (!response.ok) {
    throw new Error(`Failed to load dailys for team ${team}: HTTP ${response.status}`);
  }
  return (await response.json()) as DailysResponse;
}
