import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchClassification,
  fetchWorkItemDetail,
  updateWorkItemFields,
  type ClassificationOptions,
  type WorkItemDetail,
  type WorkItemFieldUpdate,
  type WorkItemRelationRef,
} from "../../api/workitems";
import { fetchAllPeople, type PersonOption } from "../../api/people";
import { LoadingOverlay } from "../LoadingOverlay";
import { Breadcrumb, type BreadcrumbHop } from "./Breadcrumb";
import { ConfirmDialog } from "./ConfirmDialog";
import { getWorkItemTypeConfig } from "./workItemTypeConfig";
import { WorkItemOverviewTab } from "./WorkItemOverviewTab";
import { WorkItemRelationsTab } from "./WorkItemRelationsTab";
import { WorkItemTaskboardTab } from "./WorkItemTaskboardTab";
import { WorkItemDiscussionTab } from "./WorkItemDiscussionTab";
import { WorkItemPullRequestsTab } from "./WorkItemPullRequestsTab";
import { WorkItemHistoryTab } from "./WorkItemHistoryTab";
import { WorkItemDetailsTab } from "./WorkItemDetailsTab";
import { WorkItemDorTab } from "./WorkItemDorTab";
import { WorkItemSakkunnigFeatureTab } from "./WorkItemSakkunnigFeatureTab";
import { WorkItemSakkunnigStoryTab } from "./WorkItemSakkunnigStoryTab";
import { RequestHelpTextModal } from "./RequestHelpTextModal";
import { BreakoutHelpTextModal } from "./BreakoutHelpTextModal";
import { StatePill } from "./StatePill";
import "./WorkItemModal.css";

interface WorkItemModalProps {
  workItemId: number;
  /**
   * Closing. `changed` is true only when something was actually written to Azure DevOps while the
   * card was open, so a caller can skip an expensive reload after a look-and-close - which is the
   * common case, and which used to cost a full refetch of every row behind the card.
   */
  onClose: (changed: boolean) => void;
  onOpenValidation?: (id: number) => void;
  /** Renders the card inline (no overlay, no close button, no Escape handler) so it can be
   *  hosted inside another panel - e.g. the daily flow's "stäm av med teamet" step - while
   *  keeping every tab and action identical to the popup version. */
  embedded?: boolean;
  /** Fired after a successful "Spara" while editing - for a host that keeps its own copy of the
   *  card alongside this one (the validation modal's two-pane layout) and needs to know when to
   *  refetch its side, since embedded mode has no close event to hang that off of. */
  onSaved?: (detail: WorkItemDetail) => void;
}

type TabId = "overview" | "relations" | "taskboard" | "discussion" | "prs" | "history" | "dor" | "sakkunnig" | "details";

const DOR_ELIGIBLE_TYPES = new Set(["User Story", "Bug"]);
const SAKKUNNIG_ELIGIBLE_TYPES = new Set(["Feature", "User Story"]);

function hasTag(tags: string[], tag: string): boolean {
  return tags.some((t) => t.trim().toLowerCase() === tag.toLowerCase());
}

export function WorkItemModal({ workItemId, onClose, onOpenValidation, embedded = false, onSaved }: WorkItemModalProps) {
  const [stack, setStack] = useState<BreadcrumbHop[]>([{ id: workItemId, type: "", title: "…", relationLabel: null }]);
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkItemFieldUpdate>({});
  const [saving, setSaving] = useState(false);
  const [classification, setClassification] = useState<ClassificationOptions | null>(null);
  const [people, setPeople] = useState<PersonOption[]>([]);
  // Snapshot taken when editing starts, so "unsaved changes" means the form actually differs -
  // opening the editor and closing it again shouldn't trigger a warning.
  const [draftBaseline, setDraftBaseline] = useState<string>("");
  const [confirmClose, setConfirmClose] = useState(false);
  // "Beställ hjälptext": additive to the DoR checklist's own related-story flow, which is untouched -
  // this opens a separate small modal on top, so it doesn't compete with the tab/editing state above.
  const [showHelpTextRequest, setShowHelpTextRequest] = useState(false);
  // "Bryt ut hjälptext": same pattern, its own modal on top rather than sharing tab/editing state.
  const [showBreakoutHelpText, setShowBreakoutHelpText] = useState(false);
  // Whether anything was written while this card was open. A ref, not state: it must not re-render
  // anything, and the Escape handler's closure has to see the current value rather than the one
  // from the render that installed it.
  const changed = useRef(false);

  const currentId = stack[stack.length - 1].id;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setEditing(false);
    setTab("overview");
    fetchWorkItemDetail(currentId, controller.signal)
      .then((d) => {
        setDetail(d);
        setLoading(false);
        setStack((prev) => {
          const next = [...prev];
          next[next.length - 1] = { id: d.id, type: d.type, title: d.title, relationLabel: next[next.length - 1].relationLabel };
          return next;
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // Picker sources. Both are cheap and cached, and a failure only costs the dropdowns their
  // suggestions - the card itself stays fully usable, so neither is allowed to surface an error.
  useEffect(() => {
    fetchClassification()
      .then(setClassification)
      .catch(() => setClassification(null));
    fetchAllPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  const isDirty = editing && JSON.stringify(draft) !== draftBaseline;

  /** Closing has to go through here so unsaved edits can't be lost by a stray Escape. */
  function requestClose() {
    if (isDirty) setConfirmClose(true);
    else onClose(changed.current);
  }

  /** A tab reporting back that it wrote something: take its fresh copy and remember the write. */
  function applyChange(updated: WorkItemDetail) {
    changed.current = true;
    setDetail(updated);
  }

  useEffect(() => {
    // Embedded there is nothing to dismiss - Escape must stay available to whatever hosts it.
    if (embedded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, isDirty, onClose]);

  const config = useMemo(() => getWorkItemTypeConfig(detail?.type ?? ""), [detail?.type]);

  function openRelation(item: WorkItemRelationRef, relationLabel: string) {
    setStack((prev) => [...prev, { id: item.id, type: item.type, title: item.title, relationLabel }]);
  }

  function jumpTo(index: number) {
    setStack((prev) => prev.slice(0, index + 1));
  }

  function startEdit() {
    if (!detail) return;
    // Built below and stored as the baseline in the same shape the draft is compared in.
    // Every editable field is seeded, so a save carries the card's current values through
    // untouched rather than the PATCH silently omitting whatever the form didn't seed.
    const seed: WorkItemFieldUpdate = {
      title: detail.title,
      state: detail.state,
      assignedTo: detail.assignedTo ?? "",
      storyPoints: detail.storyPoints ?? undefined,
      description: detail.descriptionHtml,
      acceptanceCriteria: detail.acceptanceCriteriaHtml,
      areaPath: detail.areaPath ?? "",
      iterationPath: detail.iterationPath ?? "",
      tags: detail.tags,
      priority: detail.priority ?? undefined,
      severity: detail.severity ?? "",
      source: detail.source ?? "",
      activity: detail.activity ?? "",
      isBlocked: detail.isBlocked,
      remainingWork: detail.remainingWork ?? undefined,
      completedWork: detail.completedWork ?? undefined,
      originalEstimate: detail.originalEstimate ?? undefined,
      businessValue: detail.businessValue ?? undefined,
      valueArea: detail.valueArea ?? "",
      assignedTeam: detail.assignedTeam ?? "",
      stakeholders: detail.stakeholders ?? "",
    };
    setDraft(seed);
    setDraftBaseline(JSON.stringify(seed));
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const updated = await updateWorkItemFields(currentId, draft);
      applyChange(updated);
      setStack((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], title: updated.title };
        return next;
      });
      setEditing(false);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara ändringarna.");
    } finally {
      setSaving(false);
    }
  }

  const taskChildren = detail?.children.filter((c) => c.type === "Task") ?? [];
  const taskCount = taskChildren.length;
  const relationCount = detail ? (detail.parent ? 1 : 0) + detail.children.length + detail.related.length : 0;
  const dorEligible = !!detail && DOR_ELIGIBLE_TYPES.has(detail.type);
  const sakkunnigEligible = !!detail && SAKKUNNIG_ELIGIBLE_TYPES.has(detail.type);
  // Only offered once every Task is out of the way, and never on a card that's already Closed -
  // naturally excludes types with no Task children at all (a Feature's children are stories/bugs,
  // never tasks), so this doesn't need its own type check on top.
  const canCompleteCard =
    !!detail && detail.state !== "Closed" && taskChildren.length > 0 && taskChildren.every((c) => c.state === "Closed");

  async function completeCard() {
    setSaving(true);
    try {
      const updated = await updateWorkItemFields(currentId, { state: "Closed" });
      applyChange(updated);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte slutföra kortet.");
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Översikt" },
    { id: "relations", label: "Relationer", count: relationCount },
    // A Task links follow-up work as Related, never as children, so it has no taskboard to show.
    ...(config.showTaskboard ? [{ id: "taskboard" as const, label: "Taskboard", count: taskCount }] : []),
    { id: "discussion", label: "Diskussion", count: detail?.comments.length ?? 0 },
    { id: "prs", label: "PRs", count: detail?.pullRequests.length ?? 0 },
    { id: "history", label: "Historik" },
    // Only where DoR applies at all - a Task or Feature has no Korthygien/Behovsbedömning/INVEST
    // to have been reviewed against.
    ...(dorEligible ? [{ id: "dor" as const, label: "DoR" }] : []),
    ...(sakkunnigEligible ? [{ id: "sakkunnig" as const, label: "Sakkunnig" }] : []),
    { id: "details", label: "Details" },
  ];

  const panel = (
      <div className={"wi-modal" + (embedded ? " wi-modal--embedded" : "")} onClick={(e) => e.stopPropagation()}>
        <header className="wi-modal__header">
          <span className="wi-modal__type-icon" style={{ color: config.color }}>
            {detail ? config.icon : "…"}
          </span>
          <div className="wi-modal__title-block">
            <div className="wi-modal__title-text">{detail?.title ?? "Laddar…"}</div>
            {detail && (
              <div className="wi-modal__subline">
                <a className="wi-modal__id-link" href={detail.webUrl} target="_blank" rel="noreferrer" title="Öppna i Azure DevOps">
                  #{detail.id} ↗
                </a>
                {/* Support's own bugs carry the case they came from. Only a real URL becomes a
                    link - the field holds a bare note ("Dalavatten (fredrik knapp)") often enough
                    that an anchor going nowhere would be worse than plain text. */}
                {detail.externalLink &&
                  (/^[a-z][a-z0-9+.-]*:\/\//i.test(detail.externalLink.trim()) ? (
                    <a
                      className="wi-modal__id-link"
                      href={detail.externalLink}
                      target="_blank"
                      rel="noreferrer"
                      title={`Öppna ärendet i Lime: ${detail.externalLink}`}
                    >
                      Lime ↗
                    </a>
                  ) : (
                    <span className="wi-modal__iteration" title={detail.externalLink}>
                      Lime: {detail.externalLink}
                    </span>
                  ))}
                <StatePill state={detail.state} />
                {/* Full path, not just the leaf - this is where Iteration Path lives now that
                    it's no longer a field in the Översikt grid. */}
                {detail.iterationPath && <span className="wi-modal__iteration">{detail.iterationPath}</span>}
                {dorEligible && hasTag(detail.tags, "DoR") && (
                  <span className="wi-modal__check" title="DoR godkänd">
                    ✓ DoR
                  </span>
                )}
                {dorEligible && hasTag(detail.tags, "INVEST") && (
                  <span className="wi-modal__check" title="INVEST godkänd">
                    ✓ INVEST
                  </span>
                )}
              </div>
            )}
          </div>
          {!embedded && (
            <button type="button" className="wi-modal__close" onClick={requestClose} aria-label="Stäng">
              ✕
            </button>
          )}
        </header>

        <Breadcrumb hops={stack} onJump={jumpTo} />

        {detail && !loading && (
          <nav className="wi-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={"wi-tabs__item" + (tab === t.id ? " wi-tabs__item--active" : "")}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.count !== undefined && <span className="wi-tabs__count">({t.count})</span>}
              </button>
            ))}
          </nav>
        )}

        <div className="wi-modal__body">
          {loading && <p className="wi-modal__status">Hämtar…</p>}
          {error && <p className="wi-modal__status wi-modal__status--error">Fel: {error}</p>}

          {!loading && !error && detail && (
            <>
              {tab === "overview" && (
                <WorkItemOverviewTab
                  detail={detail}
                  editing={editing}
                  draft={draft}
                  onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                  classification={classification}
                  people={people}
                  onChanged={applyChange}
                />
              )}
              {tab === "relations" && (
                <WorkItemRelationsTab detail={detail} onOpenRelation={openRelation} onChanged={applyChange} people={people} />
              )}
              {tab === "taskboard" && (
                <WorkItemTaskboardTab
                  detail={detail}
                  onOpenRelation={openRelation}
                  onCreated={applyChange}
                  people={people}
                  classification={classification}
                />
              )}
              {tab === "discussion" && <WorkItemDiscussionTab detail={detail} onPosted={applyChange} />}
              {tab === "prs" && <WorkItemPullRequestsTab pullRequests={detail.pullRequests} />}
              {tab === "history" && <WorkItemHistoryTab history={detail.history} />}
              {tab === "dor" && <WorkItemDorTab detail={detail} />}
              {tab === "sakkunnig" && detail.type === "Feature" && (
                <WorkItemSakkunnigFeatureTab detail={detail} onChanged={applyChange} />
              )}
              {tab === "sakkunnig" && detail.type === "User Story" && (
                <WorkItemSakkunnigStoryTab detail={detail} onOpenRelation={openRelation} onChanged={applyChange} />
              )}
              {tab === "details" && <WorkItemDetailsTab detail={detail} />}
            </>
          )}
        </div>

        {(editing ||
          tab === "overview" ||
          (dorEligible && tab === "dor" && !!onOpenValidation) ||
          (dorEligible && (tab === "relations" || tab === "taskboard")) ||
          (tab === "taskboard" && canCompleteCard)) && (
          <footer className="wi-modal__footer">
            <div className="wi-actions">
              <span className="wi-actions__label">Actions</span>
              {editing ? (
                <>
                  <button type="button" className="wi-btn" onClick={() => setEditing(false)} disabled={saving}>
                    Avbryt
                  </button>
                  <button type="button" className="wi-btn wi-btn--primary" onClick={saveEdit} disabled={saving}>
                    {saving ? "Sparar…" : "Spara"}
                  </button>
                </>
              ) : (
                <>
                  {tab === "overview" && (
                    <button type="button" className="wi-btn wi-btn--primary" onClick={startEdit} disabled={!detail}>
                      Redigera
                    </button>
                  )}
                  {dorEligible && tab === "dor" && onOpenValidation && (
                    <button
                      type="button"
                      className="wi-btn wi-btn--primary"
                      onClick={() => onOpenValidation(currentId)}
                      disabled={!detail}
                    >
                      Validering
                    </button>
                  )}
                  {dorEligible && (tab === "relations" || tab === "taskboard") && (
                    <>
                      <button
                        type="button"
                        className="wi-btn wi-btn--primary"
                        disabled
                        title="Skapar ett hjälptextkort direkt i Dokumentation-projektet, länkat till detta kort - tillsvidare ersatt av Bryt ut hjälptext"
                      >
                        Beställ hjälptext
                      </button>
                      <button
                        type="button"
                        className="wi-btn wi-btn--primary"
                        onClick={() => setShowBreakoutHelpText(true)}
                        disabled={!detail}
                        title="Skapar en ny User Story, relaterad till denna, och flyttar Hjälptext-Tasken dit."
                      >
                        Bryt ut hjälptext
                      </button>
                    </>
                  )}
                  {tab === "taskboard" && canCompleteCard && (
                    <button
                      type="button"
                      className="wi-btn wi-btn--success"
                      onClick={() => void completeCard()}
                      disabled={saving}
                      title="Sätter kortets status till Closed."
                    >
                      {saving ? "Slutför…" : "Slutför kortet"}
                    </button>
                  )}
                </>
              )}
            </div>
          </footer>
        )}
      </div>
  );

  const helpTextRequestModal = showHelpTextRequest && detail && (
    <RequestHelpTextModal
      workItemId={detail.id}
      workItemTitle={detail.title}
      onClose={() => setShowHelpTextRequest(false)}
    />
  );

  const breakoutHelpTextModal = showBreakoutHelpText && detail && (
    <BreakoutHelpTextModal detail={detail} onClose={() => setShowBreakoutHelpText(false)} onChanged={applyChange} />
  );

  // Full-screen and input-blocking on purpose: a PATCH mid-flight is the one moment a second click
  // (Avbryt, Stäng, another Spara) would race the request or double-submit it.
  const savingOverlay = saving && <LoadingOverlay message="Sparar…" />;

  if (embedded) return (
    <>
      {panel}
      {helpTextRequestModal}
      {breakoutHelpTextModal}
      {savingOverlay}
    </>
  );

  return (
    <>
      {/* No click-to-dismiss: a card is a form, and losing a half-written description to a
          mis-aimed click is worse than having to reach for the close button. */}
      <div className="wi-modal-overlay">{panel}</div>
      {helpTextRequestModal}
      {breakoutHelpTextModal}
      {savingOverlay}
      {confirmClose && (
        <ConfirmDialog
          title="Osparade ändringar"
          message="Du har ändringar som inte är sparade. Stänger du kortet nu går de förlorade."
          confirmLabel="Stäng utan att spara"
          cancelLabel="Fortsätt redigera"
          danger
          onConfirm={() => {
            setConfirmClose(false);
            onClose(changed.current);
          }}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </>
  );
}
