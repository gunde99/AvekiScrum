import { useEffect, useMemo, useState } from "react";
import { fetchDocumentationHelpTextTasks, type DocumentationHelpTextTask } from "../api/documentation";
import { identityName } from "../auth/identity";
import { samePerson } from "../lib/personNames";
import { formatDate } from "../support/supportLogic";
import { LoadingOverlay } from "../components/LoadingOverlay";
import "../support/SupportViews.css";
import "./DocumentationViews.css";

type ScopeKey = "mine" | "all";
export type HelpTextStatusFilter = "open" | "done";

interface DocumentationListProps {
  onOpen: (task: DocumentationHelpTextTask) => void;
  /** Konsult defaults to "mina" (there's usually a handful, spread across several writers);
   *  Dokumentatör defaults to "alla" (their job is to see everything waiting). */
  defaultScope: ScopeKey;
  /** "open" = still being written (Konsult's queue). "done" = closed by a konsult to mark
   *  "klart" - closing the card *is* the hand-off signal, so this is also Dokumentatör's queue. */
  statusFilter: HelpTextStatusFilter;
  emptyHint: string;
  allLabel: string;
  /** Bumped by the parent when a card's side-by-side view was closed, so a card a konsult just
   *  closed (marking it "klart") moves into the Dokumentatör tab without a manual refresh. */
  refreshSignal?: number;
}

/**
 * The list both AvekiDokumentation views are built from - every hjälptext-Task in the
 * Dokumentation project, wherever it came from. Kept as one component because the two views differ
 * only in framing (who it's for, which state counts as "for me right now"), not in what there is
 * to look at.
 */
export function DocumentationList({
  onOpen,
  defaultScope,
  statusFilter,
  emptyHint,
  allLabel,
  refreshSignal = 0,
}: DocumentationListProps) {
  const [tasks, setTasks] = useState<DocumentationHelpTextTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeKey>(defaultScope);
  const [reloadToken, setReloadToken] = useState(0);

  const me = identityName();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchDocumentationHelpTextTasks(controller.signal)
      .then((result) => {
        setTasks(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [reloadToken, refreshSignal]);

  const relevant = useMemo(
    () =>
      tasks.filter((t) =>
        statusFilter === "done" ? t.state.trim().toLowerCase() === "closed" : t.state.trim().toLowerCase() !== "closed",
      ),
    [tasks, statusFilter],
  );
  const mine = useMemo(() => relevant.filter((t) => samePerson(t.assignedTo, me)), [relevant, me]);
  const visible = scope === "mine" ? mine : relevant;

  return (
    <div className="sup-dash doc-list">
      {loading && <LoadingOverlay message="Hämtar hjälptextkort…" sub="Läser från Dokumentation-projektet" />}

      <div className="sup-dash__toolbar">
        <div className="sup-dash__group" role="group" aria-label="Urval">
          <button
            type="button"
            className={"sup-tab" + (scope === "mine" ? " sup-tab--active" : "")}
            onClick={() => setScope("mine")}
          >
            Tilldelade mig ({mine.length})
          </button>
          <button
            type="button"
            className={"sup-tab" + (scope === "all" ? " sup-tab--active" : "")}
            onClick={() => setScope("all")}
          >
            {allLabel} ({relevant.length})
          </button>
        </div>
        <button type="button" className="sup-refresh" onClick={() => setReloadToken((t) => t + 1)}>
          Refresh
        </button>
      </div>

      {error && <p className="sup-error">Fel: {error}</p>}

      {!loading && visible.length === 0 ? (
        <p className="sup-dash__empty">{emptyHint}</p>
      ) : (
        <div className="sup-tablewrap">
          <table className="sup-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Rubrik</th>
                <th>Status</th>
                <th>Taggar</th>
                <th>Tilldelad</th>
                <th>Ändrad</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => (
                <tr key={task.id} className="sup-tr" onClick={() => onOpen(task)} tabIndex={0}>
                  <td>#{task.id}</td>
                  <td>
                    <span className="sup-tr__title">{task.title}</span>
                  </td>
                  <td>{task.state}</td>
                  <td>{task.tags.join(", ") || "–"}</td>
                  <td>{task.assignedTo ?? "–"}</td>
                  <td>{formatDate(task.changedDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
