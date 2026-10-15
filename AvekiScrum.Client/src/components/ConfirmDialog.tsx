import { createRoot } from "react-dom/client";
import { ConfirmDialogView, type ConfirmOptions } from "./ConfirmDialogView";

export type { ConfirmOptions } from "./ConfirmDialogView";

/**
 * The app's replacement for window.confirm: a centered dialog in the app's own look. Mounted on
 * demand into its own root and resolved as a promise, so any handler can just
 * `if (!(await confirmDialog({...}))) return;` - no provider or state to thread through.
 * Esc and a click on the backdrop cancel; Enter confirms (the confirm button has focus).
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (result: boolean) => {
      root.unmount();
      host.remove();
      resolve(result);
    };
    root.render(<ConfirmDialogView {...options} onClose={close} />);
  });
}
