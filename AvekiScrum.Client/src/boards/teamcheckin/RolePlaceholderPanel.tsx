import type { AgendaStep } from "./agenda";
import "./RolePlaceholderPanel.css";

/** Every agenda step without a real view yet - see TeamCheckInBoard's step→panel switch. Swap for
 *  a real panel per role/step as they get built, one at a time, same as ScrumMasterView was. */
export function RolePlaceholderPanel({ step }: { step: AgendaStep }) {
  return (
    <div className="tcb-placeholder">
      <div className="tcb-placeholder__icon">{step.icon}</div>
      <div className="tcb-placeholder__title">{step.label}</div>
      <p className="tcb-placeholder__note">Innehåll för den här punkten är inte byggt än.</p>
    </div>
  );
}
