import { toneFromAzureState } from "./TaskCardVisual";
import "./StatePill.css";

/** An Azure work item state (New/Active/Resolved/Closed/…), coloured the same way everywhere it
 *  shows up - the card header, relation/backlog cards, the Overview tab's own Status field. */
export function StatePill({ state, size = "md" }: { state: string; size?: "sm" | "md" }) {
  return <span className={`state-pill state-pill--${toneFromAzureState(state)} state-pill--${size}`}>{state}</span>;
}
