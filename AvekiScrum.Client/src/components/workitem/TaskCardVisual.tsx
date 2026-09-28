import type { DragEvent, ReactNode } from "react";
import "./TaskCardVisual.css";

export type TaskCardTone = "new" | "active" | "resolved" | "done" | "test" | "doc" | "notok" | "default";

export function toneFromAzureState(state: string | null | undefined): TaskCardTone {
  switch ((state || "").trim().toLowerCase()) {
    case "new": return "new";
    case "active": return "active";
    case "resolved": return "resolved";
    case "closed":
    case "done": return "done";
    default: return "default";
  }
}

function ageLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  return `${days}d`;
}

/**
 * Azure's own Activity values (see workItemTypeConfig.ACTIVITIES) as small glyphs, so a column of
 * stacked task cards reads by shape before you even get to the text. Unrecognised/missing activity
 * renders nothing rather than a generic placeholder - a blank is less misleading than a wrong icon.
 */
function ActivityIcon({ activity }: { activity: string }) {
  switch (activity.trim().toLowerCase()) {
    case "development":
      return (
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
          <path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "testing":
      return (
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
          <path
            d="M6 2h4M6.5 2v3.6L3.6 11c-.6 1.1.2 2.4 1.5 2.4h5.8c1.3 0 2.1-1.3 1.5-2.4L9.5 5.6V2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "documentation":
      return (
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
          <path d="M4 2h5l3 3v9H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M6 8h4M6 10.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case "design":
      return (
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
          <path d="M11.5 2.5 13.5 4.5 5 13l-3 1 1-3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "deployment":
      return (
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
          <path d="M8 11V2M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 11v2.5h10V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "requirements":
      return (
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
          <path d="M4 2.5h8v11H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M6 6l1 1 2-2M6 10l1 1 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

/** Microsoft.VSTS.CMMI.Blocked=True - a warning-triangle paired with the word itself, since a
 *  colour alone (the dashed red border) isn't enough to carry the meaning on its own. */
function BlockedBadge() {
  return (
    <span className="kbc-blocked">
      <svg viewBox="0 0 16 16" width="10" height="10" fill="none" aria-hidden="true">
        <path d="M8 2 14.5 13.5h-13z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M8 6.5v3M8 11.3v.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      Blockerad
    </span>
  );
}

export interface TaskCardVisualProps {
  id: number;
  title: string;
  statusLabel: string;
  tone: TaskCardTone;
  assignedTo?: string | null;
  activity?: string | null;
  createdDate?: string | null;
  /** Microsoft.VSTS.CMMI.Blocked=True on this task - shown as a red dashed border plus an
   *  icon+text badge, distinct from the tone's own colour since "blocked" isn't a verdict. */
  isBlocked?: boolean;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onOpen?: () => void;
  href?: string;
}

export function TaskCardVisual({
  id,
  title,
  statusLabel,
  tone,
  assignedTo,
  activity,
  createdDate,
  isBlocked,
  draggable,
  onDragStart,
  onOpen,
  href,
}: TaskCardVisualProps) {
  const age = ageLabel(createdDate);
  const cardTitle = isBlocked ? `Blockerad – ${title}` : title;

  const content: ReactNode = (
    <>
      <div className="kbc-head">
        <span className="kbc-key">#{id}</span>
        <span className={`kbc-status kbc-status--${tone}`}>{statusLabel}</span>
      </div>
      <div className="kbc-title">{title}</div>
      {isBlocked && <BlockedBadge />}
      <div className="kbc-foot">
        <span className="kbc-foot__who">{assignedTo || "–"}</span>
        {activity && (
          <span className="kbc-activity">
            <ActivityIcon activity={activity} />
            {activity}
          </span>
        )}
        {age && <span className="kbc-age">{age}</span>}
      </div>
    </>
  );

  const className = `kb-card kb-card--${tone}${draggable ? " kb-card--draggable" : ""}${isBlocked ? " kb-card--blocked" : ""}`;

  if (onOpen) {
    return (
      <button type="button" className={className} onClick={onOpen} title={cardTitle}>
        {content}
      </button>
    );
  }
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={(e) => e.stopPropagation()}
      title={cardTitle}
    >
      {content}
    </a>
  );
}
