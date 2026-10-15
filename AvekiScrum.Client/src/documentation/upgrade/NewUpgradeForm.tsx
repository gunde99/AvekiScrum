import { useEffect, useMemo, useState } from "react";
import { createUpgradeCheckout, fetchUpgradeStructure, type UpgradeCheckoutDetail, type UpgradeStructure } from "../../api/upgrade";
import { loadReporter, reporterIsFromSignIn, saveReporter } from "../../support/reporter";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { DEMO_CUSTOMERS } from "./demoCustomers";

// Per-browser memory of each customer's module choice (spec F5), so next release's upgrade of the
// same customer starts pre-ticked. A convenience only - nothing depends on it.
const MODULES_KEY = "aveki.upgrade.modules";

function loadRemembered(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(MODULES_KEY) ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

function remember(customer: string, modules: string[]) {
  try {
    const all = loadRemembered();
    all[customer.trim().toLowerCase()] = modules;
    localStorage.setItem(MODULES_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked - the form just starts empty next time */
  }
}

interface ModuleOption {
  title: string;
  appliesTo: string;
  always: boolean;
  /** Which of the selected releases have a page for it - not every module changes every release. */
  releases: string[];
}

interface NewUpgradeFormProps {
  onCreated: (detail: UpgradeCheckoutDetail) => void;
  onCancel: () => void;
}

/**
 * "Ny uppgradering": customer, release(s) and modules. Everything listed comes from the wiki's own
 * page tree - a new release or module shows up here as soon as its page exists, no deploy.
 */
export function NewUpgradeForm({ onCreated, onCancel }: NewUpgradeFormProps) {
  const [structure, setStructure] = useState<UpgradeStructure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState("");
  const [actor, setActor] = useState(loadReporter());
  const [product, setProduct] = useState("");
  const [releases, setReleases] = useState<string[]>([]);
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const remembered = useMemo(loadRemembered, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchUpgradeStructure(controller.signal)
      .then((s) => {
        setStructure(s);
        const first = s.products[0];
        if (first) {
          setProduct(first.name);
          const newest = first.releases[first.releases.length - 1];
          if (newest) setReleases([newest.name]);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);

  const productInfo = structure?.products.find((p) => p.name === product);

  const options = useMemo<ModuleOption[]>(() => {
    const byTitle = new Map<string, ModuleOption>();
    for (const release of productInfo?.releases ?? []) {
      if (!releases.includes(release.name)) continue;
      for (const page of release.pages) {
        const existing = byTitle.get(page.title);
        if (existing) existing.releases.push(release.name);
        else byTitle.set(page.title, { title: page.title, appliesTo: page.appliesTo, always: page.always, releases: [release.name] });
      }
    }
    return [...byTitle.values()];
  }, [productInfo, releases]);

  // DEMO: kunden väljs ur en hårdkodad lista och kryssar i sina moduler (se demoCustomers.ts).
  // Saknas kunden i demolistan används det som kundens senaste uppgradering hade.
  function onCustomerChange(value: string) {
    setCustomer(value);
    const demo = DEMO_CUSTOMERS.find((c) => c.name === value);
    const known = demo?.modules ?? remembered[value.trim().toLowerCase()];
    setModules(new Set(known ?? []));
  }

  function toggleRelease(name: string) {
    setReleases((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));
  }

  function toggleModule(title: string) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const optional = options.filter((o) => !o.always);
  const pickedOptional = optional.filter((o) => modules.has(o.title)).map((o) => o.title);
  const canCreate = customer.trim().length > 0 && releases.length > 0 && (reporterIsFromSignIn() || actor.trim().length > 0) && !creating;

  async function create() {
    setCreating(true);
    setError(null);
    try {
      if (!reporterIsFromSignIn()) saveReporter(actor);
      const detail = await createUpgradeCheckout({ customer: customer.trim(), product, releases, modules: pickedOptional });
      remember(customer, pickedOptional);
      onCreated(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  }

  return (
    <div className="sup-form upg-new">
      {creating && <LoadingOverlay message="Checkar ut från wikin…" sub="Skapar en egen arbetskopia av de valda sidorna" />}
      <div className="sup-card">
        <div className="sup-card__title">Ny uppgradering</div>
        <p className="sup-card__hint">
          Välj kund, release och kundens moduler. Du får en egen arbetskopia av wikisidorna – det du rättar under uppgraderingen kan
          föras tillbaka till wikin när du är klar. Dokumenten är gemensamma för alla kunder: kundspecifika uppgifter (servernamn och
          liknande) skrivs i kundens eget dokument.
        </p>

        {!structure && !error && <p className="sup-dash__empty">Läser wikins releaser och moduler…</p>}
        {error && <p className="sup-error">{error}</p>}

        {structure && (
          <div className="upg-new__grid">
            <label className="sup-field">
              <span className="sup-label">Kund</span>
              <select className="sup-input" value={customer} onChange={(e) => onCustomerChange(e.target.value)} autoFocus>
                <option value="" disabled>
                  Välj kund …
                </option>
                {DEMO_CUSTOMERS.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            {!reporterIsFromSignIn() && (
              <label className="sup-field">
                <span className="sup-label">Ditt namn</span>
                <input className="sup-input" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Står i wikins historik" />
              </label>
            )}

            {structure.products.length > 1 && (
              <label className="sup-field">
                <span className="sup-label">Produkt</span>
                <select className="sup-input" value={product} onChange={(e) => { setProduct(e.target.value); setReleases([]); }}>
                  {structure.products.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="sup-field sup-field--wide">
              <span className="sup-label">Release{productInfo && productInfo.releases.length > 1 ? " – hoppar kunden över releaser, kryssa i alla, äldst görs först" : ""}</span>
              <div className="upg-chips">
                {productInfo?.releases.map((r) => (
                  <label key={r.name} className={"upg-chip" + (releases.includes(r.name) ? " upg-chip--on" : "")}>
                    <input type="checkbox" checked={releases.includes(r.name)} onChange={() => toggleRelease(r.name)} />
                    {product} {r.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="sup-field sup-field--wide">
              <span className="sup-label">Delar och moduler</span>
              {options.length === 0 ? (
                <p className="sup-dash__empty">Välj minst en release.</p>
              ) : (
                <ul className="upg-modules">
                  {options.map((o) => (
                    <li key={o.title} className={"upg-module" + (o.always ? " upg-module--always" : "")}>
                      <label>
                        <input
                          type="checkbox"
                          checked={o.always || modules.has(o.title)}
                          disabled={o.always}
                          onChange={() => toggleModule(o.title)}
                        />
                        <span className="upg-module__title">{o.title}</span>
                        <span className="upg-module__applies">{o.always ? "Alla kunder – alltid med" : o.appliesTo}</span>
                        {releases.length > 1 && o.releases.length < releases.length && (
                          <span className="upg-module__rel">bara {o.releases.join(", ")}</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="sup-actions">
          <button type="button" className="daily-flow__btn" onClick={onCancel}>
            Avbryt
          </button>
          <button type="button" className="daily-flow__btn daily-flow__btn--primary" disabled={!canCreate} onClick={() => void create()}>
            Skapa uppgraderingsdokument
          </button>
        </div>
      </div>
    </div>
  );
}
