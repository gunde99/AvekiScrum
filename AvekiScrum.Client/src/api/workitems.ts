export interface WorkItemRelationRef {
  id: number;
  type: string;
  title: string;
  state: string;
  activity: string | null;
}

export interface WorkItemComment {
  author: string | null;
  textHtml: string;
  createdDate: string | null;
}

export interface PrReviewer {
  displayName: string;
  vote: number; // -10 reject, -5 waiting for author, 0 no vote, 5 approved with suggestions, 10 approved
  isRequired: boolean;
}

export interface WorkItemPullRequest {
  pullRequestId: number;
  repoId: string;
  title: string;
  status: string;
  targetBranch: string;
  webUrl: string;
  createdDate: string | null;
  createdBy: string | null;
  reviewers: PrReviewer[];
  commentsTotal: number;
  commentsResolved: number;
  /** Set when the PR hangs off one of the card's tasks rather than off the card itself. */
  sourceTaskId: number | null;
  sourceTaskTitle: string | null;
}

export interface WorkItemHistoryEntry {
  when: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface WorkItemDetail {
  id: number;
  type: string;
  title: string;
  state: string;
  reason: string | null;
  assignedTo: string | null;
  developmentPartner: string | null;
  createdBy: string | null;
  areaPath: string | null;
  iterationPath: string | null;
  storyPoints: number | null;
  priority: number | null;
  severity: string | null;
  source: string | null;
  valueArea: string | null;
  businessValue: number | null;
  activity: string | null;
  originalEstimate: number | null;
  remainingWork: number | null;
  completedWork: number | null;
  tags: string[];
  descriptionHtml: string;
  acceptanceCriteriaHtml: string;
  webUrl: string;
  createdDate: string | null;
  changedDate: string | null;
  parent: WorkItemRelationRef | null;
  children: WorkItemRelationRef[];
  related: WorkItemRelationRef[];
  comments: WorkItemComment[];
  pullRequests: WorkItemPullRequest[];
  history: WorkItemHistoryEntry[];
}

export interface WorkItemFieldUpdate {
  title?: string;
  state?: string;
  assignedTo?: string;
  developmentPartner?: string;
  storyPoints?: number;
  description?: string;
  acceptanceCriteria?: string;
  areaPath?: string;
  iterationPath?: string;
  tags?: string[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export async function fetchWorkItemDetail(id: number, signal?: AbortSignal): Promise<WorkItemDetail> {
  const response = await fetch(`${API_BASE_URL}/api/workitems/${id}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load work item ${id}: HTTP ${response.status}`);
  }
  return (await response.json()) as WorkItemDetail;
}

export async function updateWorkItemFields(id: number, update: WorkItemFieldUpdate): Promise<WorkItemDetail> {
  const response = await fetch(`${API_BASE_URL}/api/workitems/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!response.ok) {
    throw new Error(`Failed to update work item ${id}: HTTP ${response.status}`);
  }
  return (await response.json()) as WorkItemDetail;
}

export interface NewTaskRequest {
  title: string;
  activity: string | null;
  assignedTo?: string | null;
  state?: string | null;
}

export async function createWorkItemTasks(
  parentId: number,
  tasks: NewTaskRequest[],
): Promise<{ created: number; ids: number[] }> {
  const response = await fetch(`${API_BASE_URL}/api/workitems/${parentId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create tasks for work item ${parentId}: HTTP ${response.status}`);
  }
  return (await response.json()) as { created: number; ids: number[] };
}

/** Creates the "hjälptext" satellite: a related (not child) User Story with its own
 *  Documentation-activity Task, per the new DoR pattern for breaking help-text out of the story. */
export async function createHelptextStory(parentId: number): Promise<{ storyId: number; taskId: number }> {
  const response = await fetch(`${API_BASE_URL}/api/workitems/${parentId}/helptext-story`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to create hjälptext story for work item ${parentId}: HTTP ${response.status}`);
  }
  return (await response.json()) as { storyId: number; taskId: number };
}
