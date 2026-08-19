import { useRef, useState } from "react";
import type { DailyStoryDto } from "../../api/dailys";
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

  const icon = ICONS[story.alertLevel];
  if (!icon) return <div className="alert-badge" />;

  // alertDetails already includes releaseBranchWarnings, merged and de-duplicated server-side -
  // concatenating releaseBranchWarnings again here would show every release-branch warning twice.
  const details = [...new Set(story.alertDetails ?? [])];

  return (
    <div className="alert-badge">
      <button
        ref={ref}
        type="button"
        className={`alert-badge__icon alert-badge__icon--${story.alertLevel.toLowerCase()}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={story.alertSummary}
      >
        {icon}
      </button>
      {open && (
        <FloatingPopover anchorRef={ref} onClose={() => setOpen(false)} className="alert-popover">
          <div className={`alert-popover__head alert-popover__head--${story.alertLevel.toLowerCase()}`}>
            {story.alertLevel === "Critical" ? "Kritisk avvikelse" : story.alertLevel === "Warning" ? "Varning" : "Notis"}
          </div>
          <div className="alert-popover__summary">{story.alertSummary}</div>
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
