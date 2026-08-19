import { useEffect, useState } from "react";
import { fetchWorkItemDetail, updateWorkItemFields, type WorkItemDetail, type WorkItemRelationRef } from "../../api/workitems";
import { fetchTeamMembers, fetchDevelopers, type PersonOption } from "../../api/people";
import type { DeveloperTeamId } from "../../api/dailys";
import { WorkItemKorthygienTab, draftFromDetail, korthygienOk, type KorthygienDraft } from "./WorkItemKorthygienTab";
import { WorkItemBehovsbedomningTab } from "./WorkItemBehovsbedomningTab";
import { getWorkItemTypeConfig } from "./workItemTypeConfig";
import "./WorkItemModal.css";
import "./WorkItemValidationModal.css";

type ValidationTab = "korthygien" | "behovsbedomning";

export function hasDorTag(detail: Pick<WorkItemDetail, "tags">): boolean {
  return detail.tags.some((t) => t.trim().toLowerCase() === "dor");
}

interface WorkItemValidationModalProps {
  workItemId: number;
  team: DeveloperTeamId;
  onClose: () => void;
  onOpenRelation?: (item: WorkItemRelationRef) => void;
  /** Fired after DoR approval so the board can pull in the new tag/tasks. Approving is the end
   *  of this dialog's job, so it closes itself - unlike "Spara Korthygien", which is a partial
   *  save you're expected to keep working after. */
  onApproved?: () => void;
}

/**
 * Standalone card-validation dialog (Korthygien + Behovsbedömning, INVEST to follow) - deliberately
 * separate from WorkItemModal per feedback: this is reached either from a "Validering" entry point
 * in the story list or from a button inside the Work Item form, not as tabs buried in that form.
 */
export function WorkItemValidationModal({ workItemId, team, onClose, onOpenRelation, onApproved }: WorkItemValidationModalProps) {
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

  useEffect(() => {
    const controller = new AbortController();
    fetchTeamMembers(team, controller.signal).then(setAnsvarigOptions).catch(() => setAnsvarigOptions([]));
    fetchDevelopers(controller.signal).then(setPartnerOptions).catch(() => setPartnerOptions([]));
    return () => controller.abort();
  }, [team]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchWorkItemDetail(workItemId, controller.signal)
      .then((d) => {
        setDetail(d);
        setDraft(draftFromDetail(d));
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

  /**
   * Writes the Korthygien draft, optionally adding extra tags in the same request.
   *
   * Godkänn DoR needs both the field edits and the DoR tag, and both live in `tags` - doing them
   * as two separate saves would make the second one overwrite the first's tag list with a stale
   * copy. Hence one merged write.
   */
  async function persistKorthygien(extraTags: string[] = []): Promise<WorkItemDetail> {
    if (!draft) throw new Error("Inget utkast att spara.");
    const mergedTags = [...draft.tags];
    for (const tag of extraTags) {
      if (!mergedTags.some((t) => t.trim().toLowerCase() === tag.toLowerCase())) mergedTags.push(tag);
    }
    const updated = await updateWorkItemFields(workItemId, {
      description: draft.description,
      acceptanceCriteria: draft.acceptanceCriteria,
      storyPoints: draft.storyPoints,
      areaPath: draft.areaPath,
      assignedTo: draft.assignedTo,
      developmentPartner: draft.developmentPartnerNotApplicable ? "" : draft.developmentPartner,
      tags: mergedTags,
    });
    setDetail(updated);
    setDraft(draftFromDetail(updated));
    return updated;
  }

  async function saveKorthygien() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await persistKorthygien();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Kunde inte spara korthygienen.");
    } finally {
      setSaving(false);
    }
  }

  const config = getWorkItemTypeConfig(detail?.type ?? "");
  const khOk = detail && draft ? korthygienOk(detail, draft) : false;
  // Starts from the saved DoR tag, then the Behovsbedömning tab reports its live state up (its
  // per-row decisions live inside that component) so the ✓ appears as soon as it's fully decided.
  const bbOk = (detail ? hasDorTag(detail) : false) || behovsbedomningOk;

  const tabs: { id: ValidationTab; label: string; ok: boolean }[] = [
    { id: "korthygien", label: "Korthygien", ok: khOk },
    { id: "behovsbedomning", label: "Behovsbedömning", ok: bbOk },
  ];

  return (
    <div className="wi-modal-overlay" onClick={onClose}>
      <div className="wi-modal" onClick={(e) => e.stopPropagation()}>
        <header className="wi-modal__header">
          <span className="wi-modal__type-icon" style={{ color: config.color }}>
            {detail ? config.icon : "…"}
          </span>
          <div className="wi-modal__title-block">
            <div className="wi-modal__title-text">Validering - {detail?.title ?? "Laddar…"}</div>
            {detail && (
              <div className="wi-modal__subline">
                <a className="wi-modal__id-link" href={detail.webUrl} target="_blank" rel="noreferrer" title="Öppna i Azure DevOps">
                  #{detail.id} ↗
                </a>
                <span className="wi-modal__state-badge">{detail.state}</span>
              </div>
            )}
          </div>
          <button type="button" className="wi-modal__close" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </header>

        {detail && !loading && (
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
        )}

        <div className="wi-modal__body">
          {loading && <p className="wi-modal__status">Hämtar…</p>}
          {error && <p className="wi-modal__status wi-modal__status--error">Fel: {error}</p>}

          {!loading && !error && detail && draft && (
            // Both tabs stay mounted and are shown/hidden with CSS instead of being conditionally
            // rendered: Behovsbedömningens per-row decisions are local component state, so
            // unmounting on a tab switch threw them away (and made the tab's ✓ badge go stale).
            <>
              <div hidden={tab !== "korthygien"}>
                <WorkItemKorthygienTab
                  detail={detail}
                  draft={draft}
                  onDraftChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
                  onOpenRelation={onOpenRelation}
                  ansvarigOptions={ansvarigOptions}
                  partnerOptions={partnerOptions}
                />
                {saveError && <p className="wi-modal__status wi-modal__status--error">{saveError}</p>}
                <button type="button" className="wi-btn wi-btn--success wi-validation__save" onClick={saveKorthygien} disabled={saving}>
                  {saving ? "Sparar…" : "Spara Korthygien"}
                </button>
              </div>
              <div hidden={tab !== "behovsbedomning"}>
                <WorkItemBehovsbedomningTab
                  detail={detail}
                  korthygienOk={khOk}
                  onOkChange={setBehovsbedomningOk}
                  onPersist={persistKorthygien}
                  onUpdated={(updated) => {
                    setDetail(updated);
                    setDraft(draftFromDetail(updated));
                  }}
                  onApproved={() => {
                    onApproved?.();
                    onClose();
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
