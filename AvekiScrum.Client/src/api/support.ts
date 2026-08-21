const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export interface SupportOptions {
  areas: string[];
  /** Real Severity values from the process template - "3 - Medium" and friends. */
  severities: string[];
  sources: string[];
  stakeholderCategories: string[];
  systemInfoTemplate: string;
  defaultAreaPath: string;
  defaultSeverity: string;
  defaultSource: string;
}

export interface SupportStakeholder {
  category: string;
  name: string;
  /** A case number, a contact person, a date - anything that would otherwise crowd the name. */
  note?: string | null;
}

export interface CreateSupportBugRequest {
  title: string;
  reproSteps: string;
  severity: string;
  source: string;
  systemInfo: string;
  stakeholders: SupportStakeholder[];
  areaPath: string;
  tags?: string[];
}

export interface SupportBug {
  id: number;
  title: string;
  state: string;
  severity: string | null;
  source: string | null;
  areaPath: string | null;
  iterationPath: string | null;
  assignedTo: string | null;
  createdDate: string;
  changedDate: string | null;
  closedDate: string | null;
  reporter: string | null;
  stakeholders: string[];
  tags: string[];
  stageKey: string;
  stageLabel: string;
  stageStep: number;
  stageCount: number;
  webUrl: string;
}

export async function fetchSupportOptions(signal?: AbortSignal): Promise<SupportOptions> {
  const response = await fetch(`${API_BASE_URL}/api/support/options`, { signal });
  if (!response.ok) throw new Error(`Kunde inte hämta formulärets val: HTTP ${response.status}`);
  return (await response.json()) as SupportOptions;
}

export async function createSupportBug(request: CreateSupportBugRequest): Promise<{ id: number; url: string }> {
  const response = await fetch(`${API_BASE_URL}/api/support/bugs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    // The endpoint answers a rejected bug with a plain-language reason - show that, not a code.
    throw new Error((await response.text()) || `Kunde inte skapa ärendet (${response.status}).`);
  }
  return (await response.json()) as { id: number; url: string };
}

export async function fetchSupportBugs(signal?: AbortSignal): Promise<SupportBug[]> {
  const response = await fetch(`${API_BASE_URL}/api/support/bugs`, { signal });
  if (!response.ok) throw new Error(`Kunde inte hämta ärenden: HTTP ${response.status}`);
  const body = (await response.json()) as { bugs: SupportBug[] };
  return body.bugs;
}
