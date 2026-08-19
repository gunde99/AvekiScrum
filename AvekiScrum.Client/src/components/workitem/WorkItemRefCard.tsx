import type { WorkItemRelationRef } from "../../api/workitems";
import { getWorkItemTypeConfig } from "./workItemTypeConfig";
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
      <span className="wi-ref-card__id">#{item.id}</span>
      <span className="wi-ref-card__title">{item.title}</span>
      <span className="wi-ref-card__state">{item.state}</span>
      {badge && <span className="wi-ref-card__badge">{badge}</span>}
    </button>
  );
}
