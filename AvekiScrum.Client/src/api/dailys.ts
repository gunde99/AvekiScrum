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

export async function fetchDailys(team: DeveloperTeamId, signal?: AbortSignal): Promise<DailysResponse> {
  const response = await fetch(`${API_BASE_URL}/api/dailys?team=${team}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load dailys for team ${team}: HTTP ${response.status}`);
  }
  return (await response.json()) as DailysResponse;
}
