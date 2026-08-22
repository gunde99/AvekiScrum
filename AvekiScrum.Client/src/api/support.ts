import { apiFetch } from "../lib/apiFetch";
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
  /** Link to the case in Lime. */
  externalLink: string;
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
  createdBy: string | null;
  createdDate: string;
  changedDate: string | null;
  closedDate: string | null;
  /** Who filed it: the card's Buggrapportör line, or whoever created it in Azure. */
  reporter: string | null;
  /** Names in the stakeholder field that match someone at the company. */
  colleagues: string[];
  /** Everyone else named in the stakeholder field - municipalities, contacts, case numbers. */
  customers: string[];
  versions: string[];
  externalLink: string | null;
  tags: string[];
  statusKey: string;
  statusLabel: string;
  webUrl: string;
}

export interface SupportBugsResponse {
  bugs: SupportBug[];
  /** True when the date range matched more bugs than the server is willing to fetch details for. */
  truncated: boolean;
  total: number;
}

export async function fetchSupportOptions(signal?: AbortSignal): Promise<SupportOptions> {
  const response = await apiFetch(`${API_BASE_URL}/api/support/options`, { signal });
  if (!response.ok) throw new Error(`Kunde inte hämta formulärets val: HTTP ${response.status}`);
  return (await response.json()) as SupportOptions;
}

export async function createSupportBug(request: CreateSupportBugRequest): Promise<{ id: number; url: string }> {
  const response = await apiFetch(`${API_BASE_URL}/api/support/bugs`, {
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

/**
 * The bugs support has reported, within a date range. The range is a server parameter rather than
 * a client-side filter because there are hundreds of these - fetching them all to then hide most
 * would be both slow and misleading about what the list contains.
 */
export async function fetchSupportBugs(
  range: { from: string; to: string },
  signal?: AbortSignal,
): Promise<SupportBugsResponse> {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const response = await apiFetch(`${API_BASE_URL}/api/support/bugs?${params}`, { signal });
  if (!response.ok) throw new Error(`Kunde inte hämta ärenden: HTTP ${response.status}`);
  return (await response.json()) as SupportBugsResponse;
}
