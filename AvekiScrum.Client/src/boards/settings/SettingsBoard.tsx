import { useEffect, useMemo, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { useToast } from "../../components/Toast";
import { PersonAvatar } from "../../components/PersonAvatar";
import { RichText } from "../../components/RichText";
import { RichTextEditor } from "../../components/workitem/RichTextEditor";
import { ConfirmDialog } from "../../components/workitem/ConfirmDialog";
import { fetchAllPeople, type PersonOption } from "../../api/people";
import { getIdentity } from "../../auth/identity";
import type { DeveloperTeamId } from "../../api/dailys";
import {
  createTalkingPoint,
  deleteTalkingPoint,
  fetchTalkingPoints,
  setAllTalkingPointsRaised,
  setTalkingPointRaised,
  updateTalkingPoint,
  type TalkingPointDto,
} from "../../api/talkingPoints";
import "./SettingsBoard.css";

type Tab = "active" | "history";
type BulkAction = "raise" | "reset";

interface SettingsBoardProps {
  onNavigate?: (board: "refinement" | "dailys" | "review" | "test" | "settings") => void;
  onHome?: () => void;
  team: DeveloperTeamId;
  onTeamChange: (team: DeveloperTeamId) => void;
}

/**
 * "Saker att ta upp" - a suggestion box for things that should be raised with someone during a
 * daily (a PO's ask, a heads-up for a teammate, ...). Created and managed here; DailyFlow.tsx is
 * what actually weaves the still-open ones into the flow itself.
 */
export function SettingsBoard({ onNavigate, onHome, team, onTeamChange }: SettingsBoardProps) {
  const { showToast } = useToast();
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
    fetchTalkingPoints(team)
      .then((result) => setPoints(result))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Kunde inte hämta listan."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  useEffect(() => {
    fetchAllPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  // Oldest first for what's still pending (first come, first raised); most recently raised first
  // in the history, so the tab opens on what just happened rather than the very first entry ever.
  const active = useMemo(
    () => points.filter((p) => !p.raised).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [points],
  );
  const history = useMemo(
    () => points.filter((p) => p.raised).sort((a, b) => (b.raisedAt ?? "").localeCompare(a.raisedAt ?? "")),
    [points],
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
    try {
      const updated = await withBusy(point.id, () => setTalkingPointRaised(point.id, team, !point.raised));
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
      await withBusy(point.id, () => deleteTalkingPoint(point.id, team));
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
      await setAllTalkingPointsRaised(team, raised);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunde inte uppdatera alla.", "error");
    }
  }

  function saveFromForm(result: TalkingPointDto) {
    setPoints((prev) => (prev.some((p) => p.id === result.id) ? prev.map((p) => (p.id === result.id ? result : p)) : [...prev, result]));
    setEditing(null);
  }

  return (
    <BoardShell
      activeBoard="settings"
      onNavigate={onNavigate}
      onHome={onHome}
      team={team}
      onTeamChange={onTeamChange}
      title="Inställningar"
      subtitle="Saker att ta upp"
    >
      <div className="dailys-board__toolbar">
        <div className="dailys-board__group" role="group" aria-label="Vy">
          <span className="dailys-board__group-label">Visa</span>
          <div className="dailys-board__group-body">
            <button
              type="button"
              className={"dailys-board__tab" + (tab === "active" ? " dailys-board__tab--active" : "")}
              onClick={() => setTab("active")}
            >
              Aktiva ({active.length})
            </button>
            <button
              type="button"
              className={"dailys-board__tab" + (tab === "history" ? " dailys-board__tab--active" : "")}
              onClick={() => setTab("history")}
            >
              Historik ({history.length})
            </button>
          </div>
        </div>

        <div className="dailys-board__group" role="group" aria-label="Åtgärder">
          <span className="dailys-board__group-label">Åtgärder</span>
          <div className="dailys-board__group-body">
            <button type="button" className="wi-btn wi-btn--primary" onClick={() => setEditing("new")}>
              + Ny sak att ta upp
            </button>
            <button
              type="button"
              className="wi-btn"
              onClick={() => setBulkAction("raise")}
              disabled={active.length === 0}
              title="Markera alla just nu öppna punkter som lyfta"
            >
              Bocka av allt
            </button>
            <button
              type="button"
              className="wi-btn"
              onClick={() => setBulkAction("reset")}
              disabled={history.length === 0}
              title="Flytta tillbaka alla avbockade punkter till Aktiva"
            >
              Återställ allt
            </button>
          </div>
        </div>
      </div>

      {editing && <TalkingPointForm team={team} people={people} point={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={saveFromForm} />}

      {loading && <LoadingOverlay message="Hämtar saker att ta upp…" />}
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
                  <span className="stp-row__date">
                    {point.raised && point.raisedAt
                      ? `Lyft ${new Date(point.raisedAt).toLocaleDateString("sv-SE")}`
                      : `Skapad ${new Date(point.createdAt).toLocaleDateString("sv-SE")}`}
                  </span>
                </div>
                <RichText content={point.bodyHtml} className="stp-row__content" />
              </div>
              <div className="stp-row__actions">
                <label className="stp-row__checkbox" title={point.raised ? "Markera som inte lyft" : "Markera som lyft"}>
                  <input type="checkbox" checked={point.raised} disabled={busyIds.has(point.id)} onChange={() => void toggleRaised(point)} />
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
              ? `Alla ${active.length} just nu öppna punkter för det här teamet markeras som lyfta.`
              : `Alla ${history.length} avbockade punkter för det här teamet flyttas tillbaka till Aktiva.`
          }
          confirmLabel={bulkAction === "raise" ? "Bocka av allt" : "Återställ allt"}
          onConfirm={() => void confirmBulk()}
          onCancel={() => setBulkAction(null)}
        />
      )}
    </BoardShell>
  );
}

function TalkingPointForm({
  team,
  people,
  point,
  onCancel,
  onSaved,
}: {
  team: DeveloperTeamId;
  people: PersonOption[];
  point: TalkingPointDto | null;
  onCancel: () => void;
  onSaved: (result: TalkingPointDto) => void;
}) {
  const identity = getIdentity();
  const [bodyHtml, setBodyHtml] = useState(point?.bodyHtml ?? "");
  const [assigneeEmail, setAssigneeEmail] = useState(point?.assigneeEmail ?? identity?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The signed-in identity - normally Miro, the SM - is the default assignee, but "Scrum Master"
  // isn't a TeamRoleConfig role, so they may not be on the fetched roster at all. Added explicitly
  // here, rather than only defaulting the select's value, so that default actually has an option to
  // land on instead of silently showing blank.
  const assigneeOptions = useMemo(() => {
    if (identity?.signedIn && identity.email && !people.some((p) => p.email.toLowerCase() === identity.email!.toLowerCase())) {
      return [{ email: identity.email, displayName: identity.displayName || identity.email }, ...people];
    }
    return people;
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
        ? await updateTalkingPoint(point.id, { team, bodyHtml, assigneeEmail, assigneeDisplayName })
        : await createTalkingPoint({
            team,
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
      <label className="stp-form__field">
        <span>Tilldelas</span>
        <select value={assigneeEmail} onChange={(e) => setAssigneeEmail(e.target.value)}>
          <option value="">Välj person…</option>
          {assigneeOptions.map((p) => (
            <option key={p.email} value={p.email}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>
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
