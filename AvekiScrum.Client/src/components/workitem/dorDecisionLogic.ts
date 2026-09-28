/**
 * INVEST + Ready check + Godkännande: shared between WorkItemInvestTab and WorkItemReadyCheckTab,
 * because both read and write the same composed field (Custom.DoRDecision) - INVEST's checkboxes
 * and the ready-check answers/comment all live in that one text field, there being no dedicated
 * field per checkbox. The composer writes it in a shape a person can read on the card in Azure and
 * this file can read back, so reopening the form restores every checkbox instead of starting blank.
 */

export interface InvestItem {
  key: string;
  term: string;
  swedish: string;
  description: string;
}

export const INVEST_ITEMS: InvestItem[] = [
  {
    key: "independent",
    term: "Independent",
    swedish: "Oberoende",
    description: "Kan kortet utvecklas och levereras för sig, utan att vänta på eller blockera en annan opåbörjad story?",
  },
  {
    key: "negotiable",
    term: "Negotiable",
    swedish: "Förhandlingsbar",
    description: "Beskriver kortet behovet snarare än en låst lösning - finns utrymme att förhandla detaljerna med PO under arbetets gång?",
  },
  {
    key: "valuable",
    term: "Valuable",
    swedish: "Värdefull",
    description: "Framgår det tydligt vilket värde det här ger användaren eller verksamheten?",
  },
  {
    key: "estimable",
    term: "Estimable",
    swedish: "Uppskattningsbar",
    description: "Vet teamet tillräckligt om vad som ska göras för att kunna sätta en rimlig storypoint-uppskattning?",
  },
  {
    key: "small",
    term: "Small",
    swedish: "Lagom liten",
    description: "Ryms arbetet inom en sprint, eller behöver kortet delas upp ytterligare?",
  },
  {
    key: "testable",
    term: "Testable",
    swedish: "Testbar",
    description: "Går det att formulera tydliga acceptanskriterier eller testfall som visar när kortet är klart?",
  },
];

export type InvestChecks = Record<string, boolean>;

export const EMPTY_INVEST_CHECKS: InvestChecks = Object.fromEntries(INVEST_ITEMS.map((i) => [i.key, false]));

export function investLabel(item: InvestItem): string {
  return `${item.term} (${item.swedish})`;
}

export interface ReadyQuestion {
  key: string;
  text: string;
  /** Which answer counts as "the good one" - shown with a check. The blockers question is
   *  phrased so "Nej" is the answer you want, unlike the other two. */
  goodAnswer: "ja" | "nej";
}

export const READY_QUESTIONS: ReadyQuestion[] = [
  { key: "noRefinementNeeded", text: "Kan vi börja utan ytterligare refinement/utredning?", goodAnswer: "ja" },
  { key: "noBlockers", text: "Finns blockerande beslut eller beroenden kvar?", goodAnswer: "nej" },
  { key: "fitsInSprint", text: "Kan arbetet bli klart inom sprinten?", goodAnswer: "ja" },
];

export type ReadyAnswer = "ja" | "nej" | null;
export type ReadyAnswers = Record<string, ReadyAnswer>;

export const EMPTY_READY_ANSWERS: ReadyAnswers = Object.fromEntries(READY_QUESTIONS.map((q) => [q.key, null]));

export type Assessment = "Ready" | "Ready with risk" | "Needs refinement" | "Not assessed";

export const ASSESSMENTS: { key: Assessment; label: string }[] = [
  { key: "Ready", label: "Ready" },
  { key: "Ready with risk", label: "Ready with risk" },
  { key: "Needs refinement", label: "Needs refinement" },
  { key: "Not assessed", label: "Not assessed" },
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Turns the field's html into plain lines - same technique as everywhere else in this app that
 *  reads a Custom.* html field back out (see SupportBugs.StripHtml on the server). */
function toLines(html: string): string[] {
  const withBreaks = (html || "")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = withBreaks.replace(/<[^>]*>/g, "");
  const decoded = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return decoded.split("\n").map((l) => l.trim());
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Reconstructs the checklists from a previously-composed Custom.DoRDecision - so opening the
 *  Godkännande/INVEST tabs again on an already-reviewed card starts from what was last decided
 *  instead of blank. Best-effort: a line it doesn't recognise is simply not restored. */
export function parseDoRDecision(html: string): { invest: InvestChecks; ready: ReadyAnswers; comment: string } {
  const lines = toLines(html);
  const invest: InvestChecks = { ...EMPTY_INVEST_CHECKS };
  const ready: ReadyAnswers = { ...EMPTY_READY_ANSWERS };
  let comment = "";
  let inComment = false;
  const commentLines: string[] = [];

  for (const line of lines) {
    if (inComment) {
      commentLines.push(line);
      continue;
    }
    if (/^Kommentar:?\s*$/i.test(line)) {
      inComment = true;
      continue;
    }

    const checkboxMatch = /^\[( |x)\]\s*(.+)$/i.exec(line);
    if (checkboxMatch) {
      const label = checkboxMatch[2].trim();
      const item = INVEST_ITEMS.find((i) => investLabel(i) === label);
      if (item) invest[item.key] = checkboxMatch[1].toLowerCase() === "x";
      continue;
    }

    for (const question of READY_QUESTIONS) {
      const match = new RegExp(`^${escapeRegExp(question.text)}:\\s*(Ja|Nej)$`, "i").exec(line);
      if (match) ready[question.key] = match[1].toLowerCase() as ReadyAnswer;
    }
  }

  comment = commentLines.join("\n").trim();
  return { invest, ready, comment };
}

/** The html written to Custom.DoRDecision - readable on the card in Azure, and exactly what
 *  parseDoRDecision reads back. Bedömning itself isn't parsed back out of this text (Custom.DoRStatus
 *  is the source of truth for that), but it's included here so the field reads as a full record on
 *  its own without needing DoRStatus alongside it.
 *
 *  behovsbedomningHtml is pre-composed (see composeBehovsbedomningSummary) and inserted first -
 *  what was actually created is more worth reading at a glance than the INVEST checklist. Empty
 *  when nothing on that tab has been decided yet, so it doesn't leave a blank heading behind. */
export function composeDoRDecision(
  behovsbedomningHtml: string,
  invest: InvestChecks,
  ready: ReadyAnswers,
  assessment: Assessment,
  comment: string,
): string {
  const lines: string[] = [];
  if (behovsbedomningHtml) {
    lines.push(behovsbedomningHtml);
    lines.push("<div><br></div>");
  }
  lines.push("<div><b>INVEST</b></div>");
  for (const item of INVEST_ITEMS) {
    lines.push(`<div>[${invest[item.key] ? "x" : " "}] ${escapeHtml(investLabel(item))}</div>`);
  }
  lines.push("<div><br></div>");
  lines.push("<div><b>Ready check</b></div>");
  for (const question of READY_QUESTIONS) {
    const answer = ready[question.key];
    lines.push(`<div>${escapeHtml(question.text)}: ${answer ? (answer === "ja" ? "Ja" : "Nej") : "–"}</div>`);
  }
  lines.push("<div><br></div>");
  lines.push(`<div><b>Bedömning:</b> ${escapeHtml(assessment)}</div>`);
  if (comment.trim()) {
    lines.push("<div><br></div>");
    lines.push("<div><b>Kommentar:</b></div>");
    for (const commentLine of comment.trim().split("\n")) {
      lines.push(`<div>${escapeHtml(commentLine)}</div>`);
    }
  }
  return lines.join("");
}

export function investCheckedCount(invest: InvestChecks): number {
  return INVEST_ITEMS.filter((i) => invest[i.key]).length;
}
