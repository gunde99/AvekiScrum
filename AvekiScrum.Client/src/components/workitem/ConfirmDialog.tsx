import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small centred confirmation. Portalled to document.body so it sits above the card modal rather
 * than inside its stacking context, and deliberately not dismissible by clicking the backdrop -
 * the whole point is that the choice has to be made.
 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Avbryt", danger, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Escape cancels - the safe option. Enter is left alone so a stray keypress can't confirm
      // a discard.
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  return createPortal(
    <div className="confirm-overlay" role="presentation">
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 className="confirm__title" id="confirm-title">
          {title}
        </h2>
        <p className="confirm__message">{message}</p>
        <div className="confirm__actions">
          <button type="button" className="wi-btn" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className={"wi-btn " + (danger ? "wi-btn--danger" : "wi-btn--primary")} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
