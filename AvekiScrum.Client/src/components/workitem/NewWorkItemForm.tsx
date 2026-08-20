import { useState } from "react";
import { createLinkedWorkItem, type WorkItemDetail } from "../../api/workitems";
import type { PersonOption } from "../../api/people";
import { ACTIVITIES, CREATABLE_TYPES } from "./workItemTypeConfig";
import "./NewWorkItemForm.css";

interface NewWorkItemFormProps {
  source: WorkItemDetail;
  /** "child" hangs the new item under the card, "related" puts it beside it. */
  linkKind: "child" | "related";
  /** Types on offer; the taskboard only ever creates Tasks, relations can create anything. */
  types?: string[];
  people: PersonOption[];
  onCreated: () => void;
}

/**
 * Creates a work item linked to the card that's open. Area path and iteration are deliberately
 * not asked for - the backend copies them from the source card, which is right almost every time
 * and can be changed on the new card afterwards if it isn't.
 */
export function NewWorkItemForm({ source, linkKind, types = CREATABLE_TYPES, people, onCreated }: NewWorkItemFormProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(types[0]);
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [activity, setActivity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setAssignedTo("");
    setActivity("");
    setError(null);
  }

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createLinkedWorkItem(source.id, {
        type,
        title: title.trim(),
        linkKind,
        assignedTo: assignedTo || null,
        activity: type === "Task" ? activity || null : null,
      });
      reset();
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa kortet.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="wi-btn wi-new-item__open" onClick={() => setOpen(true)}>
        + {linkKind === "child" ? "Ny task" : "Nytt relaterat kort"}
      </button>
    );
  }

  return (
    <div className="wi-new-item">
      <div className="wi-new-item__row">
        {types.length > 1 && (
          <label className="wi-new-item__field wi-new-item__field--type">
            <span>Typ</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="wi-new-item__field wi-new-item__field--title">
          <span>Titel</span>
          <input
            type="text"
            value={title}
            autoFocus
            placeholder="Vad ska göras?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim() && !saving) void submit();
            }}
          />
        </label>
        <label className="wi-new-item__field">
          <span>Ansvarig</span>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">– ingen –</option>
            {people.map((p) => (
              <option key={p.email} value={p.displayName}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        {type === "Task" && (
          <label className="wi-new-item__field">
            <span>Aktivitet</span>
            <select value={activity} onChange={(e) => setActivity(e.target.value)}>
              <option value="">– ingen –</option>
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <p className="wi-new-item__error">{error}</p>}
      <div className="wi-new-item__actions">
        <span className="wi-new-item__hint">
          Ärver area path och iteration från #{source.id}.
        </span>
        <button
          type="button"
          className="wi-btn"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={saving}
        >
          Avbryt
        </button>
        <button type="button" className="wi-btn wi-btn--primary" onClick={submit} disabled={saving || !title.trim()}>
          {saving ? "Skapar…" : "Skapa"}
        </button>
      </div>
    </div>
  );
}
