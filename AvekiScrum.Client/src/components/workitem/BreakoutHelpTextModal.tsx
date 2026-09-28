import { useMemo, useState } from "react";
import { breakoutHelpText, fetchWorkItemDetail, type WorkItemDetail, type WorkItemRelationRef } from "../../api/workitems";
import { StatePill } from "./StatePill";
import { Section } from "./Section";
import { findHelpTextTaskCandidates, resolveHelpTextTask } from "./helpTextBreakoutLogic";
import "./WorkItemModal.css";
import "./BreakoutHelpTextModal.css";

interface BreakoutHelpTextModalProps {
  detail: WorkItemDetail;
  onClose: () => void;
  /** Handed the source card's own reloaded detail - the moved task drops out of its Taskboard,
   *  and the new story shows up as a Related card - so the tabs behind this modal are current the
   *  moment it closes, with no separate fetch on their part. */
  onChanged: (detail: WorkItemDetail) => void;
}

/**
 * "Bryt ut hjälptext": moves the story's own Documentation-activity Task onto a brand new,
 * Related-linked User Story, owned by whoever the Task was already assigned to - not the
 * story's developer. When there's no such Task yet, offers to create one first; when there's
 * more than one open Documentation task and the title doesn't make it obvious which is the
 * right one, asks instead of guessing. See helpTextBreakoutLogic.ts for the matching rules and
 * the "helptext-breakout" endpoint in Program.cs for what actually moves.
 */
export function BreakoutHelpTextModal({ detail, onClose, onChanged }: BreakoutHelpTextModalProps) {
  const candidates = useMemo(() => findHelpTextTaskCandidates(detail.children), [detail.children]);
  const resolved = useMemo(() => resolveHelpTextTask(candidates), [candidates]);

  const [pickedId, setPickedId] = useState<number | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ storyId: number } | null>(null);

  const chosen: WorkItemRelationRef | null = resolved ?? candidates.find((c) => c.id === pickedId) ?? null;
  const needsPick = candidates.length > 1 && resolved === null;
  const canSubmit = !saving && (chosen !== null || (candidates.length === 0 && createNew));

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const outcome = await breakoutHelpText(detail.id, chosen ? chosen.id : null);
      onChanged(await fetchWorkItemDetail(detail.id));
      setResult({ storyId: outcome.storyId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte bryta ut hjälptexten.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wi-modal-overlay" onClick={onClose}>
      <div className="wi-modal ht-breakout-modal" onClick={(e) => e.stopPropagation()}>
        <header className="wi-modal__header">
          <span className="wi-modal__type-icon">📗</span>
          <div className="wi-modal__title-block">
            <div className="wi-modal__title-text">Bryt ut hjälptext</div>
            <div className="wi-modal__subline">
              <span className="wi-modal__iteration">
                Skapar en ny User Story, relaterad till #{detail.id}, och flyttar Hjälptext-Tasken dit
              </span>
            </div>
          </div>
          <button type="button" className="wi-modal__close" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </header>

        <div className="wi-modal__body">
          {result ? (
            <Section title="Hjälptexten är utbruten" ok>
              <p>
                En ny User Story (#{result.storyId}) är skapad, relaterad till #{detail.id}, och Documentation-tasken
                ligger nu under den istället.
              </p>
            </Section>
          ) : candidates.length === 0 && !createNew ? (
            <Section title="Ingen Hjälptext-task hittades">
              <p>
                Hittade ingen Task med aktivitet <strong>Documentation</strong> som inte redan är Closed under #{detail.id}.
                Vill du skapa en ny och bryta ut den direkt till en egen User Story?
              </p>
            </Section>
          ) : needsPick ? (
            <Section title="Flera möjliga Hjälptext-tasks" hint="välj vilken som ska flyttas">
              <p className="ht-breakout__hint">
                Flera icke-stängda Tasks har aktivitet Documentation och titeln avgör inte ensam vilken som är rätt. Välj en.
              </p>
              <div className="ht-breakout__candidates">
                {candidates.map((c) => (
                  <label key={c.id} className={"ht-breakout__candidate" + (pickedId === c.id ? " ht-breakout__candidate--selected" : "")}>
                    <input type="radio" name="ht-task" checked={pickedId === c.id} onChange={() => setPickedId(c.id)} />
                    <span className="ht-breakout__candidate-body">
                      <span className="ht-breakout__candidate-head">
                        <span className="ht-breakout__candidate-id">#{c.id}</span>
                        <span className="ht-breakout__candidate-title">{c.title}</span>
                        <StatePill state={c.state} size="sm" />
                      </span>
                      <span className="ht-breakout__candidate-meta">{c.assignedTo || "Ej tilldelad"}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Section>
          ) : (
            chosen && (
              <Section title="Task som flyttas">
                <div className="ht-breakout__chosen">
                  <div className="ht-breakout__chosen-head">
                    <span className="ht-breakout__candidate-id">#{chosen.id}</span>
                    <span className="ht-breakout__candidate-title">{chosen.title}</span>
                    <StatePill state={chosen.state} size="sm" />
                  </div>
                  <p className="ht-breakout__hint">
                    Den nya User Storyn blir tilldelad <strong>{chosen.assignedTo || "samma person som Tasken (ej tilldelad)"}</strong>{" "}
                    - inte utvecklaren på #{detail.id}.
                  </p>
                </div>
              </Section>
            )
          )}

          {error && <p className="wi-modal__status wi-modal__status--error">{error}</p>}
        </div>

        <footer className="wi-modal__footer">
          <span className="wi-modal__footer-spacer" />
          {result ? (
            <button type="button" className="wi-btn wi-btn--primary" onClick={onClose}>
              Stäng
            </button>
          ) : (
            <>
              <button type="button" className="wi-btn" onClick={onClose} disabled={saving}>
                Avbryt
              </button>
              {candidates.length === 0 && !createNew ? (
                <button type="button" className="wi-btn wi-btn--primary" onClick={() => setCreateNew(true)}>
                  Skapa en ny
                </button>
              ) : (
                <button type="button" className="wi-btn wi-btn--primary" onClick={() => void submit()} disabled={!canSubmit}>
                  {saving ? "Bryter ut…" : "Bryt ut hjälptext"}
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
