import { Section } from "../../components/workitem/Section";
import type { SprintGoal } from "../../api/sprintGoals";
import "./SprintGoalModal.css";

interface SprintGoalDetailsProps {
  goal: SprintGoal;
  onOpenWorkItem: (id: number) => void;
}

/**
 * The sprint goal's full content - description, owners/sakkunnig, deliverables, Definition of
 * Done, sub-goals, linked work items. Split out of SprintGoalModal so the same rendering shows up
 * both in that popup (Dailys) and inline in the Review board's expandable group header - one
 * implementation of "what a sprint goal looks like" instead of two that drift apart.
 */
export function SprintGoalDetails({ goal, onOpenWorkItem }: SprintGoalDetailsProps) {
  const allWorkItemIds = [...new Set([...goal.workItemIds, ...goal.subGoals.flatMap((s) => s.workItemIds)])];

  return (
    <div className="sg-details">
      {goal.description && (
        <Section title="Beskrivning">
          <div className="wi-rich-text">{goal.description}</div>
        </Section>
      )}

      {(goal.owners.length > 0 || goal.expert) && (
        <Section title="Ansvar">
          <div className="sg-meta-row">
            {goal.owners.length > 0 && <span>Ansvarig: {goal.owners.join(", ")}</span>}
            {goal.expert && <span>Sakkunnig: {goal.expert}</span>}
          </div>
        </Section>
      )}

      {goal.deliverables.length > 0 && (
        <Section title="Delleverans">
          <ul className="sg-checklist">
            {goal.deliverables.map((d) => (
              <li key={d.id} className={d.done ? "sg-checklist__item--done" : ""}>
                <span>{d.done ? "☑" : "☐"}</span>
                {d.priority && <span className="sg-priority">P{d.priority}</span>}
                {d.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {goal.definitionOfDone.length > 0 && (
        <Section title="Definition of Done">
          <ul className="sg-checklist">
            {goal.definitionOfDone.map((d) => (
              <li key={d.id} className={d.checked ? "sg-checklist__item--done" : ""}>
                <span>{d.checked ? "☑" : "☐"}</span>
                {d.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {goal.subGoals.length > 0 && (
        <Section title="Delmål">
          <div className="sg-subgoals">
            {goal.subGoals.map((s) => (
              <div className="sg-subgoal" key={s.id}>
                <div className="sg-subgoal__title">
                  {s.priority && <span className="sg-priority">P{s.priority}</span>}
                  {s.title}
                </div>
                {s.description && <div className="sg-subgoal__desc">{s.description}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {allWorkItemIds.length > 0 && (
        <Section title="Work items" hint={`${allWorkItemIds.length} st`}>
          <div className="sg-work-items">
            {allWorkItemIds.map((id) => (
              <button key={id} type="button" className="sg-work-item-chip" onClick={() => onOpenWorkItem(id)}>
                #{id}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
