import { useEffect } from "react";
import type { SprintGoal } from "../../api/sprintGoals";
import { SprintGoalDetails } from "./SprintGoalDetails";
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
          <SprintGoalDetails
            goal={goal}
            onOpenWorkItem={(id) => {
              onOpenWorkItem(id);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
