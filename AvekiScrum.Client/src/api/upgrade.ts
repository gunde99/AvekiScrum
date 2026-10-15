import { apiFetch, describeFailure } from "../lib/apiFetch";
import { loadReporter } from "../support/reporter";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";
const BASE = `${API_BASE_URL}/api/documentation/upgrade`;

// AvekiDokumentation → Uppgradering. See docs/Uppgraderingsdokumentation/UPPGRADERINGSDOKUMENTATION_SPEC.md §0:
// a checkout is a branch in the wiki repo, a save is a commit, "Lämna in" merges it into the wiki.

export interface UpgradePage {
  /** Path relative to the configured wiki root - the page's identity in every call below. */
  id: string;
  title: string;
  appliesTo: string;
  /** "Gäller: Alla kunder" - always part of the document. */
  always: boolean;
}

export interface UpgradeRelease {
  name: string;
  pages: UpgradePage[];
}

export interface UpgradeProduct {
  name: string;
  releases: UpgradeRelease[];
}

export interface UpgradeStructure {
  commit: string;
  products: UpgradeProduct[];
}

export type UpgradeStatus = "Active" | "Conflict" | "Merged" | "ClosedUnchanged" | "Cancelled";

export interface UpgradeCheckoutSummary {
  id: string;
  customer: string;
  product: string;
  releases: string[];
  status: UpgradeStatus;
  createdByName: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
}

export interface UpgradeSection {
  id: string;
  release: string;
  title: string;
  appliesTo: string;
  content: string;
  /** Edited in this checkout - goes into the wiki on "Lämna in". */
  changed: boolean;
  /** Someone else changed this page in the wiki since the checkout was made. */
  wikiChanged: boolean;
  /** Bockad som klar av konsulten - en egen checklista som aldrig följer med till wikin. */
  completed: boolean;
}

export interface UpgradeConflict {
  conflictId: number;
  sectionId: string;
  title: string;
  release: string;
  base: string;
  wiki: string;
  mine: string;
}

export interface UpgradeCheckoutDetail {
  summary: UpgradeCheckoutSummary;
  headCommit: string;
  sections: UpgradeSection[];
  history: { at: string; by: string; text: string }[];
  conflicts: UpgradeConflict[];
}

export interface UpgradeImportResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  applied: string[];
  skippedChangedSince: string[];
  unknown: string[];
  headCommit: string;
}

export interface UpgradeSubmitResult {
  status: "Merged" | "Conflict" | "ClosedUnchanged";
  message: string;
  conflicts: UpgradeConflict[];
}

/** Without sign-in (PAT mode) the Api can't tell who is calling - send the name the consultant typed. */
function actorHeaders(extra?: Record<string, string>): HeadersInit {
  const name = loadReporter();
  return { ...(name ? { "X-Aveki-Actor": encodeURIComponent(name) } : {}), ...extra };
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw new Error(await describeFailure(response, fallback));
  return (await response.json()) as T;
}

export async function fetchUpgradeStructure(signal?: AbortSignal): Promise<UpgradeStructure> {
  return json(await apiFetch(`${BASE}/structure`, { signal }), "Kunde inte läsa wikins uppgraderingsstruktur");
}

export async function fetchUpgradeCheckouts(signal?: AbortSignal): Promise<UpgradeCheckoutSummary[]> {
  return json(await apiFetch(`${BASE}/checkouts`, { signal }), "Kunde inte hämta uppgraderingarna");
}

export async function createUpgradeCheckout(request: {
  customer: string;
  product: string;
  releases: string[];
  modules: string[];
}): Promise<UpgradeCheckoutDetail> {
  return json(
    await apiFetch(`${BASE}/checkouts`, {
      method: "POST",
      headers: actorHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    }),
    "Kunde inte skapa uppgraderingsdokumentet",
  );
}

export async function fetchUpgradeCheckout(id: string, signal?: AbortSignal): Promise<UpgradeCheckoutDetail> {
  return json(await apiFetch(`${BASE}/checkouts/${encodeURIComponent(id)}`, { signal }), "Kunde inte öppna uppgraderingen");
}

export async function saveUpgradeSection(
  id: string,
  request: { sectionId: string; content: string; expectedHead: string },
): Promise<{ headCommit: string; changed: boolean }> {
  return json(
    await apiFetch(`${BASE}/checkouts/${encodeURIComponent(id)}/section`, {
      method: "PUT",
      headers: actorHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    }),
    "Kunde inte spara",
  );
}

export async function setUpgradeSectionCompleted(id: string, sectionId: string, completed: boolean): Promise<void> {
  const response = await apiFetch(`${BASE}/checkouts/${encodeURIComponent(id)}/completed`, {
    method: "PUT",
    headers: actorHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sectionId, completed }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Kunde inte spara avbockningen"));
}

/** Fetched rather than linked, so the token travels with it when sign-in is on. */
export async function downloadUpgradeDocument(id: string): Promise<void> {
  const response = await apiFetch(`${BASE}/checkouts/${encodeURIComponent(id)}/export`);
  if (!response.ok) throw new Error(await describeFailure(response, "Kunde inte ladda ner dokumentet"));
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1] ?? match[2]) : `Uppgradering_${id}.md`;
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function importUpgradeDocument(id: string, fileText: string): Promise<UpgradeImportResult> {
  return json(
    await apiFetch(`${BASE}/checkouts/${encodeURIComponent(id)}/import`, {
      method: "POST",
      headers: actorHeaders({ "Content-Type": "text/markdown; charset=utf-8" }),
      body: fileText,
    }),
    "Kunde inte läsa in filen",
  );
}

export async function submitUpgradeCheckout(id: string): Promise<UpgradeSubmitResult> {
  return json(
    await apiFetch(`${BASE}/checkouts/${encodeURIComponent(id)}/submit`, { method: "POST", headers: actorHeaders() }),
    "Kunde inte lämna in",
  );
}

export async function resolveUpgradeConflicts(
  id: string,
  resolutions: { conflictId: number; content: string }[],
): Promise<UpgradeSubmitResult> {
  return json(
    await apiFetch(`${BASE}/checkouts/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      headers: actorHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(resolutions),
    }),
    "Kunde inte slå ihop ändringarna",
  );
}

export async function cancelUpgradeCheckout(id: string): Promise<void> {
  const response = await apiFetch(`${BASE}/checkouts/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: actorHeaders() });
  if (!response.ok) throw new Error(await describeFailure(response, "Kunde inte avbryta"));
}

/** Wiki images ("/.attachments/...") through our proxy - the browser has no credentials for the wiki. */
export function upgradeAttachmentUrl(wikiPath: string): string {
  return `${BASE}/attachments?path=${encodeURIComponent(wikiPath)}`;
}
