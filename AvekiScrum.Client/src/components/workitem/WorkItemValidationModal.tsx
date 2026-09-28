import { useEffect, useState } from "react";
import {
  fetchClassification,
  fetchParentCandidates,
  fetchWorkItemDetail,
  updateWorkItemFields,
  type ClassificationOptions,
  type ParentCandidate,
  type WorkItemDetail,
  type WorkItemRelationRef,
} from "../../api/workitems";
import { fetchTeamMembers, fetchDevelopers, type PersonOption } from "../../api/people";
import type { DailyStoryDto, DeveloperTeamId } from "../../api/dailys";
import { WorkItemModal } from "./WorkItemModal";
import { WorkItemKorthygienTab, draftFromDetail, korthygienOk, type KorthygienDraft } from "./WorkItemKorthygienTab";
import { WorkItemBehovsbedomningTab } from "./WorkItemBehovsbedomningTab";
import type { NeedDecision } from "./behovsbedomningLogic";
import { WorkItemInvestTab } from "./WorkItemInvestTab";
import { WorkItemReadyCheckTab } from "./WorkItemReadyCheckTab";
import { WorkItemDodTab } from "./WorkItemDodTab";
import { hasDodTag } from "../../boards/dailys/dailysLogic";
import { getWorkItemTypeConfig } from "./workItemTypeConfig";
import {
  EMPTY_INVEST_CHECKS,
  EMPTY_READY_ANSWERS,
  INVEST_ITEMS,
  investCheckedCount,
  parseDoRDecision,
  type Assessment,
  type InvestChecks,
  type ReadyAnswers,
} from "./dorDecisionLogic";
import "./WorkItemModal.css";
import "./WorkItemValidationModal.css";

type ValidationTab = "korthygien" | "behovsbedomning" | "invest" | "godkannande" | "dod";

export function hasDorTag(detail: Pick<WorkItemDetail, "tags">): boolean {
  return detail.tags.some((t) => t.trim().toLowerCase() === "dor");
}

/** WorkItemModal's embedded mode needs an onClose, but there is nothing to close here - both
 *  panes live for as long as this dialog does. */
function noop() {
  /* no-op */
}

interface WorkItemValidationModalProps {
  workItemId: number;
  team: DeveloperTeamId;
  onClose: () => void;
  onOpenRelation?: (item: WorkItemRelationRef) => void;
  /** Fired after Godkänn DoR, so the board can pull in the new tag/status. Unlike the old
   *  single-shot approval, this no longer closes the dialog - per feedback, saving a review that
   *  isn't a clean "Ready" is exactly the point, so there is no final step to close on. */
  onApproved?: () => void;
  /** The board's own view of the card. Without it the Definition of Done tab has nothing to draw:
   *  the four delivery boxes are built from the row's tasks and PRs, not from the work item. */
  story?: DailyStoryDto;
  /** Fired after a DoD sign-off so the board can drop the card's warnings straight away. */
  onDodApproved?: (storyId: number) => void;
}

/**
 * Card validation, two panes: the full editable card on the left (an embedded WorkItemModal - the
 * same one the rest of the app uses, so nothing about editing behaves differently here) and every
 * validation tab on the right (Korthygien, Behovsbedömning, INVEST, Godkännande, and Definition of
 * Done when the board hands over its row). The two panes fetch independently, so each side bumps
 * a refresh key on the other after it writes something - see handleLeftSaved/notifyRightChanged.
 */
export function WorkItemValidationModal({ workItemId, team, onClose, onOpenRelation, onApproved, story, onDodApproved }: WorkItemValidationModalProps) {
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ValidationTab>("korthygien");
  const [draft, setDraft] = useState<KorthygienDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ansvarigOptions, setAnsvarigOptions] = useState<PersonOption[]>([]);
  const [partnerOptions, setPartnerOptions] = useState<PersonOption[]>([]);
  const [behovsbedomningOk, setBehovsbedomningOk] = useState(false);
  const [classification, setClassification] = useState<ClassificationOptions | null>(null);
  const [parentCandidates, setParentCandidates] = useState<ParentCandidate[]>([]);
  const [approvingDod, setApprovingDod] = useState(false);

  // INVEST + Ready check + Godkännande: lifted up here (rather than kept inside those tabs) so
  // switching tabs doesn't lose what was just filled in, and so Godkännande can read INVEST's
  // count without the two tabs needing to talk to each other directly.
  const [invest, setInvest] = useState<InvestChecks>(EMPTY_INVEST_CHECKS);
  const [ready, setReady] = useState<ReadyAnswers>(EMPTY_READY_ANSWERS);
  const [assessment, setAssessment] = useState<Assessment>("Not assessed");
  const [comment, setComment] = useState("");
  // Behovsbedömningens per-row decisions - lifted here (not local to that tab) so Godkännande can
  // fold them into Custom.DoRDecision too. Reset only when switching to a different card, same as
  // the tab's own reset used to be handled - not on every detail.children/related change, which
  // happens on every "Skapa Task" and would otherwise wipe out "Behövs ej" rows that have no other
  // record anywhere.
  const [bbDecisions, setBbDecisions] = useState<Record<string, NeedDecision | undefined>>({});

  // Bumped whenever the right pane writes something, so the left pane's embedded WorkItemModal
  // remounts and refetches instead of showing a now-stale card.
  const [leftRefreshKey, setLeftRefreshKey] = useState(0);

  // Writes the DoD tag. Everything else on this card's warnings follows from that one tag, so
  // there is nothing else to save.
  async function approveDod() {
    if (!detail || !story) return;
    setApprovingDod(true);
    try {
      const updated = await updateWorkItemFields(detail.id, { tags: [...detail.tags, "DoD"] });
      applyRightChange(updated);
      onDodApproved?.(detail.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Kunde inte sätta DoD-taggen.");
    } finally {
      setApprovingDod(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetchTeamMembers(team, controller.signal).then(setAnsvarigOptions).catch(() => setAnsvarigOptions([]));
    fetchDevelopers(controller.signal).then(setPartnerOptions).catch(() => setPartnerOptions([]));
    return () => controller.abort();
  }, [team]);

  // Picker sources for the Korthygien rows. A failure only costs the dropdowns their contents,
  // so neither is allowed to surface an error over the checklist itself.
  useEffect(() => {
    fetchClassification()
      .then(setClassification)
      .catch(() => setClassification(null));
  }, []);

  useEffect(() => {
    if (!detail?.type) return;
    let cancelled = false;
    fetchParentCandidates(detail.type)
      .then((c) => !cancelled && setParentCandidates(c))
      .catch(() => !cancelled && setParentCandidates([]));
    return () => {
      cancelled = true;
    };
  }, [detail?.type]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchWorkItemDetail(workItemId, controller.signal)
      .then((d) => {
        setDetail(d);
        setDraft(draftFromDetail(d));
        // Restores the INVEST/ready-check state from what was saved last time - see
        // dorDecisionLogic.ts. Custom.DoRStatus is its own field and is trusted directly rather
        // than re-parsed out of the decision text.
        const parsed = parseDoRDecision(d.doRDecisionHtml);
        setInvest(parsed.invest);
        setReady(parsed.ready);
        setComment(parsed.comment);
        setAssessment((d.doRStatus as Assessment) || "Not assessed");
        setBbDecisions({});
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [workItemId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /** Any write from the right pane lands here: updates this pane's own copy, and tells the left
   *  pane (a separate, independently-fetched WorkItemModal) that it's now stale. */
  function applyRightChange(updated: WorkItemDetail) {
    setDetail(updated);
    setDraft(draftFromDetail(updated));
    setLeftRefreshKey((k) => k + 1);
  }

  /** The left pane just saved something - if it's still looking at this same card (it can
   *  navigate to a related one via its own breadcrumbs), fold the fresh copy in here too, so the
   *  right pane's checklists react to an edit made on the left without a manual refresh. */
  function handleLeftSaved(updated: WorkItemDetail) {
    if (updated.id !== workItemId) return;
    setDetail(updated);
    setDraft(draftFromDetail(updated));
  }

  /**
   * Writes the Korthygien draft. Behovsbedömningens task creation and Godkännande's DoR-save each
   * write their own fields directly now (see those components) - this one is only Korthygien's own
   * save button.
   */
  async function saveKorthygien() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateWorkItemFields(workItemId, {
        description: draft.description,
        acceptanceCriteria: draft.acceptanceCriteria,
        storyPoints: draft.storyPoints,
        areaPath: draft.areaPath,
        assignedTo: draft.assignedTo,
        developmentPartner: draft.developmentPartnerNotApplicable ? "" : draft.developmentPartner,
        tags: draft.tags,
      });
      applyRightChange(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Kunde inte spara korthygienen.");
    } finally {
      setSaving(false);
    }
  }

  const config = getWorkItemTypeConfig(detail?.type ?? "");
  const khOk = detail && draft ? korthygienOk(detail, draft) : false;
  const investOk = investCheckedCount(invest) === INVEST_ITEMS.length;
  const godkannandeOk = detail ? hasDorTag(detail) : false;

  const tabs: { id: ValidationTab; label: string; ok: boolean }[] = [
    { id: "korthygien", label: "Korthygien", ok: khOk },
    { id: "behovsbedomning", label: "Behovsbedömning", ok: behovsbedomningOk },
    { id: "invest", label: "INVEST", ok: investOk },
    { id: "godkannande", label: "Godkännande", ok: godkannandeOk },
    // Only offered when the board handed over its view of the card - see the story prop.
    ...(story ? [{ id: "dod" as const, label: "Definition of Done", ok: detail ? hasDodTag(detail) : false }] : []),
  ];

  return (
    <div className="wi-modal-overlay" onClick={onClose}>
      <div className="wi-val-shell" onClick={(e) => e.stopPropagation()}>
        <header className="wi-val-topbar">
          <span className="wi-val-topbar__title">
            <span style={{ color: config.color }}>{detail ? config.icon : "…"}</span> Validering
          </span>
          <button type="button" className="wi-modal__close" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </header>

        {loading && <p className="wi-modal__status">Hämtar…</p>}
        {error && <p className="wi-modal__status wi-modal__status--error">Fel: {error}</p>}

        {!loading && !error && detail && draft && (
          <div className="wi-val-panes">
            <div className="wi-val-pane wi-val-pane--left">
              <WorkItemModal key={leftRefreshKey} workItemId={workItemId} embedded onClose={noop} onSaved={handleLeftSaved} />
            </div>

            <div className="wi-val-pane wi-val-pane--right">
              <nav className="wi-tabs">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={
                      "wi-tabs__item" +
                      (tab === t.id ? " wi-tabs__item--active" : "") +
                      (t.ok ? " wi-tabs__item--ok" : "")
                    }
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {t.ok && <span className="wi-tabs__ok-badge">✓</span>}
                  </button>
                ))}
              </nav>

              <div className="wi-val-pane__body">
                {/* Every tab stays mounted and is shown/hidden with CSS: Behovsbedömningens
                    per-row decisions and the INVEST/ready-check state above are lost on unmount
                    otherwise, and the tab bar's ✓ badges would go stale between switches. */}
                <div hidden={tab !== "korthygien"}>
                  <WorkItemKorthygienTab
                    detail={detail}
                    draft={draft}
                    onDraftChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
                    onOpenRelation={onOpenRelation}
                    ansvarigOptions={ansvarigOptions}
                    partnerOptions={partnerOptions}
                    classification={classification}
                    parentCandidates={parentCandidates}
                    onDetailChanged={applyRightChange}
                  />
                  {saveError && <p className="wi-modal__status wi-modal__status--error">{saveError}</p>}
                  <button type="button" className="wi-btn wi-btn--success wi-validation__save" onClick={saveKorthygien} disabled={saving}>
                    {saving ? "Sparar…" : "Spara Korthygien"}
                  </button>
                </div>

                <div hidden={tab !== "behovsbedomning"}>
                  <WorkItemBehovsbedomningTab
                    detail={detail}
                    onOkChange={setBehovsbedomningOk}
                    onUpdated={applyRightChange}
                    decisions={bbDecisions}
                    onDecisionsChange={setBbDecisions}
                  />
                </div>

                <div hidden={tab !== "invest"}>
                  <WorkItemInvestTab checks={invest} onChange={setInvest} />
                </div>

                <div hidden={tab !== "godkannande"}>
                  <WorkItemReadyCheckTab
                    detail={detail}
                    khOk={khOk}
                    bbOk={behovsbedomningOk}
                    invest={invest}
                    ready={ready}
                    onReadyChange={setReady}
                    assessment={assessment}
                    onAssessmentChange={setAssessment}
                    comment={comment}
                    onCommentChange={setComment}
                    behovsbedomningDecisions={bbDecisions}
                    onApproved={(updated) => {
                      applyRightChange(updated);
                      onApproved?.();
                    }}
                  />
                </div>

                {story && (
                  <div hidden={tab !== "dod"}>
                    {/* Drawn from the board's copy, but with the tags and state this dialog has
                        just written - otherwise approving leaves the tab claiming it is still
                        unapproved. */}
                    <WorkItemDodTab
                      story={{ ...story, tags: detail.tags, azureStatus: detail.state }}
                      approving={approvingDod}
                      onApprove={approveDod}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
