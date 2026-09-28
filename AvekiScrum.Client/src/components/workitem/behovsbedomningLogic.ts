import type { WorkItemRelationRef } from "../../api/workitems";

export type NeedDecision = "create" | "not-needed";

export interface NeedCategory {
  key: string;
  label: string;
  activity: string;
  /**
   * Title prefixes that identify a task as belonging to this category. Matched before activity,
   * because Activity is very often blank on real cards - the prefix is what people actually
   * write, so it is the reliable signal and activity only fills in the gaps.
   */
  prefixes: string[];
}

export const CATEGORIES: NeedCategory[] = [
  // "Utveckling" is the catch-all: any task no other category claimed. It carries no prefix of
  // its own, so a card that simply has development work already satisfies the row.
  { key: "development", label: "Utveckling", activity: "Development", prefixes: [] },
  { key: "unittest", label: "Enhetstester", activity: "Development", prefixes: ["enhetstest", "unittest", "unit test"] },
  { key: "audit", label: "Auditloggning", activity: "Development", prefixes: ["audit"] },
  {
    key: "test",
    label: "Manuella tester",
    activity: "Testing",
    prefixes: ["manuell test", "manuella test", "acceptanstest", "testkort", "testa "],
  },
  { key: "helptext", label: "Hjälptext", activity: "Documentation", prefixes: ["hjälptext", "hjalptext"] },
  { key: "dbdoc", label: "Databasdokumentation", activity: "Documentation", prefixes: ["databasdok"] },
  { key: "techdoc", label: "Teknisk dokumentation", activity: "Documentation", prefixes: ["teknisk dok"] },
  { key: "versionchange", label: "Versionsförändring", activity: "Documentation", prefixes: ["versionsförändring", "versionsforandring"] },
  { key: "ux", label: "Stäm av med UX-ansvarig", activity: "Design", prefixes: ["stäm av med ux", "ux-avstämning"] },
];

function matchesPrefix(title: string, prefixes: string[]): boolean {
  const lower = (title || "").toLowerCase();
  return prefixes.some((p) => lower.includes(p.toLowerCase()));
}

function sameActivity(a: string | null, b: string): boolean {
  return (a || "").trim().toLowerCase() === b.toLowerCase();
}

/**
 * Assigns each child task to at most one category.
 *
 * Order matters: a prefix match is definitive, so those are claimed first and can't then be
 * stolen by a broader activity rule. Only afterwards does activity fill in - and only where it is
 * unambiguous (Testing has a single category; the Documentation categories are told apart by
 * prefix alone). Anything still unclaimed counts as plain development work, including the many
 * real tasks that carry no Activity at all.
 */
export function assignTasks(children: WorkItemRelationRef[], related: WorkItemRelationRef[]): Record<string, WorkItemRelationRef | undefined> {
  const tasks = children.filter((c) => c.type === "Task");
  const claimed = new Map<number, string>();
  const result: Record<string, WorkItemRelationRef | undefined> = {};

  for (const category of CATEGORIES) {
    if (category.prefixes.length === 0) continue;
    for (const task of tasks) {
      if (claimed.has(task.id)) continue;
      if (matchesPrefix(task.title, category.prefixes)) claimed.set(task.id, category.key);
    }
  }

  for (const task of tasks) {
    if (claimed.has(task.id)) continue;
    if (sameActivity(task.activity, "Testing")) claimed.set(task.id, "test");
  }

  for (const task of tasks) {
    if (claimed.has(task.id)) continue;
    // Documentation and Design work with no recognisable prefix belongs to no specific row -
    // leaving it unclaimed is better than crediting an arbitrary category with it.
    if (sameActivity(task.activity, "Documentation") || sameActivity(task.activity, "Design")) continue;
    claimed.set(task.id, "development");
  }

  for (const [taskId, key] of claimed) {
    result[key] ??= tasks.find((t) => t.id === taskId);
  }

  // Hjälptext is in transition: it used to be a direct child Task and is now a separate related
  // User Story with its own Documentation task. Either pattern counts.
  result.helptext ??= related.find((r) => r.type === "User Story" && matchesPrefix(r.title, CATEGORIES.find((c) => c.key === "helptext")!.prefixes));

  return result;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The Behovsbedömning section of Custom.DoRDecision - what actually got created, first (the part
 * worth reading), then everything marked "behövs ej" compacted onto one line rather than one row
 * each, so nine mostly-"not needed" categories don't fill the whole field. Rows nobody ever decided
 * on are left out entirely - there's nothing to report for those.
 */
export function composeBehovsbedomningSummary(
  existingByCategory: Record<string, WorkItemRelationRef | undefined>,
  decisions: Record<string, NeedDecision | undefined>,
): string {
  const created = CATEGORIES.filter((c) => existingByCategory[c.key]);
  const notNeeded = CATEGORIES.filter((c) => !existingByCategory[c.key] && decisions[c.key] === "not-needed");

  if (created.length === 0 && notNeeded.length === 0) return "";

  const lines: string[] = ["<div><b>Behovsbedömning</b></div>"];
  for (const category of created) {
    const existing = existingByCategory[category.key]!;
    lines.push(
      `<div>${escapeHtml(category.label)}: #${existing.id} ${escapeHtml(existing.title)} (${escapeHtml(existing.state)})</div>`,
    );
  }
  if (notNeeded.length > 0) {
    lines.push(`<div>Behövs ej: ${notNeeded.map((c) => escapeHtml(c.label)).join(", ")}</div>`);
  }
  return lines.join("");
}
