import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { AgendaStep } from "./agenda";
import "./StepTransitionModal.css";

const FLASH_DURATION_MS = 2500;

interface StepTransitionModalProps {
  step: AgendaStep;
  onDone: () => void;
}

/**
 * Flashes up for a couple of seconds every time the agenda moves to a new step, then clears itself.
 * The right panel's own data fetch for the new step starts the moment this mounts (see
 * TeamCheckInBoard), so by the time this clears there's usually already something to show instead
 * of a bare loading state.
 *
 * The icon is a placeholder - no real photo per role/person exists yet (see agenda.ts) - swap
 * AgendaStep.icon for an actual image once one's sourced for a given role.
 */
export function StepTransitionModal({ step, onDone }: StepTransitionModalProps) {
  useEffect(() => {
    const id = window.setTimeout(onDone, FLASH_DURATION_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  return createPortal(
    <div className="tcb-transition-overlay" role="status" aria-live="polite">
      <div className="tcb-transition-card">
        <div className="tcb-transition-icon">{step.icon}</div>
        <div className="tcb-transition-label">{step.label}</div>
      </div>
    </div>,
    document.body,
  );
}
