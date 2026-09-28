import { useState, type ReactNode } from "react";
import type { DailyStoryDto, DeveloperTeamId } from "../../api/dailys";
import type { WorkItemDetail } from "../../api/workitems";
import { WorkItemModal } from "./WorkItemModal";
import { WorkItemValidationModal } from "./WorkItemValidationModal";

interface UseWorkItemModalsOptions {
  team: DeveloperTeamId;
  /** Fired after a validation write worth reflecting on the board (Godkänn DoR, DoD, …) - typically
   *  a refetch. */
  onApproved?: () => void;
  /** Looks up the board's own row for whichever card the validation dialog has open, so its
   *  Definition of Done tab has something to draw from. Boards with no comparable row
   *  (Refinement's Feature-shaped data isn't a DailyStoryDto) just omit this - the tab stays hidden. */
  getStory?: (id: number) => DailyStoryDto | undefined;
  onDodApproved?: (storyId: number) => void;
  /** Fired after a plain "Spara" in the card's Redigera flow (not a validation write) - the modal
   *  already has the freshly-saved WorkItemDetail in hand, so the caller can patch its own list
   *  straight from that instead of refetching the whole board just to pick up one changed field. */
  onWorkItemSaved?: (detail: WorkItemDetail) => void;
}

/**
 * Every board opens work item cards the same way: a plain WorkItemModal, which can itself open a
 * Validering dialog (WorkItemValidationModal), whose own "open a related card" jumps back into the
 * plain modal. That two-state, two-component dance used to be copy-pasted per board, and it drifted -
 * three of the four boards never wired onOpenValidation through at all, so their cards had no
 * Validering button even though WorkItemModal supports one. One implementation, so a fix here reaches
 * every board that renders `modals`.
 */
export function useWorkItemModals({ team, onApproved, getStory, onDodApproved, onWorkItemSaved }: UseWorkItemModalsOptions) {
  const [openWorkItemId, setOpenWorkItemId] = useState<number | null>(null);
  const [openValidationId, setOpenValidationId] = useState<number | null>(null);

  const modals: ReactNode = (
    <>
      {openWorkItemId !== null && (
        <WorkItemModal
          workItemId={openWorkItemId}
          onClose={() => setOpenWorkItemId(null)}
          onOpenValidation={setOpenValidationId}
          onSaved={onWorkItemSaved}
        />
      )}
      {openValidationId !== null && (
        <WorkItemValidationModal
          workItemId={openValidationId}
          team={team}
          onClose={() => setOpenValidationId(null)}
          onApproved={onApproved}
          story={getStory?.(openValidationId)}
          onDodApproved={onDodApproved}
          onOpenRelation={(item) => {
            setOpenValidationId(null);
            setOpenWorkItemId(item.id);
          }}
        />
      )}
    </>
  );

  return { openWorkItemId, setOpenWorkItemId, openValidationId, setOpenValidationId, modals };
}
