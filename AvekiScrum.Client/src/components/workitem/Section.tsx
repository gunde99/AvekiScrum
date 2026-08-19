import type { ReactNode } from "react";
import "./Section.css";

interface SectionProps {
  title: string;
  hint?: string;
  /** When true, the title bar turns green - used by validation-style sections to show "all checks pass". */
  ok?: boolean;
  children: ReactNode;
}

/** Labeled card used throughout the work item form - a dark title bar over a content panel. */
export function Section({ title, hint, ok, children }: SectionProps) {
  return (
    <div className="wi-section">
      <div className={`wi-section__head${ok ? " wi-section__head--ok" : ""}`}>
        <span>{title}</span>
        {hint && <span className="wi-section__hint">{hint}</span>}
      </div>
      <div className="wi-section__body">{children}</div>
    </div>
  );
}
