import { apiFetch, describeFailure } from "../lib/apiFetch";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export interface CreateDocumentationHelpTextTaskRequest {
  /** The card in Utveckling this help text belongs to. Never modified beyond the Related link
   *  Azure mirrors onto it automatically. */
  relatedWorkItemId: number;
  title: string;
  descriptionHtml: string;
  assignedTo?: string | null;
}

export async function createDocumentationHelpTextTask(
  request: CreateDocumentationHelpTextTaskRequest,
): Promise<{ id: number; url: string }> {
  const response = await apiFetch(`${API_BASE_URL}/api/documentation/helptext-tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte skapa hjälptextkortet"));
  }
  return (await response.json()) as { id: number; url: string };
}

/** One row in the AvekiDokumentation lists - the light shape, not the full card. Opening a row
 *  fetches the full WorkItemDetail (via the existing /api/workitems/{id}) for its Related link. */
export interface DocumentationHelpTextTask {
  id: number;
  title: string;
  state: string;
  tags: string[];
  assignedTo: string | null;
  createdDate: string;
  changedDate: string | null;
  webUrl: string;
}

/** Every open hjälptext-Task in the Dokumentation project - both AvekiDokumentation views read
 *  this same list and split it client-side (who it's assigned to, which tags it carries). */
export async function fetchDocumentationHelpTextTasks(signal?: AbortSignal): Promise<DocumentationHelpTextTask[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/documentation/helptext-tasks`, { signal });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte hämta hjälptextkorten"));
  }
  return (await response.json()) as DocumentationHelpTextTask[];
}
