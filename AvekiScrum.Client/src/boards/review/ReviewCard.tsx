import { PersonAvatar } from "../../components/PersonAvatar";
import { StatePill } from "../../components/workitem/StatePill";
import { getWorkItemTypeConfig } from "../../components/workitem/workItemTypeConfig";
import type { DailyStoryDto } from "../../api/dailys";
import { fullPersonName } from "../dailys/dailysLogic";
import "./ReviewCard.css";

interface ReviewCardProps {
  story: DailyStoryDto;
  selected: boolean;
  onToggleSelect: (id: number, additive: boolean) => void;
  onOpen: (id: number) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  busy?: boolean;
}

/**
 * The left-hand list's own card - everything worth knowing before deciding where a card goes at
 * review: title, status, area path, every tag, story points, who owns it. See ReviewPanelCard for
 * the pared-down version a card gets once it's actually sorted into a lane.
 */
export function ReviewCard({ story, selected, onToggleSelect, onOpen, draggable, onDragStart, busy }: ReviewCardProps) {
  const config = getWorkItemTypeConfig(story.type);
  return (
    <div
      className={"rv-card" + (selected ? " rv-card--selected" : "") + (busy ? " rv-card--busy" : "")}
      draggable={draggable && !busy}
      onDragStart={onDragStart}
      // Ctrl/Shift keeps the existing selection so several cards can be dragged together.
      onClick={(e) => onToggleSelect(story.id, e.ctrlKey || e.metaKey || e.shiftKey)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggleSelect(story.id, e.ctrlKey || e.metaKey || e.shiftKey);
        }
      }}
    >
      <button
        type="button"
        className="rv-card__id"
        title="Öppna kortet"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(story.id);
        }}
      >
        #{story.id}
      </button>

      <span className="rv-card__icon" style={{ color: config.color }} title={story.type} aria-hidden="true">
        {config.icon}
      </span>

      <div className="rv-card__lines">
        <div className="rv-card__line1">
          <span className="rv-card__title" title={story.title}>
            {story.title}
          </span>
          <StatePill state={story.azureStatus} size="sm" />
          <span className="rv-card__sp">{story.storyPoints || 0} SP</span>
        </div>
        <div className="rv-card__line2">
          {story.areaPath && (
            <span className="rv-card__area" title={story.areaPath}>
              {story.areaPath}
            </span>
          )}
          {story.tags.map((tag) => (
            <span className="rv-card__tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      <span className="rv-card__dev" title={fullPersonName(story.developer) || "Ej tilldelad"}>
        <PersonAvatar name={story.developer} size={24} />
      </span>
    </div>
  );
}
