
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import {
  completeRun, createRun, getCases, getExecutionCase, getPlans, getPoints, getRun, getResults, getSuiteCases, getSuites, updateResults,
  type ExecutionCase, type ExecutionStep, type SuiteCase, type TestCase, type TestPlan, type TestPoint, type TestResult, type TestSuite,
} from "../api/testPlans";
import "./TestingApp.css";

interface TestingAppProps { onHome: () => void }
interface SuiteRow { suite: TestSuite; depth: number }
interface CaseRow { point?: TestPoint; membership: SuiteCase; detail?: TestCase }
type Outcome = "Passed" | "Failed" | "Blocked" | "NotApplicable";
const OUTCOMES: { value: Outcome; label: string; symbol: string }[] = [
  { value: "Passed", label: "Godkänd", symbol: "✓" },
  { value: "Failed", label: "Underkänd", symbol: "×" },
  { value: "Blocked", label: "Blockerad", symbol: "!" },
  { value: "NotApplicable", label: "Ej tillämplig", symbol: "–" },
];
const flattenSuites = (items: TestSuite[], depth = 0): SuiteRow[] =>
  items.flatMap((suite) => [{ suite, depth }, ...flattenSuites(suite.children ?? [], depth + 1)]);
function releaseName(plan: TestPlan): string {
  const fromName = plan.name.match(/\b(20\d{2}\.\d+)\b/)?.[1];
  if (fromName) return fromName;
  const fromIteration = plan.iteration.match(/\\v?(\d{2}\.\d+)(?:\\|$)/i)?.[1];
  return fromIteration ? `20${fromIteration}` : "Testbibliotek";
}
const releaseOrder = (value: string) => value === "Testbibliotek" ? -1 : Number(value.replace(".", ""));
const normalOutcome = (value?: string) => (!value || /not run|unspecified|none|notexecuted/i.test(value)) ? "Ej körd" : value;
const outcomeClass = (value?: string) => {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "passed") return "passed";
  if (normalized === "failed") return "failed";
  if (normalized === "blocked") return "blocked";
  return "neutral";
};

function SafeTestHtml({ html }: { html: string }) {
  const safe = useMemo(() => {
    const input = new DOMParser().parseFromString(html || "", "text/html");
    const output = document.implementation.createHTMLDocument("");
    const allowed = new Set(["P", "BR", "UL", "OL", "LI", "STRONG", "EM", "B", "I", "U", "CODE", "PRE", "SPAN", "DIV", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "A"]);
    const copy = (node: Node): Node | null => {
      if (node.nodeType === Node.TEXT_NODE) return output.createTextNode(node.textContent ?? "");
      if (!(node instanceof HTMLElement) || !allowed.has(node.tagName)) return output.createTextNode(node.textContent ?? "");
      const element = output.createElement(node.tagName.toLowerCase());
      if (node.tagName === "A") {
        const href = node.getAttribute("href");
        if (href && /^https?:\/\//i.test(href)) {
          element.setAttribute("href", href);
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noreferrer");
        }
      }
      for (const child of Array.from(node.childNodes)) {
        const copied = copy(child);
        if (copied) element.appendChild(copied);
      }
      return element;
    };
    for (const child of Array.from(input.body.childNodes)) {
      const copied = copy(child);
      if (copied) output.body.appendChild(copied);
    }
    return output.body.innerHTML;
  }, [html]);
  return <div className="test-html" dangerouslySetInnerHTML={{ __html: safe }} />;
}

function SuiteTree({ rows, selectedId, onSelect }: { rows: SuiteRow[]; selectedId?: number; onSelect: (suite: TestSuite) => void }) {
  return <div className="testing-suite-tree" role="tree" aria-label="Testsviter">
    {rows.map(({ suite, depth }) => <button type="button" role="treeitem" aria-selected={suite.id === selectedId}
      className={suite.id === selectedId ? "is-selected" : ""} style={{ paddingLeft: `${12 + depth * 16}px` }}
      key={suite.id} onClick={() => onSelect(suite)}>
      <span>{suite.hasChildren || suite.children?.length ? "▾" : "·"}</span>{suite.name}
    </button>)}
  </div>;
}

function Dashboard() {
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [planId, setPlanId] = useState<number>();
  const [release, setRelease] = useState("");
  const [suiteRows, setSuiteRows] = useState<SuiteRow[]>([]);
  const [suiteId, setSuiteId] = useState<number>();
  const [memberships, setMemberships] = useState<SuiteCase[]>([]);
  const [points, setPoints] = useState<TestPoint[]>([]);
  const [details, setDetails] = useState<TestCase[]>([]);
  const [preview, setPreview] = useState<ExecutionCase>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [priority, setPriority] = useState("12");
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getPlans(controller.signal).then((data) => {
      const active = data.filter((plan) => plan.state.toLowerCase() === "active");
      setPlans(active);
      const releases = [...new Set(active.map(releaseName))].sort((a, b) => releaseOrder(b) - releaseOrder(a));
      const first = releases[0] ?? "";
      setRelease(first);
      setPlanId(active.filter((plan) => releaseName(plan) === first).sort((a, b) => b.id - a.id)[0]?.id);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setBusy(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!planId) return;
    const controller = new AbortController();
    setBusy(true); setError(""); setSuiteRows([]); setSuiteId(undefined); setMemberships([]); setPoints([]); setDetails([]); setPreview(undefined);
    getSuites(planId, controller.signal).then((data) => {
      const rows = flattenSuites(data);
      setSuiteRows(rows);
      const firstLeaf = rows.find((row) => !(row.suite.children?.length || row.suite.hasChildren)) ?? rows.at(-1);
      setSuiteId(firstLeaf?.suite.id);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setBusy(false));
    return () => controller.abort();
  }, [planId]);

  useEffect(() => {
    if (!planId || !suiteId) return;
    const controller = new AbortController();
    setBusy(true); setError(""); setSelected(new Set()); setPreview(undefined);
    Promise.all([getSuiteCases(planId, suiteId, controller.signal), getPoints(planId, suiteId, controller.signal)])
      .then(async ([loadedCases, loadedPoints]) => {
        setMemberships(loadedCases);
        setPoints(loadedPoints);
        setDetails(await getCases(loadedCases.map((item) => item.id), controller.signal));
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [planId, suiteId]);

  const releases = useMemo(() => [...new Set(plans.map(releaseName))].sort((a, b) => releaseOrder(b) - releaseOrder(a)), [plans]);
  const releasePlans = plans.filter((plan) => releaseName(plan) === release);
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const selectedSuite = suiteRows.find((row) => row.suite.id === suiteId)?.suite;
  const detailById = new Map(details.map((item) => [item.id, item]));
  const membershipById = new Map(memberships.map((item) => [item.id, item]));
  const rows: CaseRow[] = points.map((point) => ({
    point,
    membership: membershipById.get(point.testCase.id) ?? { id: point.testCase.id, name: point.testCase.name, configurations: [], testers: [] },
    detail: detailById.get(point.testCase.id),
  }));
  for (const membership of memberships) if (!rows.some((row) => row.membership.id === membership.id)) rows.push({ membership, detail: detailById.get(membership.id) });
  const filtered = rows.filter((row) => {
    const itemPriority = row.detail?.priority ?? 2;
    return (priority === "all" || (priority === "1" ? itemPriority === 1 : itemPriority <= 2))
      && (outcome === "all" || (outcome === "notrun" ? normalOutcome(row.point?.outcome) === "Ej körd" : row.point?.outcome === outcome))
      && `${row.detail?.title ?? row.membership.name} ${row.point?.configuration.name ?? ""} ${row.point?.tester ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });
  const stats = {
    total: points.length,
    passed: points.filter((point) => outcomeClass(point.outcome) === "passed").length,
    failed: points.filter((point) => outcomeClass(point.outcome) === "failed").length,
    notrun: points.filter((point) => normalOutcome(point.outcome) === "Ej körd").length,
  };
  const runnerUrl = `?app=testing&mode=runner&planId=${planId}&suiteId=${suiteId}&pointIds=${[...selected].join(",")}`;
  const chooseRelease = (value: string) => {
    setRelease(value);
    setPlanId(plans.filter((plan) => releaseName(plan) === value).sort((a, b) => b.id - a.id)[0]?.id);
  };
  const openPreview = (caseId: number) => {
    setPreview(undefined); setError("");
    getExecutionCase(caseId).then(setPreview).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  };
  const togglePoint = (id: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div className="testing-dashboard">
    <section className="testing-release-bar">
      <label>Release<select value={release} onChange={(event) => chooseRelease(event.target.value)}>{releases.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Testplan<select value={planId ?? ""} onChange={(event) => setPlanId(Number(event.target.value))}>{releasePlans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select></label>
      <div className="testing-release-meta"><span>{selectedPlan?.iteration || "Ingen iteration"}</span><strong>{selectedPlan?.state}</strong></div>
    </section>
    {error && <div className="testing-error" role="alert">{error}</div>}
    <div className="testing-stats" aria-label="Resultatöversikt">
      <div><strong>{stats.total}</strong><span>testpunkter</span></div>
      <div className="passed"><strong>{stats.passed}</strong><span>godkända</span></div>
      <div className="failed"><strong>{stats.failed}</strong><span>underkända</span></div>
      <div><strong>{stats.notrun}</strong><span>ej körda</span></div>
    </div>
    <div className="testing-layout">
      <aside className="testing-panel testing-suites"><h2>Område</h2><SuiteTree rows={suiteRows} selectedId={suiteId} onSelect={(suite) => setSuiteId(suite.id)} /></aside>
      <section className="testing-panel testing-cases">
        <div className="testing-cases-head"><div><span className="testing-eyebrow">Testsvit</span><h2>{selectedSuite?.name ?? "Välj en svit"}</h2></div>
          <a className={`testing-run-button ${selected.size ? "" : "is-disabled"}`} href={selected.size ? runnerUrl : undefined} target="_blank" rel="noreferrer" aria-disabled={!selected.size}>Kör valda ({selected.size}) ↗</a>
        </div>
        <div className="testing-filters">
          <input aria-label="Sök testfall" placeholder="Sök testfall, konfiguration eller testare…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label="Prioritet" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="12">Prioritet 1–2</option><option value="1">Bara prioritet 1</option><option value="all">Alla prioriteter</option></select>
          <select aria-label="Resultat" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="all">Alla resultat</option><option value="notrun">Ej körda</option><option value="Passed">Godkända</option><option value="Failed">Underkända</option><option value="Blocked">Blockerade</option></select>
        </div>
        {busy ? <div className="testing-empty">Hämtar från Azure DevOps…</div> : filtered.length === 0 ? <div className="testing-empty">Inga testfall matchar urvalet.</div> :
          <div className="testing-table" role="table">
            <div className="testing-row testing-row--head" role="row"><span></span><span>Testfall</span><span>Prio</span><span>Konfiguration</span><span>Resultat</span><span>Testare</span></div>
            {filtered.map((row, index) => <div className="testing-row" role="row" key={`${row.membership.id}-${row.point?.id ?? index}`}>
              <span><input type="checkbox" aria-label={`Välj ${row.membership.name}`} disabled={!row.point} checked={!!row.point && selected.has(row.point.id)} onChange={() => row.point && togglePoint(row.point.id)} /></span>
              <button type="button" className="testing-case-link" onClick={() => openPreview(row.membership.id)}><small>#{row.membership.id}</small>{row.detail?.title ?? row.membership.name}</button>
              <span className={`testing-priority p${row.detail?.priority ?? 2}`}>P{row.detail?.priority ?? 2}</span>
              <span>{row.point?.configuration.name || "Saknar konfiguration"}</span>
              <span><i className={`testing-outcome ${outcomeClass(row.point?.outcome)}`}></i>{normalOutcome(row.point?.outcome)}</span>
              <span>{row.point?.tester || "Ej tilldelad"}</span>
            </div>)}
          </div>}
      </section>
      {preview && <aside className="testing-panel testing-preview">
        <div className="testing-preview-head"><div><span className="testing-eyebrow">Testfall #{preview.testCase.id}</span><h2>{preview.testCase.title}</h2></div><button type="button" onClick={() => setPreview(undefined)}>×</button></div>
        <div className="testing-preview-meta"><span>P{preview.testCase.priority}</span><span>{preview.testCase.state}</span><span>{preview.testCase.assignedTo || "Ej tilldelad"}</span></div>
        {preview.warning && <div className="testing-warning">{preview.warning}</div>}
        {preview.steps.map((step, index) => <div className="testing-step-preview" key={step.actionPath}><b>{index + 1}</b><div>{step.sharedStepTitle && <small>{step.sharedStepTitle}</small>}<SafeTestHtml html={step.actionHtml} /><span>Förväntat</span><SafeTestHtml html={step.expectedHtml} /></div></div>)}
        {!preview.steps.length && <p>Testfallet saknar körbara steg.</p>}
        {preview.testCase.webUrl && <a href={preview.testCase.webUrl} target="_blank" rel="noreferrer">Öppna testfallet i Azure DevOps ↗</a>}
      </aside>}
    </div>
  </div>;
}

interface Draft { outcome: Outcome | ""; comment: string; steps: Record<string, { outcome: Outcome | ""; comment: string }> }

function TestRunner({ onHome }: TestingAppProps) {
  const params = new URLSearchParams(window.location.search);
  const initialRun = Number(params.get("runId")) || undefined;
  const planId = Number(params.get("planId")) || undefined;
  const suiteId = Number(params.get("suiteId")) || undefined;
  const pointIds = (params.get("pointIds") ?? "").split(",").map(Number).filter(Boolean);
  const [runId, setRunId] = useState(initialRun);
  const [planName, setPlanName] = useState("");
  const [points, setPoints] = useState<TestPoint[]>([]);
  const [cases, setCases] = useState<Map<number, ExecutionCase>>(new Map());
  const [results, setResults] = useState<TestResult[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [runIsComplete, setRunIsComplete] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const loadExecutions = async (items: Array<{ testCaseId?: number; testCaseRevision?: number }>) => {
    const unique = [...new Map(items.filter((item) => item.testCaseId).map((item) => [item.testCaseId, item])).values()];
    const loaded = await Promise.all(unique.map((item) => getExecutionCase(item.testCaseId!, item.testCaseRevision)));
    setCases(new Map(loaded.map((item) => [item.testCase.id, item])));
  };
  const loadRun = async (id: number) => {
    const [run, loaded] = await Promise.all([getRun(id), getResults(id)]);
    setRunIsComplete(run.state.toLowerCase() === "completed");
    setResults(loaded);
    setSaved(new Set(loaded.filter((item) => item.state.toLowerCase() === "completed").map((item) => item.id)));
    setDrafts(Object.fromEntries(loaded.map((result) => [result.id, {
      outcome: (OUTCOMES.some((item) => item.value === result.outcome) ? result.outcome : "") as Outcome | "",
      comment: result.comment ?? "",
      steps: Object.fromEntries((result.actionResults ?? []).map((step) => [step.actionPath, { outcome: step.outcome as Outcome, comment: step.comment ?? "" }])),
    }])));
    await loadExecutions(loaded);
  };

  // Query parameters identify one immutable runner session; navigation opens a new window.
  /* oxlint-disable react-hooks/exhaustive-deps -- runnerns URL är oföränderlig i det separata fönstret. */
  useEffect(() => {
    const boot = async () => {
      const loadedPlans = await getPlans();
      setPlanName(loadedPlans.find((plan) => plan.id === planId)?.name ?? (runId ? `Körning #${runId}` : "Testkörning"));
      if (runId) { await loadRun(runId); return; }
      if (!planId || !suiteId || !pointIds.length) throw new Error("Körningen saknar testplan, testsvit eller valda testpunkter.");
      const allPoints = await getPoints(planId, suiteId);
      const chosen = allPoints.filter((point) => pointIds.includes(point.id));
      if (!chosen.length) throw new Error("De valda testpunkterna finns inte längre i sviten.");
      setPoints(chosen);
      await loadExecutions(chosen.map((point) => ({ testCaseId: point.testCase.id })));
    };
    boot().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setBusy(false));
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const start = async () => {
    if (!planId) return;
    setBusy(true); setError("");
    try {
      const run = await createRun({ name: `${planName} – ${new Date().toLocaleDateString("sv-SE")}`, planId, pointIds });
      setRunId(run.id);
      const url = new URL(window.location.href);
      url.search = `?app=testing&mode=runner&runId=${run.id}&planId=${planId}&suiteId=${suiteId}`;
      history.replaceState({}, "", url);
      await loadRun(run.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const result = results[current];
  const point = points.find((item) => item.id === result?.testPointId) ?? (result ? { id: result.testPointId ?? 0, testCase: { id: result.testCaseId ?? 0, name: "" }, configuration: { id: 0, name: "" }, outcome: result.outcome, state: result.state } : undefined);
  const execution = cases.get(result?.testCaseId ?? point?.testCase.id ?? 0);
  const draft = result ? drafts[result.id] : undefined;
  const updateDraft = (change: Partial<Draft>) => result && setDrafts((all) => ({ ...all, [result.id]: { ...all[result.id], ...change } }));
  const setStep = (step: ExecutionStep, change: Partial<{ outcome: Outcome | ""; comment: string }>) => {
    if (!result || !draft) return;
    const steps = { ...draft.steps, [step.actionPath]: { ...(draft.steps[step.actionPath] ?? { outcome: "", comment: "" }), ...change } };
    const values = execution?.steps.map((item) => steps[item.actionPath]?.outcome) ?? [];
    const outcome = values.length > 0 && values.every(Boolean)
      ? values.includes("Failed") ? "Failed"
        : values.includes("Blocked") ? "Blocked"
          : values.every((value) => value === "NotApplicable") ? "NotApplicable" : "Passed"
      : draft.outcome;
    updateDraft({ steps, outcome });
  };
  const save = async () => {
    if (!runId || !result || !draft || !execution || runIsComplete) return;
    const missing = execution.steps.some((step) => !draft.steps[step.actionPath]?.outcome);
    if (!draft.outcome || missing) { setError("Välj resultat för testfallet och för varje teststeg."); return; }
    setBusy(true); setError("");
    try {
      await updateResults(runId, [{
        id: result.id, outcome: draft.outcome, state: "Completed", comment: draft.comment,
        actionResults: execution.steps.map((step) => ({ actionPath: step.actionPath, stepIdentifier: step.stepIdentifier, outcome: draft.steps[step.actionPath].outcome, comment: draft.steps[step.actionPath].comment })),
      }]);
      setSaved((currentSaved) => new Set(currentSaved).add(result.id));
      if (current < results.length - 1) setCurrent(current + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    if (!runId) return;
    setBusy(true); setError("");
    try { await completeRun(runId); setCompleted(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const content = busy ? <div className="testing-run-empty">Hämtar testkörningen…</div>
    : error && !result && !points.length ? <div className="testing-error">{error}</div>
    : completed ? <div className="testing-complete"><span>✓</span><h2>Testkörningen är klar</h2><p>{saved.size} resultat har sparats i Azure DevOps.</p><button type="button" onClick={() => window.close()}>Stäng fönstret</button></div>
    : !runId ? <div className="testing-run-start"><h2>{points.length} testpunkter är redo</h2><p>En testkörning skapas i Azure DevOps. Resultatet sparas per testfall och per steg.</p>{[...cases.values()].some((item) => item.warning) && <div className="testing-warning">Några testfall använder parametrar eller ovanlig stegstruktur. Kontrollera varningen i respektive testfall.</div>}<button type="button" onClick={start}>Starta testkörningen</button></div>
    : result && execution && draft ? <div className="testing-runner">
      <aside className="testing-run-progress"><strong>{saved.size}/{results.length} sparade</strong>{results.map((item, index) => <button type="button" className={`${index === current ? "is-current" : ""} ${saved.has(item.id) ? "is-saved" : ""}`} key={item.id} onClick={() => setCurrent(index)}><span>{saved.has(item.id) ? "✓" : index + 1}</span>{cases.get(item.testCaseId ?? 0)?.testCase.title ?? `Testfall #${item.testCaseId}`}</button>)}</aside>
      <section className="testing-run-case">
        <div className="testing-run-title"><div><span className="testing-eyebrow">Testfall {current + 1} av {results.length} · #{execution.testCase.id}</span><h2>{execution.testCase.title}</h2><p>{point?.configuration.name || "Standardkonfiguration"}</p></div>{execution.testCase.webUrl && <a href={execution.testCase.webUrl} target="_blank" rel="noreferrer">Azure DevOps ↗</a>}</div>
        {error && <div className="testing-error">{error}</div>}
        {runIsComplete && <div className="testing-readonly">Körningen är slutförd och visas skrivskyddat.</div>}
        {execution.warning && <div className="testing-warning">{execution.warning}</div>}
        {execution.steps.map((step, index) => <article className="testing-run-step" key={step.actionPath}>
          <div className="testing-step-number">{index + 1}</div>
          <div className="testing-step-content">{step.sharedStepTitle && <small>{step.sharedStepTitle}</small>}<SafeTestHtml html={step.actionHtml} /><div className="testing-expected"><b>Förväntat resultat</b><SafeTestHtml html={step.expectedHtml} /></div>
            <div className="testing-outcome-buttons">{OUTCOMES.map((choice) => <button type="button" className={draft.steps[step.actionPath]?.outcome === choice.value ? `is-${outcomeClass(choice.value)}` : ""} key={choice.value} disabled={runIsComplete} onClick={() => setStep(step, { outcome: choice.value })}><span>{choice.symbol}</span>{choice.label}</button>)}</div>
            <input disabled={runIsComplete} placeholder="Kommentar till steget (valfritt)" value={draft.steps[step.actionPath]?.comment ?? ""} onChange={(event) => setStep(step, { comment: event.target.value })} />
          </div>
        </article>)}
        <div className="testing-run-verdict"><label>Testfallets resultat<select disabled={runIsComplete} value={draft.outcome} onChange={(event) => updateDraft({ outcome: event.target.value as Outcome | "" })}><option value="">Välj resultat…</option>{OUTCOMES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label><label>Sammanfattande kommentar<textarea disabled={runIsComplete} value={draft.comment} onChange={(event) => updateDraft({ comment: event.target.value })} /></label></div>
        {!runIsComplete && <div className="testing-run-actions"><button type="button" onClick={save} disabled={busy}>Spara resultat {current < results.length - 1 ? "och fortsätt" : ""}</button>{saved.size === results.length && <button type="button" className="finish" onClick={finish}>Slutför körningen</button>}</div>}
      </section>
    </div> : <div className="testing-run-empty">Azure DevOps returnerade inga resultat för körningen.</div>;

  return <AppShell brandPrefix="Aveki" brandSuffix="Test" nav={[{ id: "runner", label: runId ? `Körning #${runId}` : "Ny körning" }]} activeId="runner" onHome={onHome} title="Kör manuella tester" subtitle={planName}>{content}</AppShell>;
}

export function TestingApp({ onHome }: TestingAppProps) {
  const runner = new URLSearchParams(window.location.search).get("mode") === "runner";
  return runner ? <TestRunner onHome={onHome} /> : <AppShell brandPrefix="Aveki" brandSuffix="Test" nav={[{ id: "overview", label: "Releaseöversikt" }]} activeId="overview" onHome={onHome} title="Releaseöversikt" subtitle="Prioriterade testfall, konfigurationer och testresultat direkt från Azure DevOps."><Dashboard /></AppShell>;
}

