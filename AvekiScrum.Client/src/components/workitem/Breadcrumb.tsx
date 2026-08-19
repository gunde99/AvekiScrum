import { getWorkItemTypeConfig } from "./workItemTypeConfig";
import "./Breadcrumb.css";

export interface BreadcrumbHop {
  id: number;
  type: string;
  title: string;
  relationLabel: string | null; // null for the very first (root) item
}

interface BreadcrumbProps {
  hops: BreadcrumbHop[];
  onJump: (index: number) => void;
}

export function Breadcrumb({ hops, onJump }: BreadcrumbProps) {
  if (hops.length <= 1) return null;

  return (
    <div className="wi-breadcrumb">
      {hops.map((hop, index) => {
        const config = getWorkItemTypeConfig(hop.type);
        const isLast = index === hops.length - 1;
        return (
          <span key={`${hop.id}-${index}`} className="wi-breadcrumb__hop">
            {hop.relationLabel && <span className="wi-breadcrumb__relation">{hop.relationLabel}</span>}
            <button
              type="button"
              className={"wi-breadcrumb__item" + (isLast ? " wi-breadcrumb__item--current" : "")}
              onClick={() => onJump(index)}
              disabled={isLast}
              title={hop.title}
            >
              <span style={{ color: config.color }}>{config.icon}</span>
              <span>#{hop.id}</span>
            </button>
            {!isLast && <span className="wi-breadcrumb__sep">→</span>}
          </span>
        );
      })}
    </div>
  );
}
