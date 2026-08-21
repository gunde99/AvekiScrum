import { PersonAvatar } from "../../components/PersonAvatar";
import type { DailyStoryDto } from "../../api/dailys";
import { azureStatusClass, fullPersonName } from "../dailys/dailysLogic";
import "./ReviewCard.css";

interface ReviewCardProps {
  story: DailyStoryDto;
  selected: boolean;
  onToggleSelect: (id: number, additive: boolean) => void;
  onOpen: (id: number) => void;
  /** Set on the left-hand list; panel cards get a remove button instead. */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onRemove?: () => void;
  busy?: boolean;
}

/** One work item, reduced to what's needed to decide how it should be presented at the review. */
export function ReviewCard({ story, selected, onToggleSelect, onOpen, draggable, onDragStart, onRemove, busy }: ReviewCardProps) {
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
      <span className="rv-card__title" title={story.title}>
        {story.title}
      </span>
      <span className={`rv-card__state ${azureStatusClass(story.azureStatus)}`}>{story.azureStatus}</span>
      <span className="rv-card__dev" title={fullPersonName(story.developer) || "Ej tilldelad"}>
        <PersonAvatar name={story.developer} size={20} />
        <span>{fullPersonName(story.developer) || "–"}</span>
      </span>
      <span className="rv-card__sp">{story.storyPoints || 0} SP</span>
      {onRemove && (
        <button
          type="button"
          className="rv-card__remove"
          title="Ta bort taggen och lägg tillbaka kortet i listan"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={busy}
        >
          {busy ? "…" : "✕"}
        </button>
      )}
    </div>
  );
}
