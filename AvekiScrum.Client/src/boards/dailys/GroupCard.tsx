import { PersonAvatar } from "../../components/PersonAvatar";
import { StoryTable } from "./StoryTable";
import { pct, UNASSIGNED_GROUP_LABEL, type StoryGroup, type FlowLaneStage } from "./dailysLogic";
import type { SprintGoal } from "../../api/sprintGoals";
import "./GroupCard.css";

interface GroupCardProps {
  group: StoryGroup;
  isOpen: boolean;
  isFlowHighlighted?: boolean;
  onToggle: () => void;
  onOpenWorkItem: (id: number) => void;
  onOpenValidation: (id: number) => void;
  onTaskDrop: (taskId: number, targetLane: FlowLaneStage) => void;
  sprintGoalsByNumber?: Map<number, SprintGoal>;
  onOpenSprintGoal?: (goalNumber: number) => void;
}

export function GroupCard({
  group,
  isOpen,
  isFlowHighlighted,
  onToggle,
  onOpenWorkItem,
  onOpenValidation,
  onTaskDrop,
  sprintGoalsByNumber,
  onOpenSprintGoal,
}: GroupCardProps) {
  const { stories } = group;
  const goalNumberMatch = group.mode === "goals" ? group.label.match(/\d+/) : null;
  const goalNumber = goalNumberMatch ? Number(goalNumberMatch[0]) : null;
  const matchedGoal = goalNumber !== null ? sprintGoalsByNumber?.get(goalNumber) : undefined;
  const groupLabel = matchedGoal ? `Sprintmål ${matchedGoal.number} - ${matchedGoal.title}` : group.label;
  const totalSP = stories.reduce((a, s) => a + (s.storyPoints || 0), 0);
  const doneSP = stories.filter((s) => s.stage === "Done").reduce((a, s) => a + (s.storyPoints || 0), 0);
  const progress = pct(doneSP, totalSP);
  const done = stories.filter((s) => s.stage === "Done").length;
  const active = stories.filter((s) => s.stage !== "Done" && s.stage !== "New").length;
  const newCount = stories.filter((s) => s.stage === "New").length;
  const hasCrit = stories.some((s) => s.alertLevel === "Critical");
  const hasWarn = stories.some((s) => s.alertLevel === "Warning");

  const accentCls = hasCrit ? "gr-crit" : hasWarn ? "gr-warn" : progress >= 100 ? "gr-done" : progress > 0 ? "gr-active" : "gr-idle";

  return (
    <div id={`group-${group.id}`} className={`group-card ${isOpen ? "open" : ""} ${isFlowHighlighted ? "group-card--flow-highlight" : ""}`}>
      <div className={`group-row ${accentCls}`} onClick={onToggle}>
        <span className={`group-chev ${isOpen ? "group-chev--open" : ""}`}>▶</span>
        <div className="group-label">
          {group.mode === "developer" && group.label !== UNASSIGNED_GROUP_LABEL ? (
            <>
              <PersonAvatar name={group.label} size={26} />
              <span>{group.label}</span>
            </>
          ) : group.label === UNASSIGNED_GROUP_LABEL ? (
            // Not a person - an initials avatar here would read as a colleague called "Ej Tilldelad".
            <>
              <span className="group-unassigned-icon">?</span>
              <span>{group.label}</span>
            </>
          ) : (
            <span>{groupLabel}</span>
          )}
          {matchedGoal && onOpenSprintGoal && (
            <button
              type="button"
              className="group-goal-info"
              title="Visa sprintmålsinformation"
              aria-label="Visa sprintmålsinformation"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSprintGoal(matchedGoal.number);
              }}
            >
              ⓘ
            </button>
          )}
        </div>
        <div className="group-meta">
          {active > 0 && <span className="gm-badge gm-active">{active} aktiva</span>}
          {done > 0 && <span className="gm-badge gm-done">{done} klara</span>}
          {newCount > 0 && <span className="gm-badge gm-new">{newCount} ej startade</span>}
          {hasCrit && <span className="gm-badge gm-crit">🚨 Kritisk</span>}
          {hasWarn && <span className="gm-badge gm-warn">⚠ Varning</span>}
        </div>
        <div className="group-prog-wrap">
          <div className="group-prog-track">
            <div
              className={`group-prog-fill ${progress >= 100 ? "group-prog-fill--done" : progress > 0 ? "group-prog-fill--active" : ""}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="group-prog-pct">{progress}%</span>
        </div>
        <span className="group-sp">
          {doneSP}/{totalSP} SP
        </span>
        <span className="group-count">{stories.length} stories</span>
      </div>
      {/* An empty subGroups array is still truthy - guard on length, or a group with no role
          buckets (e.g. "Ej tilldelad") renders an empty container and its stories vanish. */}
      {isOpen && group.mode === "developer" && group.subGroups && group.subGroups.length > 0 ? (
        <div className="group-subgroups">
          {group.subGroups.map((sub) => (
            <div key={sub.key} className="group-subgroup">
              <div className={`group-subgroup__label group-subgroup__label--${sub.key}`}>
                {sub.label} <span className="group-subgroup__count">({sub.stories.length})</span>
              </div>
              <StoryTable stories={sub.stories} onOpenWorkItem={onOpenWorkItem} onOpenValidation={onOpenValidation} onTaskDrop={onTaskDrop} />
            </div>
          ))}
        </div>
      ) : (
        isOpen && (
          <StoryTable stories={stories} onOpenWorkItem={onOpenWorkItem} onOpenValidation={onOpenValidation} onTaskDrop={onTaskDrop} />
        )
      )}
    </div>
  );
}
