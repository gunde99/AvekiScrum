import { useState, type ReactNode } from "react";
import "./Section.css";

interface SectionProps {
  title: string;
  hint?: string;
  /** When true, the title bar turns green - used by validation-style sections to show "all checks pass". */
  ok?: boolean;
  /** When true, the header can be clicked to hide the body - for sections that tend to run long
   *  (the description) and otherwise push everything below it out of view. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

/** Labeled card used throughout the work item form - a dark title bar over a content panel. */
export function Section({ title, hint, ok, collapsible, defaultCollapsed = false, children }: SectionProps) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);

  return (
    <div className="wi-section">
      <div
        className={`wi-section__head${ok ? " wi-section__head--ok" : ""}${collapsible ? " wi-section__head--collapsible" : ""}`}
        onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? !collapsed : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                setCollapsed((c) => !c);
              }
            : undefined
        }
      >
        <span>
          {collapsible && <span className={"wi-section__chevron" + (collapsed ? " wi-section__chevron--collapsed" : "")}>▾</span>}
          {title}
        </span>
        {hint && <span className="wi-section__hint">{hint}</span>}
      </div>
      {!collapsed && <div className="wi-section__body">{children}</div>}
    </div>
  );
}
