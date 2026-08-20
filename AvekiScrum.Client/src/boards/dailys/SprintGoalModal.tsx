import { useEffect } from "react";
import { Section } from "../../components/workitem/Section";
import type { SprintGoal } from "../../api/sprintGoals";
import "./SprintGoalModal.css";

interface SprintGoalModalProps {
  goal: SprintGoal;
  onClose: () => void;
  onOpenWorkItem: (id: number) => void;
}

export function SprintGoalModal({ goal, onClose, onOpenWorkItem }: SprintGoalModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const allWorkItemIds = [...new Set([...goal.workItemIds, ...goal.subGoals.flatMap((s) => s.workItemIds)])];

  return (
    <div className="sg-modal-overlay" onClick={onClose}>
      <div className="sg-modal" onClick={(e) => e.stopPropagation()}>
        <header className="sg-modal__header">
          <div className="sg-modal__title">
            Sprintmål {goal.number} - {goal.title}
          </div>
          <button type="button" className="sg-modal__close" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </header>

        <div className="sg-modal__body">
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
                  <button
                    key={id}
                    type="button"
                    className="sg-work-item-chip"
                    onClick={() => {
                      onOpenWorkItem(id);
                      onClose();
                    }}
                  >
                    #{id}
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
