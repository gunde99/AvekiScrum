import { useEffect, useMemo, useState } from "react";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { WorkItemModal } from "../components/workitem/WorkItemModal";
import { fetchSupportBugs, type SupportBug, type SupportBugsResponse } from "../api/support";
import { samePerson } from "../lib/personNames";
import { loadReporter } from "./reporter";
import { MultiSelect } from "./MultiSelect";
import {
  compareBugs,
  defaultDateRange,
  formatDate,
  matchesFilters,
  shortAreaPath,
  shortSeverity,
  SUPPORT_STATUSES,
  severityRank,
  type SortKey,
  type SortState,
} from "./supportLogic";
import "./SupportViews.css";

type ScopeKey = "mine" | "all";

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
  { key: "area", label: "Område", className: "sup-col--area" },
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [versionFilter, setVersionFilter] = useState<Set<string>>(new Set());
  const [areaFilter, setAreaFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: "created", direction: "desc" });
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

  const filters = useMemo(
    () => ({ search, statuses: statusFilter, versions: versionFilter, areas: areaFilter }),
    [search, statusFilter, versionFilter, areaFilter],
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

  const activeFilterCount =
    statusFilter.size + versionFilter.size + areaFilter.size + (search.trim() ? 1 : 0);

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

        <input
          className="sup-input sup-dash__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök på rubrik, id, kund, rapportör eller tagg"
          aria-label="Sök"
        />

        <MultiSelect
          label="Version"
          options={availableVersions}
          selected={versionFilter}
          onChange={setVersionFilter}
        />
        <MultiSelect
          label="Område"
          options={availableAreas}
          selected={areaFilter}
          onChange={setAreaFilter}
          format={shortAreaPath}
        />

        <div className="sup-dash__dates">
          <label className="sup-dash__date">
            <span>Skapade från</span>
            <input
              className="sup-input"
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
            />
          </label>
          <label className="sup-dash__date">
            <span>till</span>
            <input
              className="sup-input"
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
            />
          </label>
        </div>

        {activeFilterCount > 0 && (
          <button
            type="button"
            className="wi-btn"
            onClick={() => {
              setSearch("");
              setStatusFilter(new Set());
              setVersionFilter(new Set());
              setAreaFilter(new Set());
            }}
          >
            Rensa filter ({activeFilterCount})
          </button>
        )}

        <button type="button" className="wi-btn" onClick={() => setReloadToken((t) => t + 1)}>
          Uppdatera
        </button>
      </div>

      <div className="sup-statusbar">
        {SUPPORT_STATUSES.map((status) => {
          const active = statusFilter.has(status.key);
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
                setStatusFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(status.key)) next.delete(status.key);
                  else next.add(status.key);
                  return next;
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

      {response?.truncated && (
        <p className="sup-dash__notice">
          Datumintervallet matchar {response.total} ärenden – de {bugs.length} senaste visas. Korta ner
          intervallet för att se resten.
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
                <th className="sup-col--link">Lime</th>
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
        </p>
      )}

      {openId !== null && (
        <WorkItemModal
          workItemId={openId}
          onClose={() => {
            setOpenId(null);
            // A comment or a state change made in the modal should show in the list behind it.
            setReloadToken((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

function BugRow({ bug, onOpen }: { bug: SupportBug; onOpen: (id: number) => void }) {
  return (
    <tr className="sup-tr" onClick={() => onOpen(bug.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(bug.id)}>
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
      <td className="sup-col--customer" title={bug.customers.join("\n")}>
        {bug.customers[0] ?? "–"}
        {bug.customers.length > 1 && <span className="sup-tr__more"> +{bug.customers.length - 1}</span>}
      </td>
      <td className="sup-col--person">{bug.reporter ?? "–"}</td>
      <td className="sup-col--person">{bug.assignedTo ?? "–"}</td>
      <td className="sup-col--date">{formatDate(bug.createdDate)}</td>
      <td className="sup-col--date">{formatDate(bug.changedDate)}</td>
      <td className="sup-col--link">
        {bug.externalLink && isClickable(bug.externalLink) ? (
          <a
            href={bug.externalLink}
            target="_blank"
            rel="noreferrer"
            title={bug.externalLink}
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        ) : (
          <span title={bug.externalLink ?? ""}>{bug.externalLink ? "•" : ""}</span>
        )}
      </td>
    </tr>
  );
}

/**
 * The External link field holds a real URL on most cards, but sometimes just a note ("Dalavatten
 * (fredrik knapp)"). Only the former becomes a link; the rest is a dot with the text in its title,
 * rather than an anchor that goes nowhere.
 */
function isClickable(link: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(link.trim());
}
