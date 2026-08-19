import "./LoadingOverlay.css";

interface LoadingOverlayProps {
  message: string;
  sub?: string;
}

/** Full-screen, input-blocking splash for long first-time operations (e.g. the initial fetch
 *  from Azure DevOps when a board first opens) - tells the user something real is happening. */
export function LoadingOverlay({ message, sub }: LoadingOverlayProps) {
  return (
    <div className="loading-overlay">
      <div className="loading-overlay__spinner">
        <span />
        <span />
        <span />
      </div>
      <div className="loading-overlay__message">{message}</div>
      {sub && <div className="loading-overlay__sub">{sub}</div>}
    </div>
  );
}
