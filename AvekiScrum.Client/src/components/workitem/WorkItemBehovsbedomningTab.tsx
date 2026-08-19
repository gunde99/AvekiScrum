import { useEffect, useMemo, useState } from "react";
import { createHelptextStory, createWorkItemTasks, type WorkItemDetail, type WorkItemRelationRef } from "../../api/workitems";
import { Section } from "./Section";
import { useToast } from "../Toast";
import "./WorkItemBehovsbedomningTab.css";

type NeedDecision = "create" | "not-needed";

interface NeedCategory {
  key: string;
  label: string;
  activity: string;
  /** Keywords used to spot a matching task that already exists among the card's children. Also
   *  used to exclude "Utveckling"'s match from grabbing another category's Development-activity task. */
  detectKeywords: string[];
}

const CATEGORIES: NeedCategory[] = [
  { key: "development", label: "Utveckling", activity: "Development", detectKeywords: [] },
  { key: "audit", label: "Auditloggning", activity: "Development", detectKeywords: ["audit"] },
  { key: "test", label: "Test", activity: "Testing", detectKeywords: [] },
  { key: "helptext", label: "Hjälptext", activity: "Documentation", detectKeywords: ["hjälptext", "hjalptext"] },
  { key: "dbdoc", label: "Databasdokumentation", activity: "Documentation", detectKeywords: ["databasdok"] },
  { key: "techdoc", label: "Teknisk dokumentation", activity: "Documentation", detectKeywords: ["teknisk dok"] },
  { key: "versionchange", label: "Versionsförändring", activity: "Documentation", detectKeywords: ["versionsförändring", "versionsforandring"] },
];

const AUDIT_KEYWORDS = CATEGORIES.find((c) => c.key === "audit")!.detectKeywords;

function matchesKeywords(title: string, keywords: string[]): boolean {
  const lower = title.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function findExistingTask(
  category: NeedCategory,
  children: WorkItemRelationRef[],
  related: WorkItemRelationRef[],
): WorkItemRelationRef | undefined {
  const tasks = children.filter((c) => c.type === "Task" && c.activity === category.activity);
  if (category.key === "development") {
    // "Utveckling" is whichever Development-activity task ISN'T the Audit task - the base dev
    // work is identified by exclusion, the same way the rest of the app already treats it.
    return tasks.find((t) => !matchesKeywords(t.title, AUDIT_KEYWORDS));
  }
  if (category.key === "helptext") {
    // Transition period: hjälptext work used to live as a direct child Task, and is now being
    // broken out into a separate related User Story (with its own Documentation task) instead.
    // Recognize either pattern so this row doesn't offer to create a duplicate.
    const directTask = tasks.find((t) => matchesKeywords(t.title, category.detectKeywords));
    if (directTask) return directTask;
    return related.find((r) => r.type === "User Story" && matchesKeywords(r.title, category.detectKeywords));
  }
  if (category.detectKeywords.length === 0) return tasks[0];
  return tasks.find((t) => matchesKeywords(t.title, category.detectKeywords));
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
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const existingByCategory = useMemo(() => {
    const map: Record<string, WorkItemRelationRef | undefined> = {};
    for (const category of CATEGORIES) map[category.key] = findExistingTask(category, detail.children, detail.related);
    return map;
  }, [detail.children, detail.related]);

  // Reset per-row decisions whenever the card (or its children) changes - nothing is pre-checked
  // except rows where a matching task genuinely already exists. Every other row must be actively
  // decided by the person going through the checklist.
  useEffect(() => {
    setDecisions({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id, detail.children, detail.related]);

  const hasDorTag = useMemo(() => detail.tags.some((t) => t.trim().toLowerCase() === "dor"), [detail.tags]);

  const allDecided = CATEGORIES.every((c) => existingByCategory[c.key] || decisions[c.key]);
  const canApprove = allDecided && korthygienOk;
  const sectionOk = hasDorTag || canApprove;

  useEffect(() => {
    onOkChange?.(sectionOk);
  }, [sectionOk, onOkChange]);

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
          Gå igenom varje rad och ta aktivt ställning. Godkännandet sparar även Korthygien-fliken, sätter taggen{" "}
          <code>DoR</code> och skapar de valda task-korten.
        </p>
        <div className="bb-rows">
          {CATEGORIES.map((category) => {
            const existing = existingByCategory[category.key];
            const decision = decisions[category.key];
            const decided = !!existing || !!decision;

            return (
              <div key={category.key} className="bb-row">
                <span className="bb-row__label">{category.label}</span>
                <span className={`bb-pill ${decided ? "bb-pill--ok" : "bb-pill--pending"}`}>
                  {decided ? "Uppfyllt" : "Ej valt"}
                </span>
                <div className="bb-row__control">
                  {existing ? (
                    <span className="bb-existing">
                      Finns redan: #{existing.id} {existing.title} ({existing.state})
                    </span>
                  ) : (
                    <div className="bb-switch">
                      <button
                        type="button"
                        className={`bb-switch__opt ${decision === "create" ? "bb-switch__opt--active" : ""}`}
                        onClick={() => setDecisions((d) => ({ ...d, [category.key]: "create" }))}
                      >
                        Skapa task
                      </button>
                      <button
                        type="button"
                        className={`bb-switch__opt ${decision === "not-needed" ? "bb-switch__opt--active" : ""}`}
                        onClick={() => setDecisions((d) => ({ ...d, [category.key]: "not-needed" }))}
                      >
                        Behövs ej
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="bb-error">{error}</p>}
        <button
          type="button"
          className="wi-btn wi-btn--success bb-approve"
          onClick={handleApprove}
          disabled={saving || !canApprove}
          title={canApprove ? undefined : !allDecided ? "Ta ställning till varje rad först" : "Korthygien måste också vara uppfylld"}
        >
          {saving ? "Sparar…" : "Godkänn DoR"}
        </button>
      </Section>
    </div>
  );
}
