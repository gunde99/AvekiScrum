import { useEffect, useMemo, useState } from "react";
import {
  createHelptextStory,
  createWorkItemTasks,
  deleteWorkItem,
  fetchWorkItemDetail,
  type WorkItemDetail,
  type WorkItemRelationRef,
} from "../../api/workitems";
import { Section } from "./Section";
import { useToast } from "../Toast";
import "./WorkItemBehovsbedomningTab.css";

type NeedDecision = "create" | "not-needed";

interface NeedCategory {
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

const CATEGORIES: NeedCategory[] = [
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
 * unambiguous (Testing has a single category; the four Documentation categories are told apart by
 * prefix alone). Anything still unclaimed counts as plain development work, including the many
 * real tasks that carry no Activity at all.
 */
function assignTasks(children: WorkItemRelationRef[], related: WorkItemRelationRef[]): Record<string, WorkItemRelationRef | undefined> {
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
    // Documentation work with no recognisable prefix belongs to no specific row - leaving it
    // unclaimed is better than crediting an arbitrary documentation category with it.
    if (sameActivity(task.activity, "Documentation")) continue;
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

interface WorkItemBehovsbedomningTabProps {
  detail: WorkItemDetail;
  korthygienOk: boolean;
  onUpdated: (detail: WorkItemDetail) => void;
  /** Reports this tab's live "fully ok" state up so the tab bar can show the same ✓ badge as
   *  Korthygien - the per-row decisions live here, so the modal can't derive it on its own. */
  onOkChange?: (ok: boolean) => void;
  /** Saves the Korthygien draft plus any extra tags in one request - approving has to persist
   *  both tabs, and both write `tags`, so they can't be two separate saves. */
  onPersist: (extraTags: string[]) => Promise<WorkItemDetail>;
  /** Fired after a successful approve so the modal can close and the board can refresh. */
  onApproved?: () => void;
}

export function WorkItemBehovsbedomningTab({
  detail,
  korthygienOk,
  onUpdated,
  onOkChange,
  onPersist,
  onApproved,
}: WorkItemBehovsbedomningTabProps) {
  const [decisions, setDecisions] = useState<Record<string, NeedDecision | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const existingByCategory = useMemo(() => assignTasks(detail.children, detail.related), [detail.children, detail.related]);

  // Reset per-row decisions whenever the card (or its children) changes - nothing is pre-checked
  // except rows where a matching task genuinely already exists. Every other row must be actively
  // decided by the person going through the checklist.
  useEffect(() => {
    setDecisions({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id, detail.children, detail.related]);

  const hasDorTag = useMemo(() => detail.tags.some((t) => t.trim().toLowerCase() === "dor"), [detail.tags]);

  // The DoR tag *is* the record that every row was decided. A category with no task on an
  // approved card therefore means "behövs ej" - the same reading the board's N/A pills use -
  // rather than an unanswered question the person is being asked again.
  const decisionFor = (key: string): NeedDecision | undefined =>
    decisions[key] ?? (hasDorTag && !existingByCategory[key] ? "not-needed" : undefined);

  const allDecided = CATEGORIES.every((c) => existingByCategory[c.key] || decisionFor(c.key));
  const canApprove = allDecided && korthygienOk;
  const sectionOk = hasDorTag || canApprove;

  useEffect(() => {
    onOkChange?.(sectionOk);
  }, [sectionOk, onOkChange]);

  /** Creates the category's card straight away - used once the card is already DoR-approved,
   *  where there is no pending approval left to defer the work to. */
  async function createNow(category: NeedCategory) {
    setBusyRow(category.key);
    setError(null);
    try {
      if (category.key === "helptext") await createHelptextStory(detail.id);
      else await createWorkItemTasks(detail.id, [{ title: category.label, activity: category.activity }]);
      onUpdated(await fetchWorkItemDetail(detail.id));
      showToast(`${category.label} skapad på #${detail.id}.`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa kortet.");
    } finally {
      setBusyRow(null);
    }
  }

  /** Switches an already-created category back to "behövs ej" by deleting its card. Azure keeps
   *  it in the recycle bin, so this is recoverable. */
  async function removeNow(category: NeedCategory, existing: WorkItemRelationRef) {
    if (!window.confirm(`Ta bort #${existing.id} "${existing.title}"?\n\nKortet hamnar i papperskorgen i Azure DevOps och går att återställa där.`))
      return;
    setBusyRow(category.key);
    setError(null);
    try {
      await deleteWorkItem(existing.id);
      onUpdated(await fetchWorkItemDetail(detail.id));
      showToast(`#${existing.id} borttagen - ${category.label} markerad som "behövs ej".`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort kortet.");
    } finally {
      setBusyRow(null);
    }
  }

  async function handleApprove() {
    setSaving(true);
    setError(null);
    try {
      const toCreate = CATEGORIES.filter((c) => !existingByCategory[c.key] && decisions[c.key] === "create");
      // Hjälptext now creates a separate related User Story + Task, everything else still
      // creates a plain child Task.
      const directTasks = toCreate.filter((c) => c.key !== "helptext");
      if (directTasks.length > 0) {
        await createWorkItemTasks(
          detail.id,
          directTasks.map((c) => ({ title: c.label, activity: c.activity })),
        );
      }
      const createdHelptext = toCreate.some((c) => c.key === "helptext");
      if (createdHelptext) {
        await createHelptextStory(detail.id);
      }
      // Persists the Korthygien tab's edits together with the DoR tag - approving is the final
      // step of the whole validation, so it shouldn't silently discard the other tab's work.
      const updated = await onPersist(["DoR"]);
      onUpdated(updated);

      const createdCount = directTasks.length + (createdHelptext ? 1 : 0);
      const parts = [hasDorTag ? "DoR-tagg fanns redan" : "DoR-tagg satt"];
      if (createdCount > 0) parts.push(createdCount === 1 ? "1 task skapad" : `${createdCount} tasks skapade`);
      else parts.push("inga nya tasks behövdes");
      showToast(`#${detail.id}: ${parts.join(" och ")}.`, "success");
      onApproved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara behovsbedömningen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bb-tab">
      <Section title="Behovsbedömning" hint={hasDorTag ? "Kortet har DoR-taggen" : "Kortet saknar DoR-taggen"} ok={sectionOk}>
        <p className="bb-intro">
          {hasDorTag ? (
            <>
              Kortet är DoR-godkänt. Varje rad går att ändra i efterhand - <em>Behövs ej</em> tar bort kortet, och{" "}
              <em>Skapa task</em> lägger tillbaka det. Ändringarna slår igenom direkt.
            </>
          ) : (
            <>
              Gå igenom varje rad och ta aktivt ställning. Godkännandet sparar även Korthygien-fliken, sätter taggen{" "}
              <code>DoR</code> och skapar de valda task-korten.
            </>
          )}
        </p>
        <div className="bb-rows">
          {CATEGORIES.map((category) => {
            const existing = existingByCategory[category.key];
            const decision = decisionFor(category.key);
            const decided = !!existing || !!decision;
            const busy = busyRow === category.key;

            return (
              <div key={category.key} className="bb-row">
                <span className="bb-row__label">{category.label}</span>
                <span className={`bb-pill ${decided ? "bb-pill--ok" : "bb-pill--pending"}`}>
                  {decided ? "Uppfyllt" : "Ej valt"}
                </span>
                <div className="bb-row__control">
                  {/* Both options are always offered. Before approval, "Skapa task" only records
                      the intent and Godkänn does the work; afterwards each click acts at once,
                      since there is no approval step left to carry it out. */}
                  <div className="bb-switch">
                    <button
                      type="button"
                      className={`bb-switch__opt ${existing || decision === "create" ? "bb-switch__opt--active" : ""}`}
                      disabled={busy || !!existing}
                      onClick={() =>
                        hasDorTag ? void createNow(category) : setDecisions((d) => ({ ...d, [category.key]: "create" }))
                      }
                    >
                      Skapa task
                    </button>
                    <button
                      type="button"
                      className={`bb-switch__opt ${!existing && decision === "not-needed" ? "bb-switch__opt--active" : ""}`}
                      disabled={busy}
                      onClick={() =>
                        existing ? void removeNow(category, existing) : setDecisions((d) => ({ ...d, [category.key]: "not-needed" }))
                      }
                    >
                      {busy ? "…" : "Behövs ej"}
                    </button>
                  </div>
                  {existing && (
                    <span className="bb-existing">
                      Finns redan: #{existing.id} {existing.title} ({existing.state})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="bb-error">{error}</p>}
        {!hasDorTag && (
          <button
            type="button"
            className="wi-btn wi-btn--success bb-approve"
            onClick={handleApprove}
            disabled={saving || !canApprove}
            title={canApprove ? undefined : !allDecided ? "Ta ställning till varje rad först" : "Korthygien måste också vara uppfylld"}
          >
            {saving ? "Sparar…" : "Godkänn DoR"}
          </button>
        )}
      </Section>
    </div>
  );
}
