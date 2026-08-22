import type { SupportBug as SupportBugRow, SupportStakeholder } from "../api/support";

/**
 * The repro-steps template the team already uses, as separate fields. Support is used to filling
 * in one big text box with these headings; splitting them means nobody deletes a heading by
 * accident and every card comes out with the same five sections in the same order.
 *
 * All parts are optional except the description - a one-line "knappen gör ingenting" bug
 * shouldn't be blocked by an empty "förväntat resultat".
 */
export interface ReproStepsParts {
  summary: string;
  steps: string;
  expected: string;
  actual: string;
  screenshots: string;
}

export interface ReproStepsField {
  key: keyof ReproStepsParts;
  heading: string;
  placeholder: string;
  /** Roughly how much room the field gets before it starts scrolling. */
  rows: number;
  hint?: string;
}

export const REPRO_FIELDS: ReproStepsField[] = [
  {
    key: "summary",
    heading: "Kort beskrivning om buggen",
    placeholder: "Vad är det som inte fungerar?",
    rows: 3,
  },
  {
    key: "steps",
    heading: "Steg för att återskapa buggen",
    placeholder: "1. Logga in som…\n2. Gå till…\n3. Klicka på…",
    rows: 6,
    hint: "Numrera gärna stegen – det är det som gör att en utvecklare kan se samma sak som du.",
  },
  {
    key: "expected",
    heading: "Förväntat resultat (innan bugg)",
    placeholder: "Vad skulle ha hänt?",
    rows: 3,
  },
  {
    key: "actual",
    heading: "Faktiskt resultat (vid bugg)",
    placeholder: "Vad hände i stället?",
    rows: 3,
  },
  {
    key: "screenshots",
    heading: "Skärmbild(er)",
    placeholder: "Klistra in en skärmdump här (Ctrl+V).",
    rows: 4,
    hint: "Klistra in direkt från urklipp – bilden laddas upp och bifogas kortet.",
  },
];

export const EMPTY_REPRO_PARTS: ReproStepsParts = {
  summary: "",
  steps: "",
  expected: "",
  actual: "",
  screenshots: "",
};

/**
 * The parts joined into what goes into the card's Repro Steps.
 *
 * Html, not markdown: Azure DevOps stores this field as html and renders it as such, so markdown
 * written into it shows up on the card as literal `**bold**` and `![](url)` - which is exactly what
 * our first cards did.
 *
 * Headings are always written, even for parts left empty, so the card reads the same as the ones
 * the team writes by hand; a missing heading looks like the reporter forgot the question rather
 * than answered it with "inget".
 */
export function composeReproSteps(parts: ReproStepsParts): string {
  return REPRO_FIELDS.map((field) => {
    const value = parts[field.key].trim();
    return `<div><b>${escapeHtml(field.heading)}:</b></div>${value ? `<div>${value}</div>` : "<div><br></div>"}`;
  }).join("<div><br></div>");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** True when a field from the rich-text editor holds anything but empty markup. */
export function hasContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0 || /<img\b/i.test(html);
}

/** True when there is enough in the form to be worth someone's time to read. */
export function hasEnoughDetail(parts: ReproStepsParts): boolean {
  return hasContent(parts.summary) || hasContent(parts.steps);
}

/** One stakeholder line as it will read on the card - used for the live preview in the form. */
export function formatStakeholderLine(stakeholder: SupportStakeholder): string {
  const note = stakeholder.note?.trim();
  return `${stakeholder.category}: ${stakeholder.name.trim()}${note ? ` (${note})` : ""}`;
}

/**
 * The five states a reported bug can be in, in order. Mirrors SupportBugs.StatusFor on the server.
 *
 * The first three are what support actually asks about - is it still sitting in the backlog, has
 * it been planned into a sprint, is someone working on it - so those are the ones that get colour
 * and prominence. Resolved and closed are kept but played down; by then the question is answered.
 */
export const SUPPORT_STATUSES = [
  { key: "backlogg", label: "I backloggen", hint: "Inte inplanerad än", primary: true },
  { key: "planerad", label: "Inplanerad", hint: "Ligger i en sprint, inte påbörjad", primary: true },
  { key: "arbete", label: "Under arbete", hint: "Ett team jobbar med den nu", primary: true },
  { key: "testas", label: "Löst – testas", hint: "Rättad, väntar på verifiering", primary: false },
  { key: "klar", label: "Klar", hint: "Stängd", primary: false },
] as const;

export type SupportStatusKey = (typeof SUPPORT_STATUSES)[number]["key"];

/** Rank for sorting: backlog first, closed last - the order the states appear in above. */
export function statusRank(key: string): number {
  const index = SUPPORT_STATUSES.findIndex((status) => status.key === key);
  return index < 0 ? SUPPORT_STATUSES.length : index;
}

/** Severity without Azure's estimate suffix: "1 - Critical (< 8 h )" reads as "Critical". */
export function shortSeverity(severity: string | null | undefined): string {
  if (!severity) return "–";
  const withoutEstimate = severity.replace(/\(.*?\)/g, "").trim();
  const dash = withoutEstimate.indexOf(" - ");
  return dash >= 0 ? withoutEstimate.slice(dash + 3).trim() : withoutEstimate;
}

/**
 * The sprint a bug is planned into: the iteration path without the project root, which is all the
 * part that varies. Empty for anything still in the backlog - the root on its own says nothing.
 */
export function shortIteration(iterationPath: string | null | undefined): string {
  const parts = (iterationPath ?? "").split("\\").filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" / ") : "";
}

/** The last path segment of an area path - the product, without the project prefix. */
export function shortAreaPath(areaPath: string | null | undefined): string {
  if (!areaPath) return "–";
  const parts = areaPath.split("\\").filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" / ") : parts[0] ?? "–";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("sv-SE");
}

/** Whole days since a date, for the "ligger sedan X dagar" column. */
export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

// -----------------------------------------------------------------------------------------------
// Dashboard: sorting and filtering
// -----------------------------------------------------------------------------------------------

/** The columns the list can be sorted on. */
export type SortKey =
  | "id"
  | "status"
  | "title"
  | "severity"
  | "version"
  | "area"
  | "customer"
  | "reporter"
  | "assignee"
  | "iteration"
  | "created"
  | "changed";

export interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}

/** "1 - Critical (< 8 h )" → 1, so severity sorts by seriousness rather than alphabetically. */
export function severityRank(severity: string | null | undefined): number {
  const match = /^\s*([1-4])/.exec(severity ?? "");
  // Unset severity sorts last whichever way round the column is - it's the absence of a value,
  // not a value between Low and Critical.
  return match ? Number(match[1]) : 9;
}

function textOf(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function timeOf(value: string | null | undefined): number {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

export function compareBugs(a: SupportBugRow, b: SupportBugRow, sort: SortState): number {
  const factor = sort.direction === "asc" ? 1 : -1;
  switch (sort.key) {
    case "id":
      return (a.id - b.id) * factor;
    case "status":
      return (statusRank(a.statusKey) - statusRank(b.statusKey) || a.id - b.id) * factor;
    case "title":
      return a.title.localeCompare(b.title, "sv") * factor;
    case "severity":
      return (severityRank(a.severity) - severityRank(b.severity) || a.id - b.id) * factor;
    case "version":
      return (a.versions[0] ?? "").localeCompare(b.versions[0] ?? "", "sv") * factor;
    case "area":
      return textOf(a.areaPath).localeCompare(textOf(b.areaPath), "sv") * factor;
    case "iteration":
      return textOf(a.iterationPath).localeCompare(textOf(b.iterationPath), "sv") * factor;
    case "customer":
      return textOf(a.customers[0]).localeCompare(textOf(b.customers[0]), "sv") * factor;
    case "reporter":
      return textOf(a.reporter).localeCompare(textOf(b.reporter), "sv") * factor;
    case "assignee":
      return textOf(a.assignedTo).localeCompare(textOf(b.assignedTo), "sv") * factor;
    case "created":
      return (timeOf(a.createdDate) - timeOf(b.createdDate)) * factor;
    case "changed":
      return (timeOf(a.changedDate) - timeOf(b.changedDate)) * factor;
    default:
      return 0;
  }
}

/** Everything the list can be narrowed by, all at once. */
export interface SupportFilters {
  search: string;
  statuses: Set<string>;
  versions: Set<string>;
  areas: Set<string>;
  /** Whoever filed the bug - the Buggrapportör line, or the person who created the card. */
  consultants: Set<string>;
  customers: Set<string>;
}

export const EMPTY_FILTERS: SupportFilters = {
  search: "",
  statuses: new Set(),
  versions: new Set(),
  areas: new Set(),
  consultants: new Set(),
  customers: new Set(),
};

export function activeFilterCount(filters: SupportFilters): number {
  return (
    (filters.search.trim() ? 1 : 0) +
    filters.statuses.size +
    filters.versions.size +
    filters.areas.size +
    filters.consultants.size +
    filters.customers.size
  );
}

export function matchesFilters(bug: SupportBugRow, filters: SupportFilters): boolean {
  if (filters.statuses.size > 0 && !filters.statuses.has(bug.statusKey)) return false;
  // A bug with no version at all can't match a version filter - "27.1" means that release, not
  // "27.1 or unknown".
  if (filters.versions.size > 0 && !bug.versions.some((version) => filters.versions.has(version))) return false;
  if (filters.areas.size > 0 && !filters.areas.has(bug.areaPath ?? "")) return false;
  if (filters.consultants.size > 0 && !filters.consultants.has(bug.reporter ?? "")) return false;
  if (filters.customers.size > 0 && !bug.customers.some((customer) => filters.customers.has(customer))) return false;

  const query = filters.search.trim().toLowerCase();
  if (!query) return true;
  return (
    bug.title.toLowerCase().includes(query) ||
    String(bug.id).includes(query) ||
    textOf(bug.reporter).includes(query) ||
    textOf(bug.assignedTo).includes(query) ||
    bug.customers.some((name) => name.toLowerCase().includes(query)) ||
    bug.colleagues.some((name) => name.toLowerCase().includes(query)) ||
    bug.tags.some((tag) => tag.toLowerCase().includes(query))
  );
}

/** Today, and a year back, as yyyy-MM-dd - the default window the dashboard opens on. */
export function defaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 1);
  return { from: isoDate(from), to: isoDate(today) };
}

export function isoDate(date: Date): string {
  // Local date parts, not toISOString(): that converts to UTC and can land on the previous day.
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
