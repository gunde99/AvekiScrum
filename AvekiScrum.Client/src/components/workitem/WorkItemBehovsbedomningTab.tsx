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
import { assignTasks, CATEGORIES, type NeedCategory, type NeedDecision } from "./behovsbedomningLogic";
import "./WorkItemBehovsbedomningTab.css";

interface WorkItemBehovsbedomningTabProps {
  detail: WorkItemDetail;
  onUpdated: (detail: WorkItemDetail) => void;
  /** Reports this tab's live "every row decided" state up so the tab bar can show a ✓ badge. */
  onOkChange?: (ok: boolean) => void;
  /** Lifted to the parent (rather than local state) so Godkännande can read the same decisions
   *  when composing Custom.DoRDecision - see WorkItemValidationModal and composeBehovsbedomningSummary. */
  decisions: Record<string, NeedDecision | undefined>;
  onDecisionsChange: (decisions: Record<string, NeedDecision | undefined>) => void;
}

export function WorkItemBehovsbedomningTab({ detail, onUpdated, onOkChange, decisions, onDecisionsChange }: WorkItemBehovsbedomningTabProps) {
  const [creating, setCreating] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const existingByCategory = useMemo(() => assignTasks(detail.children, detail.related), [detail.children, detail.related]);

  const allDecided = CATEGORIES.every((c) => existingByCategory[c.key] || decisions[c.key]);

  useEffect(() => {
    onOkChange?.(allDecided);
  }, [allDecided, onOkChange]);

  function decide(key: string, decision: NeedDecision) {
    onDecisionsChange({ ...decisions, [key]: decision });
  }

  // What "Skapa Task" would actually do right now - categories decided "create" that don't
  // already have a task. Recomputed from the card's own children/related, so a category created
  // in a previous click (by this button, or by hand in Azure) drops out on its own.
  const pending = CATEGORIES.filter((c) => !existingByCategory[c.key] && decisions[c.key] === "create");

  /** Creates every category currently decided "create" that doesn't already have a task - safe to
   *  click more than once, since anything already created is skipped via existingByCategory. */
  async function createPendingTasks() {
    if (pending.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const directTasks = pending.filter((c) => c.key !== "helptext");
      if (directTasks.length > 0) {
        await createWorkItemTasks(
          detail.id,
          directTasks.map((c) => ({ title: c.label, activity: c.activity })),
        );
      }
      // Hjälptext creates a separate related User Story + Task, everything else a plain child Task.
      if (pending.some((c) => c.key === "helptext")) {
        await createHelptextStory(detail.id);
      }
      onUpdated(await fetchWorkItemDetail(detail.id));
      showToast(`${pending.length === 1 ? "1 task skapad" : `${pending.length} tasks skapade`} på #${detail.id}.`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa tasks.");
    } finally {
      setCreating(false);
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

  return (
    <div className="bb-tab">
      <Section title="Behovsbedömning" hint={allDecided ? "Alla rader är beslutade" : "Ta ställning till varje rad"} ok={allDecided}>
        <p className="bb-intro">
          Gå igenom varje rad och ta aktivt ställning. Klicka sedan <strong>Skapa Task</strong> - det går bra att
          komma tillbaka och köra den igen senare, den skapar bara det som tillkommit sen sist.
        </p>
        <div className="bb-rows">
          {CATEGORIES.map((category) => {
            const existing = existingByCategory[category.key];
            const decision = decisions[category.key];
            const decided = !!existing || !!decision;
            const busy = busyRow === category.key;

            return (
              <div key={category.key} className="bb-row">
                <span className="bb-row__label">{category.label}</span>
                <span className={`bb-pill ${decided ? "bb-pill--ok" : "bb-pill--pending"}`}>
                  {decided ? "Uppfyllt" : "Ej valt"}
                </span>
                <div className="bb-row__control">
                  <div className="bb-switch">
                    <button
                      type="button"
                      className={`bb-switch__opt ${existing || decision === "create" ? "bb-switch__opt--active" : ""}`}
                      disabled={busy || !!existing}
                      onClick={() => decide(category.key, "create")}
                    >
                      Ska skapas
                    </button>
                    <button
                      type="button"
                      className={`bb-switch__opt ${!existing && decision === "not-needed" ? "bb-switch__opt--active" : ""}`}
                      disabled={busy}
                      onClick={() => (existing ? void removeNow(category, existing) : decide(category.key, "not-needed"))}
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
        <button
          type="button"
          className="wi-btn wi-btn--success bb-approve"
          onClick={() => void createPendingTasks()}
          disabled={creating || pending.length === 0}
          title={pending.length === 0 ? "Inget nytt att skapa just nu" : undefined}
        >
          {creating ? "Skapar…" : pending.length > 0 ? `Skapa Task (${pending.length})` : "Skapa Task"}
        </button>
      </Section>
    </div>
  );
}
