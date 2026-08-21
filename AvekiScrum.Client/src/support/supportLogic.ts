import type { SupportStakeholder } from "../api/support";

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
 * The parts joined into the text that goes into the card's Repro Steps. Headings are always
 * written, even for parts left empty, so the card reads the same as the ones the team writes by
 * hand - a missing heading looks like the reporter forgot the question rather than answered it
 * with "inget".
 */
export function composeReproSteps(parts: ReproStepsParts): string {
  return REPRO_FIELDS.map((field) => {
    const value = parts[field.key].trim();
    return `**${field.heading}:**\n\n${value}`;
  }).join("\n\n");
}

/** True when there is enough in the form to be worth someone's time to read. */
export function hasEnoughDetail(parts: ReproStepsParts): boolean {
  return parts.summary.trim().length > 0 || parts.steps.trim().length > 0;
}

/** One stakeholder line as it will read on the card - used for the live preview in the form. */
export function formatStakeholderLine(stakeholder: SupportStakeholder): string {
  const note = stakeholder.note?.trim();
  return `${stakeholder.category}: ${stakeholder.name.trim()}${note ? ` (${note})` : ""}`;
}

/** The support flow, in order. Mirrors SupportBugs.FlowStageFor on the server. */
export const FLOW_STAGES = [
  { key: "inkommen", label: "Inkommen", hint: "Ligger i produktägarens backlogg" },
  { key: "planerad", label: "Planerad", hint: "Inplanerad i en sprint" },
  { key: "arbete", label: "Under arbete", hint: "Ett team har börjat" },
  { key: "testas", label: "Testas", hint: "Rättad, väntar på verifiering" },
  { key: "klar", label: "Klar", hint: "Stängd" },
] as const;

export type FlowStageKey = (typeof FLOW_STAGES)[number]["key"];

/** Severity without Azure's estimate suffix: "1 - Critical (< 8 h )" reads as "Critical". */
export function shortSeverity(severity: string | null | undefined): string {
  if (!severity) return "–";
  const withoutEstimate = severity.replace(/\(.*?\)/g, "").trim();
  const dash = withoutEstimate.indexOf(" - ");
  return dash >= 0 ? withoutEstimate.slice(dash + 3).trim() : withoutEstimate;
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
