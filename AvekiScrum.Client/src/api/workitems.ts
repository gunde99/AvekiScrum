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
  assignedTeam: string | null;
  stakeholders: string | null;
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
  reason?: string;
  assignedTo?: string;
  developmentPartner?: string;
  storyPoints?: number;
  description?: string;
  acceptanceCriteria?: string;
  areaPath?: string;
  iterationPath?: string;
  tags?: string[];
  priority?: number;
  severity?: string;
  source?: string;
  activity?: string;
  remainingWork?: number;
  completedWork?: number;
  originalEstimate?: number;
  businessValue?: number;
  valueArea?: string;
  assignedTeam?: string;
  stakeholders?: string;
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

export type LinkKind = "parent" | "child" | "related";

export interface CreateLinkedWorkItemRequest {
  type: string;
  title: string;
  /** Where the new item sits relative to the card it's created from. */
  linkKind: LinkKind;
  assignedTo?: string | null;
  description?: string | null;
  activity?: string | null;
  areaPath?: string | null;
  iterationPath?: string | null;
  tags?: string[];
}

/** Creates a work item linked to `id`. Area and iteration default to the source card's. */
export async function createLinkedWorkItem(id: number, request: CreateLinkedWorkItemRequest): Promise<{ id: number }> {
  const response = await fetch(`${API_BASE_URL}/api/workitems/${id}/children`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Kunde inte skapa kortet: HTTP ${response.status}`);
  }
  return (await response.json()) as { id: number };
}

export async function addWorkItemComment(id: number, text: string): Promise<WorkItemDetail> {
  const response = await fetch(`${API_BASE_URL}/api/workitems/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`Kunde inte lägga till kommentaren: HTTP ${response.status}`);
  }
  return (await response.json()) as WorkItemDetail;
}

export interface ClassificationOptions {
  areas: string[];
  iterations: string[];
  tags: string[];
  /** Work item type -> Azure field reference name -> the values that type actually allows. */
  fieldOptions: Record<string, Record<string, string[]>>;
}

/** Azure field reference names the card view offers pickers for. */
export const FIELD = {
  state: "System.State",
  reason: "System.Reason",
  severity: "Microsoft.VSTS.Common.Severity",
  priority: "Microsoft.VSTS.Common.Priority",
  activity: "Microsoft.VSTS.Common.Activity",
  valueArea: "Microsoft.VSTS.Common.ValueArea",
  source: "Custom.Source",
  assignedTeam: "Custom.AssignedTeam",
} as const;

/** The values `type` allows for `field`, or an empty list when the template didn't say. */
export function fieldOptionsFor(
  classification: ClassificationOptions | null,
  type: string,
  field: string,
): string[] {
  return classification?.fieldOptions?.[type]?.[field] ?? [];
}

/** Project-wide area paths, iteration paths and tags - the sources for the card view's pickers.
 *  Cached module-side: these change rarely and every open card would otherwise refetch them. */
let classificationCache: Promise<ClassificationOptions> | null = null;

export function fetchClassification(): Promise<ClassificationOptions> {
  classificationCache ??= fetch(`${API_BASE_URL}/api/classification`)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load classification: HTTP ${response.status}`);
      return response.json() as Promise<ClassificationOptions>;
    })
    .catch((err) => {
      // A failed fetch must not poison the cache - the next card should try again.
      classificationCache = null;
      throw err;
    });
  return classificationCache;
}

async function relationCall(url: string, method: "POST" | "DELETE", body?: unknown): Promise<WorkItemDetail> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    // The API answers hierarchy violations with a plain-language reason - surfacing it beats a
    // bare status code, since the whole point is telling someone why the link isn't allowed.
    const reason = await response.text().catch(() => "");
    throw new Error(reason?.replace(/^"|"$/g, "") || `HTTP ${response.status}`);
  }
  return (await response.json()) as WorkItemDetail;
}

/** Links an existing work item to this one. Returns the card, reloaded. */
export function addWorkItemRelation(id: number, targetId: number, linkKind: LinkKind): Promise<WorkItemDetail> {
  return relationCall(`${API_BASE_URL}/api/workitems/${id}/relations`, "POST", { targetId, linkKind });
}

export function removeWorkItemRelation(id: number, targetId: number, linkKind: LinkKind): Promise<WorkItemDetail> {
  return relationCall(
    `${API_BASE_URL}/api/workitems/${id}/relations?targetId=${targetId}&linkKind=${linkKind}`,
    "DELETE",
  );
}
