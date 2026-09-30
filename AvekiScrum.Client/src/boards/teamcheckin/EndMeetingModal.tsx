import { createPortal } from "react-dom";
import "./EndMeetingModal.css";

interface EndMeetingModalProps {
  onClose: () => void;
}

/**
 * Shown when "Avsluta mötet" is clicked - unlike StepTransitionModal this doesn't clear itself on a
 * timer, since it's the meeting's actual close rather than a between-steps flash; someone has to
 * click through it. Closing it is what resets TeamCheckInBoard back to its pre-meeting state (see
 * the onClose wiring there), so the next time the board opens it starts fresh rather than picking up
 * mid-agenda or with a stopped clock still on screen.
 */
export function EndMeetingModal({ onClose }: EndMeetingModalProps) {
  return createPortal(
    <div className="tcb-endmeeting-overlay" role="status" aria-live="polite">
      <div className="tcb-endmeeting-card">
        <div className="tcb-endmeeting-title">Tack för er medverkan</div>
        <img className="tcb-endmeeting-photo" src="/rollbilder/mote-slut.jpg" alt="" />
        <div className="tcb-endmeeting-subtitle">På återseende nästa vecka</div>
        <button type="button" className="daily-flow__btn daily-flow__btn--primary tcb-endmeeting-close" onClick={onClose}>
          Stäng
        </button>
      </div>
    </div>,
    document.body,
  );
}
