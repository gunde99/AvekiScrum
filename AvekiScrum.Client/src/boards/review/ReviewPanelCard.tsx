import { PersonAvatar } from "../../components/PersonAvatar";
import type { DailyStoryDto } from "../../api/dailys";
import { fullPersonName } from "../dailys/dailysLogic";
import "./ReviewPanelCard.css";

interface ReviewPanelCardProps {
  story: DailyStoryDto;
  onOpen: (id: number) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onRemove?: () => void;
  busy?: boolean;
}

/**
 * A card that's already been sorted into a lane. By this point the decision that mattered (which
 * lane) is made and the panel is grouped by developer already - the card itself only needs to say
 * who owns it and what it's called. See ReviewCard for the richer version on the left, where that
 * decision is still being made.
 */
export function ReviewPanelCard({ story, onOpen, draggable, onDragStart, onRemove, busy }: ReviewPanelCardProps) {
  return (
    <div
      className={"rv-panel-card" + (busy ? " rv-panel-card--busy" : "")}
      draggable={draggable && !busy}
      onDragStart={onDragStart}
      onClick={() => onOpen(story.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onOpen(story.id);
        }
      }}
    >
      <PersonAvatar name={story.developer} size={22} />
      <span className="rv-panel-card__title" title={`#${story.id} ${story.title} · ${fullPersonName(story.developer) || "Ej tilldelad"}`}>
        {story.title}
      </span>
      {onRemove && (
        <button
          type="button"
          className="rv-panel-card__remove"
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
