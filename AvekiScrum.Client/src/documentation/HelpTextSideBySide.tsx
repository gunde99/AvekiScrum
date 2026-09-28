import { useEffect, useState } from "react";
import { fetchWorkItemDetail, type WorkItemDetail } from "../api/workitems";
import { WorkItemModal } from "../components/workitem/WorkItemModal";
import { LoadingOverlay } from "../components/LoadingOverlay";
import "./DocumentationViews.css";

interface HelpTextSideBySideProps {
  taskId: number;
  onClose: () => void;
}

/** WorkItemModal doesn't report anything back in embedded mode - both panels reload themselves
 *  from Azure on their own next open, same as any other embedded use of this component. */
function noop() {
  /* no-op */
}

/**
 * The point of the whole exercise: the hjälptext-Task and the card it belongs to, open at once.
 * Both are the real, editable WorkItemModal (embedded) - not a read-only preview - so a konsult can
 * write the text on one side while checking the feature's description or acceptance criteria on
 * the other, without switching cards back and forth.
 */
export function HelpTextSideBySide({ taskId, onClose }: HelpTextSideBySideProps) {
  const [detail, setDetail] = useState<WorkItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchWorkItemDetail(taskId, controller.signal)
      .then((d) => {
        setDetail(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [taskId]);

  // The first Related link is the source card, when there is one - tasks TD created without
  // pointing at a specific dev card (e.g. under "Uppdatera befintliga texter") have none, and get
  // shown alone rather than the panel claiming a source that doesn't exist.
  const sourceId = detail?.related[0]?.id ?? null;

  return (
    <div className="doc-sbs-overlay" onClick={onClose}>
      <div className="doc-sbs" onClick={(e) => e.stopPropagation()}>
        <div className="doc-sbs__bar">
          <span>
            Hjälptext #{taskId}
            {sourceId ? ` · källkort #${sourceId}` : " · inget kopplat kort"}
          </span>
          <button type="button" className="wi-modal__close" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </div>

        {loading && <LoadingOverlay message="Hämtar korten…" />}
        {error && <p className="sup-error">Fel: {error}</p>}

        {!loading && !error && (
          <div className={"doc-sbs__panels" + (sourceId ? "" : " doc-sbs__panels--single")}>
            <div className="doc-sbs__panel">
              <WorkItemModal workItemId={taskId} embedded onClose={noop} />
            </div>
            {sourceId && (
              <div className="doc-sbs__panel">
                <WorkItemModal workItemId={sourceId} embedded onClose={noop} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
