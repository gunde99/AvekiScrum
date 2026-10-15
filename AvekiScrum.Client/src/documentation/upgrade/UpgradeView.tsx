import { useEffect, useMemo, useState } from "react";
import { fetchUpgradeCheckouts, type UpgradeCheckoutDetail, type UpgradeCheckoutSummary } from "../../api/upgrade";
import { loadReporter } from "../../support/reporter";
import { samePerson } from "../../lib/personNames";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { NewUpgradeForm } from "./NewUpgradeForm";
import { UpgradeEditor } from "./UpgradeEditor";
import { STATUS_LABEL, formatDateTime } from "./upgradeLabels";
import "../../support/SupportViews.css";
import "./Upgrade.css";

type Scope = "mine" | "ongoing" | "all";
type Screen = { kind: "list" } | { kind: "new" } | { kind: "open"; id: string; initial?: UpgradeCheckoutDetail };

/**
 * AvekiDokumentation → Uppgradering: list of upgrades, "Ny uppgradering", and the document itself.
 * Everything behind it is git on the wiki repo, run by the Api - see UpgradeDocumentationService.
 */
export function UpgradeView() {
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [checkouts, setCheckouts] = useState<UpgradeCheckoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const me = loadReporter();
  const [scope, setScope] = useState<Scope>(me ? "mine" : "ongoing");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (screen.kind !== "list") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchUpgradeCheckouts(controller.signal)
      .then((list) => setCheckouts(list))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [screen.kind, reloadToken]);

  const isOngoing = (c: UpgradeCheckoutSummary) => c.status === "Active" || c.status === "Conflict";
  const mine = useMemo(() => checkouts.filter((c) => me && samePerson(c.createdByName, me)), [checkouts, me]);
  const ongoing = useMemo(() => checkouts.filter(isOngoing), [checkouts]);
  const visible = scope === "mine" ? mine : scope === "ongoing" ? ongoing : checkouts;

  if (screen.kind === "new") {
    return (
      <NewUpgradeForm
        onCancel={() => setScreen({ kind: "list" })}
        onCreated={(detail) => setScreen({ kind: "open", id: detail.summary.id, initial: detail })}
      />
    );
  }

  if (screen.kind === "open") {
    return <UpgradeEditor checkoutId={screen.id} initial={screen.initial} onBack={() => setScreen({ kind: "list" })} />;
  }

  return (
    <div className="sup-dash doc-list">
      {loading && <LoadingOverlay message="Hämtar uppgraderingar…" />}

      <div className="sup-dash__toolbar">
        <div className="sup-dash__group" role="group" aria-label="Urval">
          {me && (
            <button type="button" className={"sup-tab" + (scope === "mine" ? " sup-tab--active" : "")} onClick={() => setScope("mine")}>
              Mina ({mine.length})
            </button>
          )}
          <button type="button" className={"sup-tab" + (scope === "ongoing" ? " sup-tab--active" : "")} onClick={() => setScope("ongoing")}>
            Pågående ({ongoing.length})
          </button>
          <button type="button" className={"sup-tab" + (scope === "all" ? " sup-tab--active" : "")} onClick={() => setScope("all")}>
            Alla ({checkouts.length})
          </button>
        </div>
        <div className="upg-toolbar-right">
          <button type="button" className="sup-refresh" onClick={() => setReloadToken((t) => t + 1)}>
            Refresh
          </button>
          <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={() => setScreen({ kind: "new" })}>
            + Ny uppgradering
          </button>
        </div>
      </div>

      {error && <p className="sup-error">Fel: {error}</p>}

      {!loading && visible.length === 0 ? (
        <p className="sup-dash__empty">
          Inga uppgraderingar här än. Tryck på <strong>+ Ny uppgradering</strong> för att ta fram ett uppgraderingsdokument för en kund.
        </p>
      ) : (
        <div className="sup-tablewrap">
          <table className="sup-table">
            <thead>
              <tr>
                <th>Kund</th>
                <th>Release</th>
                <th>Status</th>
                <th>Sidor</th>
                <th>Konsult</th>
                <th>Senast ändrad</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="sup-tr" onClick={() => setScreen({ kind: "open", id: c.id })} tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setScreen({ kind: "open", id: c.id })}>
                  <td><span className="sup-tr__title">{c.customer}</span></td>
                  <td>{c.product} {c.releases.join(" → ")}</td>
                  <td><span className={`upg-status upg-status--${c.status}`}>{STATUS_LABEL[c.status]}</span></td>
                  <td>{c.sectionCount}</td>
                  <td>{c.createdByName}</td>
                  <td>{formatDateTime(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
