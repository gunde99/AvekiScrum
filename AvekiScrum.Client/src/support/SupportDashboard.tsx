import { useEffect, useMemo, useState } from "react";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { WorkItemModal } from "../components/workitem/WorkItemModal";
import { fetchSupportBugs, type SupportBug, type SupportBugsResponse } from "../api/support";
import { samePerson } from "../lib/personNames";
import { loadReporter } from "./reporter";
import { SupportFilterPanel } from "./SupportFilterPanel";
import {
  activeFilterCount,
  compareBugs,
  defaultDateRange,
  EMPTY_FILTERS,
  formatDate,
  matchesFilters,
  shortAreaPath,
  shortIteration,
  shortSeverity,
  SUPPORT_STATUSES,
  severityRank,
  type SortKey,
  type SortState,
  type SupportFilters,
} from "./supportLogic";
import "./SupportViews.css";

type ScopeKey = "mine" | "all";

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M13.6 6.4A5.8 5.8 0 1 0 14 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M13.9 2.6v3.9h-3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Column {
  key: SortKey;
  label: string;
  /** Narrow columns are hidden first when the table has to shrink. */
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "id", label: "Id", className: "sup-col--id" },
  { key: "status", label: "Status", className: "sup-col--status" },
  { key: "title", label: "Rubrik", className: "sup-col--title" },
  { key: "severity", label: "Allvarlighet", className: "sup-col--sev" },
  { key: "version", label: "Version", className: "sup-col--version" },
  { key: "area", label: "Area Path", className: "sup-col--area" },
  { key: "iteration", label: "Sprint", className: "sup-col--iteration" },
  { key: "customer", label: "Kund", className: "sup-col--customer" },
  { key: "reporter", label: "Rapportör", className: "sup-col--person" },
  { key: "assignee", label: "Tilldelad", className: "sup-col--person" },
  { key: "created", label: "Skapad", className: "sup-col--date" },
  { key: "changed", label: "Ändrad", className: "sup-col--date" },
];

/**
 * Follow-up view: every bug support has reported - the ones filed from this tool, and the ones
 * filed by hand in Azure with a Lime link - and where each one has got to.
 *
 * Deliberately not a work board. The question a support person has is whether their bug is still
 * sitting in the backlog, has been planned in, or is being worked on right now, so that answer is
 * a colour on every row and a count at the top.
 */
export function SupportDashboard() {
  const [response, setResponse] = useState<SupportBugsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Someone who hasn't filed anything from this browser has no "mina" to show, and an empty list
  // is a bad first impression - they get everyone's cases instead.
  const [scope, setScope] = useState<ScopeKey>(loadReporter() ? "mine" : "all");
  const [range, setRange] = useState(defaultDateRange);
  const [filters, setFilters] = useState<SupportFilters>(EMPTY_FILTERS);
  // Most recently touched first: what support wants to see is what moved, not what was filed.
  const [sort, setSort] = useState<SortState>({ key: "changed", direction: "desc" });
  const [openId, setOpenId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const me = loadReporter();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchSupportBugs(range, controller.signal)
      .then((result) => {
        setResponse(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [range, reloadToken]);

  const bugs = useMemo(() => response?.bugs ?? [], [response]);

  // samePerson rather than a string compare: someone typing "Sofie Backo" without the diacritic
  // still means the Sofie Backö whose name is on the cards.
  const mine = useMemo(() => bugs.filter((bug) => samePerson(bug.reporter, me)), [bugs, me]);

  const scoped = scope === "mine" ? mine : bugs;

  const availableVersions = useMemo(
    () => [...new Set(bugs.flatMap((bug) => bug.versions))].sort().reverse(),
    [bugs],
  );
  const availableAreas = useMemo(
    () => [...new Set(bugs.map((bug) => bug.areaPath ?? "").filter(Boolean))].sort(),
    [bugs],
  );
  // "Konsult" is whoever filed the bug: the Buggrapportör line on cards this tool wrote, and the
  // card's creator on the ones written by hand in Azure.
  const availableConsultants = useMemo(
    () => [...new Set(bugs.map((bug) => bug.reporter ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv")),
    [bugs],
  );
  const availableCustomers = useMemo(
    () => [...new Set(bugs.flatMap((bug) => bug.customers))].sort((a, b) => a.localeCompare(b, "sv")),
    [bugs],
  );

  const visible = useMemo(
    () => scoped.filter((bug) => matchesFilters(bug, filters)).sort((a, b) => compareBugs(a, b, sort)),
    [scoped, filters, sort],
  );

  // Counts ignore the status filter itself - otherwise picking one status would zero the others
  // and there'd be no way to see what you're switching between.
  const counts = useMemo(() => {
    const withoutStatus = { ...filters, statuses: new Set<string>() };
    const base = scoped.filter((bug) => matchesFilters(bug, withoutStatus));
    const map = new Map<string, number>(SUPPORT_STATUSES.map((status) => [status.key, 0]));
    for (const bug of base) map.set(bug.statusKey, (map.get(bug.statusKey) ?? 0) + 1);
    return map;
  }, [scoped, filters]);


  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : // Dates and severity are most useful newest/worst first; text reads better A–Ö.
          { key, direction: key === "created" || key === "changed" || key === "severity" ? "desc" : "asc" },
    );
  }

  return (
    <div className="sup-dash">
      {loading && <LoadingOverlay message="Hämtar ärenden…" sub="Läser buggar från Azure DevOps" />}

      <div className="sup-dash__toolbar">
        <div className="sup-dash__group" role="group" aria-label="Urval">
          <button
            type="button"
            className={"sup-tab" + (scope === "mine" ? " sup-tab--active" : "")}
            onClick={() => setScope("mine")}
          >
            Mina ärenden ({mine.length})
          </button>
          <button
            type="button"
            className={"sup-tab" + (scope === "all" ? " sup-tab--active" : "")}
            onClick={() => setScope("all")}
          >
            Alla inrapporterade ({bugs.length})
          </button>
        </div>

        <SupportFilterPanel
          filters={filters}
          onChange={setFilters}
          versions={availableVersions}
          areas={availableAreas}
          consultants={availableConsultants}
          customers={availableCustomers}
          range={range}
          onRangeChange={setRange}
        />

        <button
          type="button"
          className="sup-refresh"
          onClick={() => setReloadToken((t) => t + 1)}
          title="Hämta om listan från Azure DevOps"
        >
          <RefreshIcon />
          <span>Refresh</span>
        </button>
      </div>

      <div className="sup-statusbar">
        {SUPPORT_STATUSES.map((status) => {
          const active = filters.statuses.has(status.key);
          return (
            <button
              key={status.key}
              type="button"
              className={
                `sup-statuscard sup-statuscard--${status.key}` +
                (status.primary ? "" : " sup-statuscard--secondary") +
                (active ? " sup-statuscard--active" : "")
              }
              onClick={() =>
                setFilters((prev) => {
                  const next = new Set(prev.statuses);
                  if (next.has(status.key)) next.delete(status.key);
                  else next.add(status.key);
                  return { ...prev, statuses: next };
                })
              }
              title={status.hint}
            >
              <span className="sup-statuscard__count">{counts.get(status.key) ?? 0}</span>
              <span className="sup-statuscard__label">{status.label}</span>
              {status.primary && <span className="sup-statuscard__hint">{status.hint}</span>}
            </button>
          );
        })}
      </div>

      {error && <p className="sup-error">Fel: {error}</p>}

      {/* The cut is by creation date, newest first - so the way to reach the rest is to move the
          window back in time, not to make it narrower. The old wording said "korta ner
          intervallet", which is the one thing that doesn't help. */}
      {response?.truncated && (
        <p className="sup-dash__notice">
          Datumintervallet matchar {response.total} ärenden – de {bugs.length} senast skapade visas. Flytta
          <strong> till</strong>-datumet bakåt för att komma åt de äldre.
        </p>
      )}

      {scope === "mine" && !me && (
        <p className="sup-dash__empty">
          Vi vet inte vem du är än – fyll i ditt namn när du rapporterar ett ärende, så samlas dina ärenden här.
        </p>
      )}

      {!loading && visible.length === 0 ? (
        <p className="sup-dash__empty">Inga ärenden matchar urvalet.</p>
      ) : (
        <div className="sup-tablewrap">
          <table className="sup-table">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={
                      (column.className ?? "") + (sort.key === column.key ? " sup-th--sorted" : "")
                    }
                    aria-sort={
                      sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
                    }
                  >
                    <button type="button" className="sup-th__button" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      <span className="sup-th__arrow" aria-hidden="true">
                        {sort.key === column.key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((bug) => (
                <BugRow key={bug.id} bug={bug} onOpen={setOpenId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <p className="sup-dash__count">
          {visible.length} av {scoped.length} ärenden
          {activeFilterCount(filters) > 0 && ` · ${activeFilterCount(filters)} filter aktiva`}
        </p>
      )}

      {openId !== null && (
        <WorkItemModal
          workItemId={openId}
          onClose={(changed) => {
            setOpenId(null);
            // Only when something was actually written. Reading a card and closing it changes
            // nothing in Azure, so refetching hundreds of bugs behind it - splash and all - would
            // be work done to arrive back at the list you already had.
            if (changed) setReloadToken((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function BugRow({ bug, onOpen }: { bug: SupportBug; onOpen: (id: number) => void }) {
  return (
    <tr className="sup-tr" onClick={() => onOpen(bug.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(bug.id)}>
      {/* No jump-out arrow here: a click opens the card in this app, not in Azure. The arrow
          belongs where you actually leave - inside the card, next to the id and the Lime case. */}
      <td className="sup-col--id">#{bug.id}</td>
      <td className="sup-col--status">
        <span className={`sup-status sup-status--${bug.statusKey}`}>{bug.statusLabel}</span>
      </td>
      <td className="sup-col--title">
        <span className="sup-tr__title">{bug.title}</span>
        {bug.colleagues.length > 0 && <span className="sup-tr__sub">{bug.colleagues.join(", ")}</span>}
      </td>
      <td className="sup-col--sev">
        <span className={`sup-sev sup-sev--${severityRank(bug.severity)}`}>{shortSeverity(bug.severity)}</span>
      </td>
      <td className="sup-col--version">{bug.versions.join(", ") || "–"}</td>
      <td className="sup-col--area" title={bug.areaPath ?? ""}>
        {shortAreaPath(bug.areaPath)}
      </td>
      <td className="sup-col--iteration" title={bug.iterationPath ?? ""}>
        {/* Empty for anything still in the backlog: the project root on its own says nothing. */}
        {shortIteration(bug.iterationPath) || "–"}
      </td>
      <td className="sup-col--customer" title={bug.customers.join("\n")}>
        {bug.customers[0] ?? "–"}
        {bug.customers.length > 1 && <span className="sup-tr__more"> +{bug.customers.length - 1}</span>}
      </td>
      <td className="sup-col--person">{bug.reporter ?? "–"}</td>
      <td className="sup-col--person">{bug.assignedTo ?? "–"}</td>
      <td className="sup-col--date">{formatDate(bug.createdDate)}</td>
      <td className="sup-col--date">{formatDate(bug.changedDate)}</td>
    </tr>
  );
}
