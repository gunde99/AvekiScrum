import { useEffect, useMemo, useState } from "react";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { WorkItemModal } from "../components/workitem/WorkItemModal";
import { fetchSupportBugs, type SupportBug } from "../api/support";
import { loadReporter } from "./reporter";
import { daysSince, FLOW_STAGES, formatDate, shortAreaPath, shortSeverity } from "./supportLogic";
import "./SupportViews.css";

type ScopeKey = "mine" | "all";

/**
 * Follow-up view: every bug filed through AvekiSupport and how far it has got. Deliberately not a
 * work board - the question a support person has is "har någon tagit tag i mitt ärende", so the
 * flow position is the thing that gets the space.
 */
export function SupportDashboard() {
  const [bugs, setBugs] = useState<SupportBug[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Someone who hasn't filed anything from this browser has no "mina" to show, and an empty list
  // is a bad first impression - they get everyone's cases instead.
  const [scope, setScope] = useState<ScopeKey>(loadReporter() ? "mine" : "all");
  const [stageFilter, setStageFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const me = loadReporter();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchSupportBugs(controller.signal)
      .then((result) => {
        setBugs(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  const mine = useMemo(
    () => (bugs ?? []).filter((bug) => !!me && bug.reporter?.toLowerCase() === me.toLowerCase()),
    [bugs, me],
  );

  const visible = useMemo(() => {
    const base = scope === "mine" ? mine : (bugs ?? []);
    const query = search.trim().toLowerCase();
    return base.filter((bug) => {
      if (stageFilter.size > 0 && !stageFilter.has(bug.stageKey)) return false;
      if (!query) return true;
      return (
        bug.title.toLowerCase().includes(query) ||
        String(bug.id).includes(query) ||
        (bug.reporter ?? "").toLowerCase().includes(query) ||
        bug.stakeholders.some((line) => line.toLowerCase().includes(query))
      );
    });
  }, [scope, mine, bugs, search, stageFilter]);

  const counts = useMemo(() => {
    const base = scope === "mine" ? mine : (bugs ?? []);
    const map = new Map<string, number>(FLOW_STAGES.map((stage) => [stage.key, 0]));
    for (const bug of base) map.set(bug.stageKey, (map.get(bug.stageKey) ?? 0) + 1);
    return map;
  }, [scope, mine, bugs]);

  if (loading) return <LoadingOverlay message="Hämtar ärenden…" />;
  if (error) return <p className="sup-error">Fel: {error}</p>;

  return (
    <div className="sup-dash">
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
            Alla inrapporterade ({bugs?.length ?? 0})
          </button>
        </div>

        <input
          className="sup-input sup-dash__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök på rubrik, id, kund eller rapportör"
          aria-label="Sök"
        />

        <button type="button" className="wi-btn" onClick={() => setReloadToken((t) => t + 1)}>
          Uppdatera
        </button>
      </div>

      <div className="sup-stagebar">
        {FLOW_STAGES.map((stage) => {
          const active = stageFilter.has(stage.key);
          return (
            <button
              key={stage.key}
              type="button"
              className={`sup-stagecard sup-stagecard--${stage.key}` + (active ? " sup-stagecard--active" : "")}
              onClick={() =>
                setStageFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(stage.key)) next.delete(stage.key);
                  else next.add(stage.key);
                  return next;
                })
              }
              title={stage.hint}
            >
              <span className="sup-stagecard__count">{counts.get(stage.key) ?? 0}</span>
              <span className="sup-stagecard__label">{stage.label}</span>
            </button>
          );
        })}
      </div>

      {scope === "mine" && !me && (
        <p className="sup-dash__empty">
          Vi vet inte vem du är än – fyll i ditt namn när du rapporterar ett ärende, så samlas dina ärenden här.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="sup-dash__empty">Inga ärenden matchar urvalet.</p>
      ) : (
        <ul className="sup-list">
          {visible.map((bug) => (
            <li key={bug.id}>
              <button type="button" className="sup-row" onClick={() => setOpenId(bug.id)}>
                <div className="sup-row__head">
                  <span className="sup-row__id">#{bug.id}</span>
                  <span className="sup-row__title">{bug.title}</span>
                  <span className={`sup-sev sup-sev--${severityKey(bug.severity)}`}>{shortSeverity(bug.severity)}</span>
                </div>

                <div className="sup-row__meta">
                  <span>{shortAreaPath(bug.areaPath)}</span>
                  <span>·</span>
                  <span>Rapporterad {formatDate(bug.createdDate)}</span>
                  {bug.assignedTo && (
                    <>
                      <span>·</span>
                      <span>{bug.assignedTo}</span>
                    </>
                  )}
                  {scope === "all" && bug.reporter && (
                    <>
                      <span>·</span>
                      <span>av {bug.reporter}</span>
                    </>
                  )}
                </div>

                <FlowTrack bug={bug} />
              </button>
            </li>
          ))}
        </ul>
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

/** The five flow steps with everything up to the bug's current one filled in. */
function FlowTrack({ bug }: { bug: SupportBug }) {
  const age = daysSince(bug.changedDate ?? bug.createdDate);
  return (
    <div className="sup-track">
      {FLOW_STAGES.map((stage, index) => (
        <span
          key={stage.key}
          className={
            "sup-track__step" +
            (index < bug.stageStep ? " sup-track__step--done" : "") +
            (index === bug.stageStep ? ` sup-track__step--current sup-track__step--${bug.stageKey}` : "")
          }
        >
          <span className="sup-track__label">{stage.label}</span>
        </span>
      ))}
      <span className="sup-track__age">{age === null ? "" : age === 0 ? "ändrad idag" : `${age} d sedan ändring`}</span>
    </div>
  );
}

/** "1 - Critical (< 8 h )" → "1", for the severity pill's colour. */
function severityKey(severity: string | null): string {
  const match = /^\s*([1-4])/.exec(severity ?? "");
  return match ? match[1] : "none";
}
