import type { WorkItemHistoryEntry } from "../../api/workitems";
import "./WorkItemHistoryTab.css";

export function WorkItemHistoryTab({ history }: { history: WorkItemHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="wi-empty-state">Ingen historik tillgänglig.</p>;
  }

  return (
    <div className="wi-history">
      {history.map((h, i) => (
        <div className="wi-history__row" key={i}>
          <span className="wi-history__when">{new Date(h.when).toLocaleString("sv-SE")}</span>
          <span className="wi-history__field">{h.field}</span>
          <span className="wi-history__change">
            <span className="wi-history__old">{h.oldValue || "–"}</span>
            <span className="wi-history__arrow">→</span>
            <span className="wi-history__new">{h.newValue || "–"}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
