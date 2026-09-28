import { useEffect, useState } from "react";
import { createDocumentationHelpTextTask } from "../../api/documentation";
import { fetchAllPeople, type PersonOption } from "../../api/people";
import { RichTextEditor } from "./RichTextEditor";
import { Section } from "./Section";
import {
  composeHelpTextDescription,
  EMPTY_HELPTEXT_PARTS,
  HELPTEXT_FIELDS,
  type HelpTextRequestParts,
} from "./helpTextRequestLogic";
import "./WorkItemModal.css";
// Reuses the input/label styles from AvekiSupport's form - same established cross-module pattern
// as NewBugForm.tsx already uses for wi-btn, just the other direction.
import "../../support/SupportViews.css";

interface RequestHelpTextModalProps {
  /** The card this help text belongs to - never modified beyond the Related link Azure mirrors
   *  onto it automatically once the new Task is created. */
  workItemId: number;
  workItemTitle: string;
  onClose: (created: boolean) => void;
}

/**
 * "Beställ hjälptext": additive to the DoR checklist's own "Hjälptext" row, which still creates its
 * separate related User Story in this project unchanged. This one creates the Task directly in the
 * Dokumentation project instead - the same place TD already puts it by hand - so the card this
 * modal is opened from can be closed the moment development is done, without waiting on
 * documentation. See docs/AVEKIDOKUMENTATION.md.
 */
export function RequestHelpTextModal({ workItemId, workItemTitle, onClose }: RequestHelpTextModalProps) {
  const [title, setTitle] = useState(workItemTitle);
  const [parts, setParts] = useState<HelpTextRequestParts>(EMPTY_HELPTEXT_PARTS);
  const [assignedTo, setAssignedTo] = useState("");
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; url: string } | null>(null);

  useEffect(() => {
    fetchAllPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  // Deliberately not gated on the three text fields: whoever clicks "Beställ hjälptext" on a
  // US/Bug often doesn't know yet what the text should say - that's the konsults job, done later
  // from their own view. All this needs is a title, which is already prefilled from the card.
  const canSubmit = title.trim().length > 0 && !saving;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await createDocumentationHelpTextTask({
        relatedWorkItemId: workItemId,
        title: title.trim(),
        descriptionHtml: composeHelpTextDescription(parts),
        assignedTo: assignedTo.trim() || null,
      });
      setCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa hjälptextkortet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wi-modal-overlay" onClick={() => onClose(!!created)}>
      <div className="wi-modal" onClick={(e) => e.stopPropagation()}>
        <header className="wi-modal__header">
          <span className="wi-modal__type-icon">📗</span>
          <div className="wi-modal__title-block">
            <div className="wi-modal__title-text">Beställ hjälptext</div>
            <div className="wi-modal__subline">
              <span className="wi-modal__iteration">
                Skapas i Dokumentation-projektet, kopplad till #{workItemId}
              </span>
            </div>
          </div>
          <button type="button" className="wi-modal__close" onClick={() => onClose(!!created)} aria-label="Stäng">
            ✕
          </button>
        </header>

        <div className="wi-modal__body">
          {created ? (
            <Section title="Hjälptextkortet är skapat" ok>
              <p>
                Kortet ligger nu under BESTÄLLNING i Dokumentation-projektet, länkat till #{workItemId}. Konsultansvarig
                fördelar det vidare till rätt konsult.
              </p>
              <div className="bb-existing" style={{ marginTop: 8 }}>
                <a className="wi-btn wi-btn--primary" href={created.url} target="_blank" rel="noreferrer">
                  Öppna #{created.id} i Azure DevOps
                </a>
              </div>
            </Section>
          ) : (
            <>
              <Section title="Vad handlar det om?">
                <label className="sup-label" htmlFor="ht-title">
                  Rubrik
                </label>
                <input
                  id="ht-title"
                  className="sup-input sup-input--wide"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Produkt och funktion, t.ex. VA-banken - Sök punkt"
                />
                <p className="sup-repro__hint">
                  Kortet får titeln "Hjälptext - {title.trim() || "…"}" om den inte redan börjar med Hjälptext.
                </p>

                <label className="sup-label" htmlFor="ht-assignee" style={{ marginTop: 12 }}>
                  Tilldela direkt (valfritt)
                </label>
                <input
                  id="ht-assignee"
                  className="sup-input sup-input--wide"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="Lämna tomt - konsultansvarig fördelar det på dashboarden"
                  list="ht-people"
                />
                <datalist id="ht-people">
                  {people.map((person) => (
                    <option key={person.email} value={person.displayName} />
                  ))}
                </datalist>
              </Section>

              <Section title="Hjälptextmall" hint="Samma mall som Dokumentation-projektets Task-mall">
                <p className="sup-card__hint">
                  Valfritt att fylla i nu - vet du inte ännu vad texten ska handla om går det bra att
                  beställa tomt. Konsulten som får kortet fyller i detaljerna från sin egen vy.
                </p>
                {HELPTEXT_FIELDS.map((field) => (
                  <div className="sup-repro" key={field.key}>
                    <label className="sup-label">{field.heading}</label>
                    <p className="sup-repro__hint">{field.hint}</p>
                    <RichTextEditor
                      value={parts[field.key]}
                      onChange={(value) => setParts((prev) => ({ ...prev, [field.key]: value }))}
                      minRows={field.rows}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </Section>

              {error && <p className="wi-modal__status wi-modal__status--error">{error}</p>}
            </>
          )}
        </div>

        <footer className="wi-modal__footer">
          <span className="wi-modal__footer-spacer" />
          {created ? (
            <button type="button" className="wi-btn wi-btn--primary" onClick={() => onClose(true)}>
              Stäng
            </button>
          ) : (
            <>
              <button type="button" className="wi-btn" onClick={() => onClose(false)} disabled={saving}>
                Avbryt
              </button>
              <button type="button" className="wi-btn wi-btn--primary" disabled={!canSubmit} onClick={() => void submit()}>
                {saving ? "Skapar…" : "Skapa hjälptextkort"}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
