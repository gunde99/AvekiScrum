import { useState } from "react";
import { PersonAvatar } from "../../components/PersonAvatar";
import type { FlowParticipant } from "./dailysLogic";
import "./FlowParticipants.css";

interface FlowParticipantsProps {
  participants: FlowParticipant[];
  /** personKeys currently taking part - everyone else is skipped by the flow. */
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  /** Drops every saved choice for this team, back to the configured default. */
  onReset: () => void;
}

function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="6" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.6 13.4c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 3.2a2.4 2.4 0 0 1 0 4.6M12.2 9.9c1.4.5 2.4 1.8 2.4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Who the daily flow stops at, decided per team and remembered between meetings - somebody off
 * sick gets unticked before the standup instead of being skipped over live. Purely about the
 * flow: everyone here keeps their cards and their group on the board either way.
 */
export function FlowParticipants({ participants, selected, onToggle, onSelectAll, onSelectNone, onReset }: FlowParticipantsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = participants.filter((p) => selected.has(p.key)).length;

  if (!isOpen) {
    return (
      <button
        type="button"
        className="flow-participants__toggle"
        onClick={() => setIsOpen(true)}
        title="Välj vilka som deltar i daily-flödet"
      >
        <PeopleIcon />
        <span>Deltagare</span>
        <span className="flow-participants__badge">
          {activeCount}/{participants.length}
        </span>
      </button>
    );
  }

  return (
    <div className="flow-participants">
      <div className="flow-participants__head">
        <div>
          <span className="flow-participants__title">Deltagare i daily-flödet</span>
          <span className="flow-participants__hint">Urbockade hoppas över – korten ligger kvar på boarden.</span>
        </div>
        <button type="button" className="flow-participants__collapse" onClick={() => setIsOpen(false)} title="Dölj deltagare">
          <PeopleIcon />
        </button>
      </div>

      <div className="flow-participants__actions">
        <button type="button" onClick={onSelectAll}>
          Alla
        </button>
        <button type="button" onClick={onSelectNone}>
          Ingen
        </button>
        <button type="button" onClick={onReset}>
          Återställ
        </button>
      </div>

      <div className="flow-participants__list">
        {participants.length === 0 && <span className="flow-participants__empty">Inga utvecklare att visa.</span>}
        {participants.map((p) => (
          <button
            key={p.key}
            type="button"
            className={"flow-participants__pill" + (selected.has(p.key) ? " flow-participants__pill--on" : "")}
            onClick={() => onToggle(p.key)}
            // Someone outside the roster is here only because they own a card - worth saying, since
            // that's also why they start out unticked.
            title={p.isRoster ? `${p.displayName} · ${p.cardCount} kort` : `${p.displayName} · utanför teamets utvecklarlista`}
          >
            <PersonAvatar name={p.displayName} size={22} />
            <span className="flow-participants__name">{p.displayName}</span>
            <span className="flow-participants__count">{p.cardCount}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
