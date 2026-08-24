import { useRef, useState } from "react";
import type { DailyStoryDto } from "../../api/dailys";
import { hasDodTag, korthygienWarnings } from "./dailysLogic";
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

  // A signed-off card says nothing further. That is the whole point of the tag: it is the record
  // of someone having judged the remaining warnings and accepted them.
  if (hasDodTag(story)) return <div className="alert-badge" />;

  // alertDetails already includes releaseBranchWarnings, merged and de-duplicated server-side -
  // concatenating releaseBranchWarnings again here would show every release-branch warning twice.
  const hygiene = korthygienWarnings(story);
  const details = [...new Set([...(story.alertDetails ?? []), ...hygiene])];

  // Card hygiene raises the badge on its own: a card nobody has described or pointed is worth
  // flagging even when the flow through the sprint looks perfectly healthy.
  const level = ICONS[story.alertLevel] ? story.alertLevel : hygiene.length > 0 ? "Warning" : null;
  if (!level) return <div className="alert-badge" />;
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
