import { useState } from "react";
import type { DailyStoryDto } from "../../api/dailys";
import { PersonAvatar } from "../../components/PersonAvatar";
import { AlertBadge } from "./AlertBadge";
import { Kanban } from "./Kanban";
import { TaskPills } from "./TaskPills";
import {
  azureStatusClass,
  fmtDate,
  fmtDateTime,
  fullPersonName,
  isStoryDone,
  sortStories,
  storyProg,
  type FlowLaneStage,
  type SortDir,
  type SortKey,
} from "./dailysLogic";
import "./StoryTable.css";

const COLUMNS: { key: SortKey; label: string; align?: "center" }[] = [
  { key: "id", label: "ID" },
  { key: "title", label: "Titel" },
  { key: "developer", label: "Utvecklare" },
  { key: "azureStatus", label: "Status" },
  { key: "lastChangedDate", label: "Senast ändrat" },
  { key: "storyPoints", label: "SP", align: "center" },
  { key: "stageLabel", label: "Stadie" },
];

interface StoryTableProps {
  stories: (DailyStoryDto & { roleText?: string })[];
  onOpenWorkItem: (id: number) => void;
  onOpenValidation: (id: number) => void;
  onTaskDrop: (taskId: number, targetLane: FlowLaneStage) => void;
}

function hasTag(tags: string[], tag: string): boolean {
  return tags.some((t) => t.trim().toLowerCase() === tag.toLowerCase());
}

export function StoryTable({ stories, onOpenWorkItem, onOpenValidation, onTaskDrop }: StoryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("lastChangedDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openStories, setOpenStories] = useState<Set<number>>(new Set());

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "lastChangedDate" ? "desc" : "asc");
    }
  }

  function toggleStory(id: number) {
    setOpenStories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rows = sortStories(stories, sortKey, sortDir);

  return (
    <div className="story-table">
      <div className="story-head">
        <div />
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className="sortable"
            style={col.align === "center" ? { textAlign: "center" } : undefined}
            onClick={() => handleSort(col.key)}
          >
            {col.label}
            {sortKey === col.key && <span className="sort-mark">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
          </div>
        ))}
        <div>Leveransstatus</div>
        <div className="sortable" onClick={() => handleSort("progress")}>
          Klar{sortKey === "progress" && <span className="sort-mark">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
        </div>
        <div />
        <div>Validering</div>
      </div>

      {rows.map((story) => {
        const isOpen = openStories.has(story.id);
        const isBug = story.type === "Bug";
        const progress = storyProg(story);
        const alertCls = story.alertLevel === "Critical" ? "al-crit" : story.alertLevel === "Warning" ? "al-warn" : "";

        return (
          <div className={`story-item ${isOpen ? "story-item--open" : ""}`} key={story.id}>
            <div
              className={`story-row ${isOpen ? "open" : ""} ${alertCls} ${isBug ? "is-bug" : ""}`}
              onClick={() => toggleStory(story.id)}
            >
              <span className={`sr-chev ${isOpen ? "sr-chev--open" : ""}`}>▶</span>
              <div className="sr-key">
                <span className="item-type-icon" title={isBug ? "Bug" : "User Story"}>
                  {isBug ? "🐞" : "📖"}
                </span>
                <button
                  type="button"
                  className="sr-open-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenWorkItem(story.id);
                  }}
                  title="Öppna detaljer"
                >
                  #{story.id}
                </button>
              </div>
              <div
                className="sr-title"
                title={story.title}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenWorkItem(story.id);
                }}
              >
                <div className="sr-title-main">{story.title}</div>
                {story.roleText && <div className="sr-role-text">{story.roleText}</div>}
              </div>
              <div className="sr-person">
                <PersonAvatar
                  name={story.developer}
                  size={22}
                  done={isStoryDone(story)}
                  doneTitle={`Kortet är ${story.azureStatus || "stängt"}`}
                />
                <span>{fullPersonName(story.developer) || "Ej tilldelad"}</span>
              </div>
              <div>
                <span className={`azure-status ${azureStatusClass(story.azureStatus)}`}>{story.azureStatus || "-"}</span>
              </div>
              <div>
                <span title={fmtDateTime(story.lastChangedDate)}>{fmtDate(story.lastChangedDate)}</span>
              </div>
              <div style={{ textAlign: "center" }}>
                <span className="sp-badge">{story.storyPoints ?? "?"}</span>
              </div>
              <div>
                <span className="stage-badge">{story.stageLabel}</span>
              </div>
              <div>
                <TaskPills story={story} />
              </div>
              <div className="prog-sm">
                <div className="prog-track-sm">
                  <div
                    className={`prog-fill-sm ${progress >= 100 ? "prog-fill-sm--done" : progress > 0 ? "prog-fill-sm--active" : ""}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="prog-pct-sm">{progress}%</span>
              </div>
              <AlertBadge story={story} />
              <div
                className="sr-validation"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenValidation(story.id);
                }}
              >
                {hasTag(story.tags, "DoR") || hasTag(story.tags, "INVEST") ? (
                  <button type="button" className="sr-validation__checks" title="Öppna validering">
                    {hasTag(story.tags, "DoR") && <span title="DoR godkänd">✓DoR</span>}
                    {hasTag(story.tags, "INVEST") && <span title="INVEST godkänd">✓INVEST</span>}
                  </button>
                ) : (
                  <button type="button" className="sr-validation__btn" title="Öppna validering">
                    Validering
                  </button>
                )}
              </div>
            </div>
            {isOpen && (
              <div className="kanban-wrap">
                <Kanban story={story} onTaskDrop={onTaskDrop} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
