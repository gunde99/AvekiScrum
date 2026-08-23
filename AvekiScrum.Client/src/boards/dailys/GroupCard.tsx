import { PersonAvatar } from "../../components/PersonAvatar";
import { StoryTable } from "./StoryTable";
import { samePerson, summarizeStories, UNASSIGNED_GROUP_LABEL, type StoryGroup, type FlowLaneStage } from "./dailysLogic";
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
  // A developer's group deliberately also holds cards they only contributed to - a task, a PR
  // review - so the same card sits in up to four groups at once. Summing all of them would credit
  // one card's story points to everyone who touched it, and the group totals would add up to far
  // more than the board holds. The header therefore reports the cards this person actually owns,
  // which do partition the board; the rest stay visible in the role sub-groups below and in the
  // card count on the right. Sprintmål and Ogrupperat already partition, so there they are the
  // same set. "Ej tilldelad" has no owner by definition, so it counts everything it holds.
  const ownsGroup = group.mode === "developer" && group.label !== UNASSIGNED_GROUP_LABEL;
  const statStories = ownsGroup ? stories.filter((s) => samePerson(s.developer, group.label)) : stories;
  const { done, active, newCount, totalSP, doneSP, progress, progressFromCards } = summarizeStories(statStories);
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
        <div
          className="group-prog-wrap"
          title={
            progressFromCards
              ? `${done} av ${statStories.length} kort klara (inga story points satta)`
              : // Says outright what makes a point count, because the answer is often "the work is
                // finished but the card is still open" and the bar alone looks like a contradiction.
                `${doneSP} av ${totalSP} SP klara – story points räknas när kortet är stängt`
          }
        >
          <div className="group-prog-track">
            <div
              className={`group-prog-fill ${progress >= 100 ? "group-prog-fill--done" : progress > 0 ? "group-prog-fill--active" : ""}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="group-prog-pct">{progress}%</span>
        </div>
        <span className="group-sp">{totalSP > 0 ? `${doneSP}/${totalSP} SP` : "– SP"}</span>
        {/* In developer mode the two numbers differ whenever the person is involved in cards they
            don't own, and saying so is the whole point - the header stats describe the "egna". */}
        <span className="group-count">
          {ownsGroup && statStories.length !== stories.length
            ? `${statStories.length} egna av ${stories.length} kort`
            : `${stories.length} kort`}
        </span>
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
