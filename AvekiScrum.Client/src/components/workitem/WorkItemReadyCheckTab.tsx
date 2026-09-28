import { useEffect, useMemo, useState } from "react";
import { updateWorkItemFields, type WorkItemDetail } from "../../api/workitems";
import { fetchAllPeople, type PersonOption } from "../../api/people";
import { approverIsFromSignIn, loadApprover, saveApprover } from "../../auth/approverIdentity";
import { useToast } from "../Toast";
import { Section } from "./Section";
import { assignTasks, composeBehovsbedomningSummary, type NeedDecision } from "./behovsbedomningLogic";
import {
  ASSESSMENTS,
  composeDoRDecision,
  investCheckedCount,
  INVEST_ITEMS,
  READY_QUESTIONS,
  type Assessment,
  type InvestChecks,
  type ReadyAnswer,
  type ReadyAnswers,
} from "./dorDecisionLogic";
import "./WorkItemReadyCheckTab.css";

interface StatusRowProps {
  label: string;
  ok: boolean;
  detail?: string;
}

function StatusRow({ label, ok, detail }: StatusRowProps) {
  return (
    <div className="rc-status-row">
      <span className="rc-status-row__label">{label}</span>
      <span className={"rc-status-row__mark" + (ok ? " rc-status-row__mark--ok" : "")}>
        {ok ? "✓" : "○"}
        {detail && <span className="rc-status-row__detail">{detail}</span>}
      </span>
    </div>
  );
}

interface WorkItemReadyCheckTabProps {
  detail: WorkItemDetail;
  khOk: boolean;
  bbOk: boolean;
  invest: InvestChecks;
  ready: ReadyAnswers;
  onReadyChange: (ready: ReadyAnswers) => void;
  assessment: Assessment;
  onAssessmentChange: (assessment: Assessment) => void;
  comment: string;
  onCommentChange: (comment: string) => void;
  onApproved: (detail: WorkItemDetail) => void;
  /** Behovsbedömningens per-row decisions, lifted up in WorkItemValidationModal so this tab can
   *  fold them into Custom.DoRDecision - see composeBehovsbedomningSummary. */
  behovsbedomningDecisions: Record<string, NeedDecision | undefined>;
}

/**
 * READY CHECK: the final sign-off tab. Separate from Behovsbedömning's own "Skapa Task" per
 * feedback - creating the DoR-decided tasks and deciding whether the card is ready to pull into a
 * sprint are different questions, and forcing them into one button meant every re-review had to
 * re-decide task creation too.
 *
 * Godkänn DoR is deliberately never disabled: per the design behind Custom.DoRStatus/DoRDecision,
 * a card everyone agrees "Needs refinement" is still worth recording as reviewed - the DoR tag only
 * means "someone looked at this", not "this is perfect". A binary approved/not-approved gate hid
 * that nuance.
 */
export function WorkItemReadyCheckTab({
  detail,
  khOk,
  bbOk,
  invest,
  ready,
  onReadyChange,
  assessment,
  onAssessmentChange,
  comment,
  onCommentChange,
  onApproved,
  behovsbedomningDecisions,
}: WorkItemReadyCheckTabProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approver, setApprover] = useState<PersonOption | null>(loadApprover);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const { showToast } = useToast();
  const fromSignIn = approverIsFromSignIn();

  useEffect(() => {
    if (fromSignIn) return;
    fetchAllPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const investOk = investCheckedCount(invest) === INVEST_ITEMS.length;

  function setAnswer(key: string, value: ReadyAnswer) {
    onReadyChange({ ...ready, [key]: value });
  }

  function chooseApprover(email: string) {
    const person = people.find((p) => p.email === email) ?? null;
    setApprover(person);
    saveApprover(person);
  }

  const existingByCategory = useMemo(() => assignTasks(detail.children, detail.related), [detail.children, detail.related]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const hasDorTag = detail.tags.some((t) => t.trim().toLowerCase() === "dor");
      const behovsbedomningHtml = composeBehovsbedomningSummary(existingByCategory, behovsbedomningDecisions);
      const decisionHtml = composeDoRDecision(behovsbedomningHtml, invest, ready, assessment, comment);
      const updated = await updateWorkItemFields(detail.id, {
        tags: hasDorTag ? detail.tags : [...detail.tags, "DoR"],
        doRStatus: assessment,
        doRDecision: decisionHtml,
        // Custom.DoRApprovedBy is an Identity field - it has to be a real account's email or
        // nothing at all, never a placeholder like "Okänd", which Azure just rejects.
        ...(approver?.email ? { doRApprovedBy: approver.email } : {}),
        doRApprovedDate: new Date().toISOString(),
        doRRevision: detail.rev ?? undefined,
      });
      onApproved(updated);
      showToast(`#${detail.id}: DoR-granskning sparad (${assessment}).`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara granskningen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rc-tab">
      <Section title="Ready Check">
        <div className="rc-status">
          <StatusRow label="Korthygien" ok={khOk} />
          <StatusRow label="Behovsbedömning" ok={bbOk} />
          <StatusRow label="INVEST" ok={investOk} detail={`${investCheckedCount(invest)}/${INVEST_ITEMS.length}`} />
        </div>

        <hr className="rc-divider" />

        <div className="rc-questions">
          {READY_QUESTIONS.map((question) => {
            const answer = ready[question.key];
            return (
              <div key={question.key} className="rc-question">
                <span className="rc-question__text">{question.text}</span>
                <div className="rc-question__answers">
                  {(["ja", "nej"] as const).map((value) => {
                    const active = answer === value;
                    const good = active && value === question.goodAnswer;
                    const bad = active && value !== question.goodAnswer;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={"rc-answer" + (good ? " rc-answer--good" : "") + (bad ? " rc-answer--bad" : "")}
                        onClick={() => setAnswer(question.key, value)}
                      >
                        {/* Fixed-width slot so the button doesn't change size depending on whether
                            the check is shown - toggling used to visibly resize the row. */}
                        <span className="rc-answer__check">{good ? "✓" : ""}</span>
                        {value === "ja" ? "Ja" : "Nej"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <hr className="rc-divider" />

        <div className="rc-assessment">
          <span className="rc-assessment__title">Bedömning:</span>
          {ASSESSMENTS.map((option) => (
            <label key={option.key} className="rc-assessment__option">
              <input
                type="radio"
                name="rc-assessment"
                checked={assessment === option.key}
                onChange={() => onAssessmentChange(option.key)}
              />
              {option.label}
            </label>
          ))}
        </div>

        <div className="rc-comment">
          <label className="rc-comment__label" htmlFor="rc-comment-input">
            Kommentar vid behov
          </label>
          <textarea
            id="rc-comment-input"
            rows={3}
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Valfritt - motivering, vad som saknas, vad som avgjorde bedömningen…"
          />
        </div>

        {!fromSignIn && (
          <div className="rc-approver">
            <label className="rc-approver__label" htmlFor="rc-approver-select">
              Vem är du? <span className="rc-approver__hint">(ingen inloggning i PAT-läge - krävs för Godkänd av)</span>
            </label>
            <select id="rc-approver-select" value={approver?.email ?? ""} onChange={(e) => chooseApprover(e.target.value)}>
              <option value="">– välj –</option>
              {people.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {detail.doRApprovedBy && (
          <p className="rc-last-approved">
            Senast granskad av <strong>{detail.doRApprovedBy}</strong>
            {detail.doRApprovedDate && ` den ${new Date(detail.doRApprovedDate).toLocaleDateString("sv-SE")}`}
            {detail.doRRevision != null && ` (revision ${detail.doRRevision})`}.
          </p>
        )}

        {error && <p className="wi-modal__status wi-modal__status--error">{error}</p>}

        <div className="rc-submit">
          <button type="button" className="wi-btn wi-btn--success" onClick={() => void submit()} disabled={saving}>
            {saving ? "Sparar…" : "Godkänn DoR"}
          </button>
        </div>
      </Section>
    </div>
  );
}
