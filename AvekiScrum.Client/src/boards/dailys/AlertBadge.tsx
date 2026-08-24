import { useRef, useState } from "react";
import type { DailyStoryDto } from "../../api/dailys";
import { alertDetailsFor, effectiveAlertLevel, korthygienWarnings } from "./dailysLogic";
import { FloatingPopover } from "./FloatingPopover";
import "./AlertBadge.css";

const ICONS: Record<string, string> = {
  Critical: "🚨",
  Warning: "⚠",
  Notice: "◎",
};

export function AlertBadge({ story }: { story: DailyStoryDto }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  // Both the level and the list come from dailysLogic, so the badge, the row tint and the group
  // accent can never disagree about whether this card is flagged.
  const level = effectiveAlertLevel(story);
  if (!level) return <div className="alert-badge" />;

  const hygiene = korthygienWarnings(story);
  const details = alertDetailsFor(story);
  const icon = ICONS[level];
  const summary =
    story.alertSummary ||
    (hygiene.length === 1 ? hygiene[0] : `${hygiene.length} brister i korthygienen`);

  return (
    <div className="alert-badge">
      <button
        ref={ref}
        type="button"
        className={`alert-badge__icon alert-badge__icon--${level.toLowerCase()}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={summary}
      >
        {icon}
      </button>
      {open && (
        <FloatingPopover anchorRef={ref} onClose={() => setOpen(false)} className="alert-popover">
          <div className={`alert-popover__head alert-popover__head--${level.toLowerCase()}`}>
            {level === "Critical" ? "Kritisk avvikelse" : level === "Warning" ? "Varning" : "Notis"}
          </div>
          <div className="alert-popover__summary">{summary}</div>
          {details.length > 0 && (
            <ul className="alert-popover__details">
              {details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </FloatingPopover>
      )}
    </div>
  );
}
