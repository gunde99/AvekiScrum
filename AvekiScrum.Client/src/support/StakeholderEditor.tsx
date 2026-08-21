import { useState } from "react";
import type { SupportStakeholder } from "../api/support";
import type { PersonOption } from "../api/people";
import { formatStakeholderLine } from "./supportLogic";

interface StakeholderEditorProps {
  categories: string[];
  /** The reporter's own line - always first, always present, not removable. */
  reporterLine: SupportStakeholder | null;
  value: SupportStakeholder[];
  onChange: (next: SupportStakeholder[]) => void;
  /** Known colleagues, offered as suggestions for the internal categories. */
  people: PersonOption[];
}

/**
 * Adds stakeholders one at a time rather than letting people type into a free-text box. That's the
 * whole point: the field in Azure is today a pile of hand-written lines in a dozen shapes, and one
 * row at a time is what makes every card come out formatted the same.
 */
export function StakeholderEditor({ categories, reporterLine, value, onChange, people }: StakeholderEditorProps) {
  // The reporter has their own category and is added automatically, so the picker starts on the
  // one people actually add by hand.
  const addableCategories = categories.filter((c) => c !== "Buggrapportör");
  const [category, setCategory] = useState(addableCategories.includes("Kund") ? "Kund" : addableCategories[0] ?? "");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([...value, { category, name: trimmed, note: note.trim() || null }]);
    setName("");
    setNote("");
  }

  return (
    <div className="sup-stakeholders">
      <ul className="sup-stakeholders__list">
        {reporterLine && (
          <li className="sup-stakeholders__row sup-stakeholders__row--fixed">
            <span className="sup-stakeholders__line">{formatStakeholderLine(reporterLine)}</span>
            <span className="sup-stakeholders__auto">läggs till automatiskt</span>
          </li>
        )}
        {value.map((stakeholder, index) => (
          <li className="sup-stakeholders__row" key={`${stakeholder.category}-${stakeholder.name}-${index}`}>
            <span className="sup-stakeholders__line">{formatStakeholderLine(stakeholder)}</span>
            <button
              type="button"
              className="sup-stakeholders__remove"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              title="Ta bort"
              aria-label={`Ta bort ${stakeholder.name}`}
            >
              ✕
            </button>
          </li>
        ))}
        {!reporterLine && value.length === 0 && (
          <li className="sup-stakeholders__empty">Ange först vem du är, så fylls buggrapportören i här.</li>
        )}
      </ul>

      <div className="sup-stakeholders__add">
        <select
          className="sup-input sup-stakeholders__category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Typ av intressent"
        >
          {addableCategories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          className="sup-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={category === "Kund" ? "Kommun eller organisation" : "Namn"}
          list={category === "Kund" ? undefined : "sup-people"}
          aria-label="Namn"
        />
        <input
          className="sup-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Kontakt eller ärendenr (valfritt)"
          aria-label="Notering"
        />
        <button type="button" className="wi-btn" onClick={add} disabled={!name.trim()}>
          Lägg till
        </button>
      </div>

      <datalist id="sup-people">
        {people.map((person) => (
          <option key={person.email} value={person.displayName} />
        ))}
      </datalist>
    </div>
  );
}
