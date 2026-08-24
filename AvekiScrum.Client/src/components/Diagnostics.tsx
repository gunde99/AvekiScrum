import { useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import { signInRequired } from "../auth/authConfig";
import { getIdentity, getIdentityError } from "../auth/identity";
import "./Diagnostics.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Runs the checks that answer "why doesn't it work" from inside the app.
 *
 * It has to live here rather than being a URL you can open: the interesting checks need the
 * signed-in user's token, and the browser's address bar sends none - which is exactly how the
 * deep health check came back 401 the first time it was tried.
 */
export function Diagnostics({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const checks: CheckResult[] = [];

    const identity = getIdentity();
    checks.push({
      name: "Inloggning i webbläsaren",
      ok: !signInRequired() || !!identity?.signedIn,
      detail: !signInRequired()
        ? "Servern kräver ingen inloggning (Auth:Mode = Pat), så ingen begärs."
        : identity?.signedIn
          ? `${identity.displayName} (${identity.email ?? "ingen e-post i token"})`
          : (getIdentityError() ?? "Ingen inloggad användare."),
    });

    for (const [name, url] of [
      ["Servern svarar", `${API_BASE_URL}/api/health`],
      ["Azure DevOps som dig", `${API_BASE_URL}/api/health/azure`],
    ] as const) {
      try {
        const response = await apiFetch(url);
        const text = await response.text();
        checks.push({
          name,
          // The deep check answers 200 even when a step failed, so the body decides, not the status.
          ok: response.ok && !text.includes("MISSLYCKADES"),
          detail: text.slice(0, 600),
        });
      } catch (error) {
        checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
      }
    }

    setResults(checks);
    setRunning(false);
  }

  return (
    <div className="diag">
      <div className="diag__head">
        <h2>Diagnostik</h2>
        <button type="button" onClick={onClose} title="Stäng">
          ✕
        </button>
      </div>

      <p className="diag__hint">
        Kontrollerar inloggning, servern och att din token räcker hela vägen in i Azure DevOps.
      </p>

      <button type="button" className="diag__run" onClick={() => void run()} disabled={running}>
        {running ? "Kör…" : "Kör kontrollerna"}
      </button>

      {results?.map((result) => (
        <div className={"diag__check" + (result.ok ? " diag__check--ok" : " diag__check--fail")} key={result.name}>
          <div className="diag__check-head">
            <span aria-hidden="true">{result.ok ? "✅" : "❌"}</span>
            <strong>{result.name}</strong>
          </div>
          <pre>{result.detail}</pre>
        </div>
      ))}
    </div>
  );
}
