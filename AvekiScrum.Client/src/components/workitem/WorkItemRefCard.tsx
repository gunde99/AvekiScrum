import type { WorkItemRelationRef } from "../../api/workitems";
import { getWorkItemTypeConfig } from "./workItemTypeConfig";
import { StatePill } from "./StatePill";
import "./WorkItemRefCard.css";

interface WorkItemRefCardProps {
  item: WorkItemRelationRef;
  badge?: string;
  onOpen: () => void;
}

export function WorkItemRefCard({ item, badge, onOpen }: WorkItemRefCardProps) {
  const config = getWorkItemTypeConfig(item.type);
  return (
    <button type="button" className="wi-ref-card" onClick={onOpen} title={item.title}>
      <span className="wi-ref-card__icon" style={{ color: config.color }}>
        {config.icon}
      </span>
      <div className="wi-ref-card__body">
        <div className="wi-ref-card__head">
          <span className="wi-ref-card__id">#{item.id}</span>
          <span className="wi-ref-card__title">{item.title}</span>
          <StatePill state={item.state} size="sm" />
        </div>
        {/* Only rendered when there's something to say - a bare Feature/Epic with no assignee or
            points shouldn't leave a hanging empty row. */}
        {(item.assignedTo || item.storyPoints != null || badge) && (
          <div className="wi-ref-card__meta">
            {item.assignedTo && <span>{item.assignedTo}</span>}
            {item.storyPoints != null && <span>{item.storyPoints} SP</span>}
            {badge && <span className="wi-ref-card__badge">{badge}</span>}
          </div>
        )}
      </div>
    </button>
  );
}
