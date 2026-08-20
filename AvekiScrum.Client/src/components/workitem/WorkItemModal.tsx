import { useEffect, useMemo, useState } from "react";
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
import { Breadcrumb, type BreadcrumbHop } from "./Breadcrumb";
import { getWorkItemTypeConfig } from "./workItemTypeConfig";
import { WorkItemOverviewTab } from "./WorkItemOverviewTab";
import { WorkItemRelationsTab } from "./WorkItemRelationsTab";
import { WorkItemTaskboardTab } from "./WorkItemTaskboardTab";
import { WorkItemDiscussionTab } from "./WorkItemDiscussionTab";
import { WorkItemPullRequestsTab } from "./WorkItemPullRequestsTab";
import { WorkItemHistoryTab } from "./WorkItemHistoryTab";
import { WorkItemDetailsTab } from "./WorkItemDetailsTab";
import "./WorkItemModal.css";

interface WorkItemModalProps {
  workItemId: number;
  onClose: () => void;
  onOpenValidation?: (id: number) => void;
  /** Renders the card inline (no overlay, no close button, no Escape handler) so it can be
   *  hosted inside another panel - e.g. the daily flow's "stäm av med teamet" step - while
   *  keeping every tab and action identical to the popup version. */
  embedded?: boolean;
}

type TabId = "overview" | "relations" | "taskboard" | "discussion" | "prs" | "history" | "details";

const DOR_ELIGIBLE_TYPES = new Set(["User Story", "Product Backlog Item", "Bug"]);

function hasTag(tags: string[], tag: string): boolean {
  return tags.some((t) => t.trim().toLowerCase() === tag.toLowerCase());
}

export function WorkItemModal({ workItemId, onClose, onOpenValidation, embedded = false }: WorkItemModalProps) {
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

  useEffect(() => {
    // Embedded there is nothing to dismiss - Escape must stay available to whatever hosts it.
    if (embedded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, embedded]);

  const config = useMemo(() => getWorkItemTypeConfig(detail?.type ?? ""), [detail?.type]);

  /** Pulls the card again after something was created against it, so the new child or related
   *  item shows up (and the tab counts move) without closing and reopening the card. */
  async function reload() {
    try {
      setDetail(await fetchWorkItemDetail(currentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa om kortet.");
    }
  }

  function openRelation(item: WorkItemRelationRef, relationLabel: string) {
    setStack((prev) => [...prev, { id: item.id, type: item.type, title: item.title, relationLabel }]);
  }

  function jumpTo(index: number) {
    setStack((prev) => prev.slice(0, index + 1));
  }

  function startEdit() {
    if (!detail) return;
    // Every editable field is seeded, so a save carries the card's current values through
    // untouched rather than the PATCH silently omitting whatever the form didn't seed.
    setDraft({
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
      remainingWork: detail.remainingWork ?? undefined,
      completedWork: detail.completedWork ?? undefined,
      originalEstimate: detail.originalEstimate ?? undefined,
      businessValue: detail.businessValue ?? undefined,
      valueArea: detail.valueArea ?? "",
      assignedTeam: detail.assignedTeam ?? "",
      stakeholders: detail.stakeholders ?? "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const updated = await updateWorkItemFields(currentId, draft);
      setDetail(updated);
      setStack((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], title: updated.title };
        return next;
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara ändringarna.");
    } finally {
      setSaving(false);
    }
  }

  const taskCount = detail?.children.filter((c) => c.type === "Task").length ?? 0;
  const relationCount = detail ? (detail.parent ? 1 : 0) + detail.children.length + detail.related.length : 0;
  const dorEligible = !!detail && DOR_ELIGIBLE_TYPES.has(detail.type);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Översikt" },
    { id: "relations", label: "Relationer", count: relationCount },
    // A Task links follow-up work as Related, never as children, so it has no taskboard to show.
    ...(config.showTaskboard ? [{ id: "taskboard" as const, label: "Taskboard", count: taskCount }] : []),
    { id: "discussion", label: "Diskussion", count: detail?.comments.length ?? 0 },
    { id: "prs", label: "PRs", count: detail?.pullRequests.length ?? 0 },
    { id: "history", label: "Historik" },
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
                <span className="wi-modal__state-badge">{detail.state}</span>
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
            <button type="button" className="wi-modal__close" onClick={onClose} aria-label="Stäng">
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
                />
              )}
              {tab === "relations" && (
                <WorkItemRelationsTab detail={detail} onOpenRelation={openRelation} onCreated={reload} people={people} />
              )}
              {tab === "taskboard" && (
                <WorkItemTaskboardTab detail={detail} onOpenRelation={openRelation} onCreated={reload} people={people} />
              )}
              {tab === "discussion" && <WorkItemDiscussionTab detail={detail} onPosted={setDetail} />}
              {tab === "prs" && <WorkItemPullRequestsTab pullRequests={detail.pullRequests} />}
              {tab === "history" && <WorkItemHistoryTab history={detail.history} />}
              {tab === "details" && <WorkItemDetailsTab detail={detail} />}
            </>
          )}
        </div>

        <footer className="wi-modal__footer">
          {dorEligible && onOpenValidation && !editing && (
            <button
              type="button"
              className="wi-btn wi-validation-btn"
              onClick={() => onOpenValidation(currentId)}
              disabled={!detail}
            >
              Validering
            </button>
          )}
          <span className="wi-modal__footer-spacer" />
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
            <button type="button" className="wi-btn wi-btn--primary" onClick={startEdit} disabled={!detail}>
              Redigera
            </button>
          )}
        </footer>
      </div>
  );

  if (embedded) return panel;

  return (
    <div className="wi-modal-overlay" onClick={onClose}>
      {panel}
    </div>
  );
}
