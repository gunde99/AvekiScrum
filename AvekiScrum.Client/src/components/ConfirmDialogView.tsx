import { useEffect, useRef } from "react";
import "./ConfirmDialog.css";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Destructive action (delete, discard) - red confirm button. */
  danger?: boolean;
}

/** The dialog itself - opened through confirmDialog(), see ConfirmDialog.tsx. */
export function ConfirmDialogView({
  title,
  message,
  confirmText = "OK",
  cancelText = "Avbryt",
  danger,
  onClose,
}: ConfirmOptions & { onClose: (result: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className={"confirm-icon" + (danger ? " confirm-icon--danger" : "")} aria-hidden="true">
          {danger ? "!" : "?"}
        </div>
        <h2 className="confirm-title" id="confirm-title">
          {title}
        </h2>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button type="button" className="confirm-btn" onClick={() => onClose(false)}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={"confirm-btn " + (danger ? "confirm-btn--danger" : "confirm-btn--primary")}
            onClick={() => onClose(true)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
