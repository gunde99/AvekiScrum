import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "./Toast";
import { PersonAvatar } from "./PersonAvatar";
import { RichText } from "./RichText";
import { RichTextEditor } from "./workitem/RichTextEditor";
import { ConfirmDialog } from "./workitem/ConfirmDialog";
import { fetchAllPeople, type PersonOption } from "../api/people";
import { getIdentity } from "../auth/identity";
import type { DeveloperTeamId } from "../api/dailys";
import {
  createTalkingPoint,
  deleteTalkingPoint,
  fetchTalkingPoints,
  isFullyRaised,
  isRaisedForTeam,
  raisedAtForTeam,
  setAllTalkingPointsRaised,
  setTalkingPointRaised,
  updateTalkingPoint,
  SCRUM_MASTER,
  type TalkingPointDto,
  type TalkingPointScope,
  type TeamFilter,
} from "../api/talkingPoints";
import "./TalkingPointsModal.css";

type Tab = "active" | "history";
type BulkAction = "raise" | "reset";

interface TalkingPointsModalProps {
  /** The underlying board's own active team - just where the filter starts; switching it inside
   *  the modal never changes the board's own team, and closing the modal leaves the board exactly
   *  as it was (nothing behind it ever reloads). */
  team: DeveloperTeamId;
  onClose: () => void;
}

function scopeForFilter(filter: TeamFilter): TalkingPointScope {
  return filter === "Alla" ? "Both" : filter;
}

function scopeLabel(scope: TalkingPointScope): string {
  return scope === "Both" ? "Nord + Syd" : scope;
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("sv-SE") : "";
}

function metaDate(point: TalkingPointDto, tab: Tab, filterTeam: TeamFilter): string {
  if (tab === "active") return `Skapad ${fmtDate(point.createdAt)}`;
  if (filterTeam === "Alla") {
    const parts: string[] = [];
    if (point.nordRaised) parts.push(`Nord ${fmtDate(point.nordRaisedAt)}`);
    if (point.sydRaised) parts.push(`Syd ${fmtDate(point.sydRaisedAt)}`);
    return `Lyft: ${parts.join(", ")}`;
  }
  return `Lyft ${fmtDate(raisedAtForTeam(point, filterTeam))}`;
}

/** Sorts history by whichever of the (up to two) raise dates is the most recent one. */
function raisedSortKey(point: TalkingPointDto, filterTeam: TeamFilter): string {
  if (filterTeam === "Alla") {
    return [point.nordRaisedAt, point.sydRaisedAt].filter((d): d is string => !!d).sort().pop() ?? "";
  }
  return raisedAtForTeam(point, filterTeam) ?? "";
}

/** Only shown for Both-scoped points - a single-team point's tab placement already says it all. */
function teamStatusLine(point: TalkingPointDto): string {
  return `${point.nordRaised ? "✓" : "–"} Nord   ${point.sydRaised ? "✓" : "–"} Syd`;
}

/**
 * "Saker att ta upp" - a suggestion box for things that should be raised with someone during a
 * daily (a PO's ask, a heads-up for a teammate, ...). A modal rather than its own board/route, so
 * opening it never unmounts whatever board (and its live state - loaded cards, a running daily
 * flow) is currently showing behind it. DailyFlow.tsx is what weaves the still-open ones into the
 * flow itself.
 */
export function TalkingPointsModal({ team, onClose }: TalkingPointsModalProps) {
  const { showToast } = useToast();
  const [filterTeam, setFilterTeam] = useState<TeamFilter>(team);
  const [tab, setTab] = useState<Tab>("active");
  const [points, setPoints] = useState<TalkingPointDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [editing, setEditing] = useState<TalkingPointDto | "new" | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<TalkingPointDto | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetchTalkingPoints(filterTeam === "Alla" ? undefined : filterTeam)
      .then(setPoints)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Kunde inte hämta listan."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTeam]);

  useEffect(() => {
    fetchAllPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isDone = (p: TalkingPointDto) => (filterTeam === "Alla" ? isFullyRaised(p) : isRaisedForTeam(p, filterTeam));
  const active = useMemo(
    () => points.filter((p) => !isDone(p)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, filterTeam],
  );
  const history = useMemo(
    () => points.filter((p) => isDone(p)).sort((a, b) => raisedSortKey(b, filterTeam).localeCompare(raisedSortKey(a, filterTeam))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, filterTeam],
  );
  const visible = tab === "active" ? active : history;

  async function withBusy<T>(id: string, fn: () => Promise<T>): Promise<T> {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      return await fn();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function toggleRaised(point: TalkingPointDto) {
    const nextRaised = !isDone(point);
    const teamParam = scopeForFilter(filterTeam);
    try {
      const updated = await withBusy(point.id, () => setTalkingPointRaised(point.id, teamParam, nextRaised));
      setPoints((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunde inte ändra status.", "error");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const point = deleting;
    setDeleting(null);
    try {
      await withBusy(point.id, () => deleteTalkingPoint(point.id));
      setPoints((prev) => prev.filter((p) => p.id !== point.id));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunde inte ta bort.", "error");
    }
  }

  async function confirmBulk() {
    if (!bulkAction) return;
    const raised = bulkAction === "raise";
    setBulkAction(null);
    try {
      await setAllTalkingPointsRaised(scopeForFilter(filterTeam), raised);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunde inte uppdatera alla.", "error");
    }
  }

  function saveFromForm(result: TalkingPointDto) {
    setPoints((prev) => (prev.some((p) => p.id === result.id) ? prev.map((p) => (p.id === result.id ? result : p)) : [...prev, result]));
    setEditing(null);
  }

  return createPortal(
    <div className="wi-modal-overlay" onClick={onClose}>
      <div className="wi-modal tpm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wi-modal__header">
          <div className="wi-modal__title-block">
            <div className="wi-modal__title-text">Saker att ta upp</div>
          </div>
          <button type="button" className="wi-modal__close" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </div>

        <div className="tpm-toolbar">
          <div className="tpm-team-filter" role="group" aria-label="Team">
            {(["Nord", "Syd", "Alla"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={"tpm-team-filter__btn" + (filterTeam === f ? " tpm-team-filter__btn--active" : "")}
                onClick={() => setFilterTeam(f)}
              >
                {f === "Alla" ? "Båda teamen" : f}
              </button>
            ))}
          </div>
          <button type="button" className="wi-btn wi-btn--primary" onClick={() => setEditing("new")}>
            + Ny sak att ta upp
          </button>
        </div>

        <div className="wi-tabs">
          <button type="button" className={"wi-tabs__item" + (tab === "active" ? " wi-tabs__item--active" : "")} onClick={() => setTab("active")}>
            Aktiva ({active.length})
          </button>
          <button type="button" className={"wi-tabs__item" + (tab === "history" ? " wi-tabs__item--active" : "")} onClick={() => setTab("history")}>
            Historik ({history.length})
          </button>
        </div>

        <div className="wi-modal__body">
          {editing && (
            <TalkingPointForm
              defaultScope={scopeForFilter(filterTeam)}
              people={people}
              point={editing === "new" ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={saveFromForm}
            />
          )}

          <div className="tpm-bulk-actions">
            <button type="button" className="wi-btn" onClick={() => setBulkAction("raise")} disabled={active.length === 0}>
              Bocka av allt
            </button>
            <button type="button" className="wi-btn" onClick={() => setBulkAction("reset")} disabled={history.length === 0}>
              Återställ allt
            </button>
          </div>

          {loading && <p className="dailys-board__status">Hämtar saker att ta upp…</p>}
          {error && <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>}

          {!loading && !error && (
            <div className="stp-list">
              {visible.length === 0 && (
                <p className="dailys-board__status">{tab === "active" ? "Inget att ta upp just nu." : "Ingenting i historiken än."}</p>
              )}
              {visible.map((point) => (
                <div className="stp-row" key={point.id}>
                  <PersonAvatar name={point.assigneeDisplayName} size={36} />
                  <div className="stp-row__body">
                    <div className="stp-row__meta">
                      <strong>{point.assigneeDisplayName}</strong>
                      <span className="stp-row__scope">{scopeLabel(point.scope)}</span>
                      <span className="stp-row__date">{metaDate(point, tab, filterTeam)}</span>
                    </div>
                    {point.scope === "Both" && <div className="stp-row__teamstatus">{teamStatusLine(point)}</div>}
                    <RichText content={point.bodyHtml} className="stp-row__content" />
                  </div>
                  <div className="stp-row__actions">
                    <label className="stp-row__checkbox" title={isDone(point) ? "Markera som inte lyft" : "Markera som lyft"}>
                      <input type="checkbox" checked={isDone(point)} disabled={busyIds.has(point.id)} onChange={() => void toggleRaised(point)} />
                      Lyft
                    </label>
                    <button type="button" className="wi-btn" onClick={() => setEditing(point)} disabled={busyIds.has(point.id)}>
                      Redigera
                    </button>
                    <button type="button" className="wi-btn wi-btn--danger" onClick={() => setDeleting(point)} disabled={busyIds.has(point.id)}>
                      Ta bort
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Ta bort permanent?"
          message={`"Sak att ta upp" för ${deleting.assigneeDisplayName} tas bort helt - går inte att ångra.`}
          confirmLabel="Ta bort"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}

      {bulkAction && (
        <ConfirmDialog
          title={bulkAction === "raise" ? "Bocka av allt?" : "Återställ allt?"}
          message={
            bulkAction === "raise"
              ? `Alla ${active.length} just nu öppna punkter (${filterTeam === "Alla" ? "båda teamen" : filterTeam}) markeras som lyfta.`
              : `Alla ${history.length} avbockade punkter (${filterTeam === "Alla" ? "båda teamen" : filterTeam}) flyttas tillbaka till Aktiva.`
          }
          confirmLabel={bulkAction === "raise" ? "Bocka av allt" : "Återställ allt"}
          onConfirm={() => void confirmBulk()}
          onCancel={() => setBulkAction(null)}
        />
      )}
    </div>,
    document.body,
  );
}

function TalkingPointForm({
  defaultScope,
  people,
  point,
  onCancel,
  onSaved,
}: {
  defaultScope: TalkingPointScope;
  people: PersonOption[];
  point: TalkingPointDto | null;
  onCancel: () => void;
  onSaved: (result: TalkingPointDto) => void;
}) {
  const identity = getIdentity();
  const [scope, setScope] = useState<TalkingPointScope>(point?.scope ?? defaultScope);
  const [bodyHtml, setBodyHtml] = useState(point?.bodyHtml ?? "");
  // New points default to the Scrum Master pseudo-assignee (see SCRUM_MASTER) - editing an existing
  // point always keeps whoever it's actually assigned to.
  const [assigneeEmail, setAssigneeEmail] = useState(point?.assigneeEmail ?? SCRUM_MASTER.email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assigneeOptions = useMemo(() => {
    const withIdentity =
      identity?.signedIn && identity.email && !people.some((p) => p.email.toLowerCase() === identity.email!.toLowerCase())
        ? [{ email: identity.email, displayName: identity.displayName || identity.email }, ...people]
        : people;
    return [SCRUM_MASTER, ...withIdentity];
  }, [people, identity]);

  async function save() {
    if (!assigneeEmail) {
      setError("Välj vem den ska tilldelas.");
      return;
    }
    setSaving(true);
    setError(null);
    const assignee = assigneeOptions.find((p) => p.email === assigneeEmail);
    const assigneeDisplayName = assignee?.displayName ?? assigneeEmail;
    try {
      const result = point
        ? await updateTalkingPoint(point.id, { scope, bodyHtml, assigneeEmail, assigneeDisplayName })
        : await createTalkingPoint({
            scope,
            bodyHtml,
            assigneeEmail,
            assigneeDisplayName,
            createdByEmail: identity?.email ?? undefined,
            createdByDisplayName: identity?.displayName ?? undefined,
          });
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stp-form">
      <div className="stp-form__row">
        <label className="stp-form__field">
          <span>Tilldelas</span>
          <select value={assigneeEmail} onChange={(e) => setAssigneeEmail(e.target.value)}>
            {assigneeOptions.map((p) => (
              <option key={p.email} value={p.email}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="stp-form__field">
          <span>Team</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as TalkingPointScope)}>
            <option value="Nord">Nord</option>
            <option value="Syd">Syd</option>
            <option value="Both">Båda teamen</option>
          </select>
        </label>
      </div>
      <RichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Vad ska tas upp? Klistra gärna in en skärmbild direkt här." minRows={4} />
      {error && <p className="dailys-board__status dailys-board__status--error">{error}</p>}
      <div className="stp-form__actions">
        <button type="button" className="wi-btn" onClick={onCancel} disabled={saving}>
          Avbryt
        </button>
        <button type="button" className="wi-btn wi-btn--primary" onClick={() => void save()} disabled={saving || !bodyHtml.trim()}>
          {saving ? "Sparar…" : "Spara"}
        </button>
      </div>
    </div>
  );
}
