import { useState } from "react";
import type { WorkItemHistoryEntry } from "../../api/workitems";
import "./WorkItemHistoryTab.css";

interface HistoryRevision {
  key: string;
  when: string | null;
  changedBy: string | null;
  revision: number;
  entries: WorkItemHistoryEntry[];
}

function formatHistoryDate(value: string | null): string {
  if (!value) return "Okänt datum";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() >= 9999) return "Okänt datum";
  return date.toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

/** Azure stores System.History as HTML, including mention links. Extract only readable text:
 * no HTML is inserted into the page, and React escapes the result as normal text. */
function readableHistoryText(value: string | null): string {
  if (!value) return "";
  if (!/<[a-z][\s/>]/i.test(value) && !/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(value)) {
    return value;
  }

  const source = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li(?:\s[^>]*)?>/gi, "\n• ")
    .replace(/<\/(?:div|p|li|ul|ol|h[1-6]|blockquote)\s*>/gi, "\n");
  const parsed = new DOMParser().parseFromString(source, "text/html");
  parsed.body.querySelectorAll("script, style, template, iframe, object, svg").forEach((node) => node.remove());
  parsed.body.querySelectorAll("img").forEach((image) => {
    image.replaceWith(parsed.createTextNode(image.getAttribute("alt") || "[Bild]"));
  });

  return (parsed.body.textContent || "")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function groupByRevision(history: WorkItemHistoryEntry[]): HistoryRevision[] {
  const groups = new Map<string, HistoryRevision>();

  history.forEach((entry, index) => {
    const key = entry.revision > 0 ? "rev-" + entry.revision : "entry-" + index;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
      return;
    }

    groups.set(key, {
      key,
      when: entry.when,
      changedBy: entry.changedBy,
      revision: entry.revision,
      entries: [entry],
    });
  });

  return [...groups.values()];
}

/** The default, collapsed line: what kind of change this revision was, in one short sentence -
 *  the detail of exactly which values changed is one click away, not the first thing shown. */
function summarizeRevision(entries: WorkItemHistoryEntry[]): string {
  const fieldNames = entries.filter((e) => e.field !== "Kommentar").map((e) => e.field);
  const hasComment = entries.some((e) => e.field === "Kommentar");

  const parts: string[] = [];
  if (fieldNames.length > 0) {
    const shown = fieldNames.slice(0, 3).join(", ");
    const rest = fieldNames.length > 3 ? ` (+${fieldNames.length - 3} till)` : "";
    parts.push(`${fieldNames.length === 1 ? "Ändrade" : `${fieldNames.length} fält ändrade`}: ${shown}${rest}`);
  }
  if (hasComment) parts.push("Ny kommentar");

  return parts.join(" · ") || "Uppdaterad";
}

function RevisionRow({ revision }: { revision: HistoryRevision }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="wi-history__revision">
      <button
        type="button"
        className="wi-history__summary"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className={"wi-history__chevron" + (expanded ? " wi-history__chevron--open" : "")}>▸</span>
        <time className="wi-history__when">{formatHistoryDate(revision.when)}</time>
        {revision.changedBy && <strong className="wi-history__by">{revision.changedBy}</strong>}
        <span className="wi-history__summary-text">{summarizeRevision(revision.entries)}</span>
        {revision.revision > 0 && <span className="wi-history__rev">Rev {revision.revision}</span>}
      </button>

      {expanded && (
        <div className="wi-history__changes">
          {revision.entries.map((entry, index) => (
            <div
              className={"wi-history__row" + (entry.field === "Kommentar" ? " wi-history__row--comment" : "")}
              key={revision.key + "-" + entry.field + "-" + index}
            >
              <span className="wi-history__field">{entry.field}</span>
              {entry.field === "Kommentar" ? (
                <span className="wi-history__comment">{readableHistoryText(entry.newValue || entry.oldValue) || "–"}</span>
              ) : (
                <span className="wi-history__change">
                  <span className="wi-history__old">{readableHistoryText(entry.oldValue) || "–"}</span>
                  <span className="wi-history__arrow">→</span>
                  <span className="wi-history__new">{readableHistoryText(entry.newValue) || "–"}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function WorkItemHistoryTab({ history }: { history: WorkItemHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="wi-empty-state">Ingen historik tillgänglig.</p>;
  }

  return (
    <div className="wi-history">
      {groupByRevision(history).map((revision) => (
        <RevisionRow key={revision.key} revision={revision} />
      ))}
    </div>
  );
}
