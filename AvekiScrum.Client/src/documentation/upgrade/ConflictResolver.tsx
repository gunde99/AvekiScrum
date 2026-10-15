import { useMemo, useState } from "react";
import type { UpgradeConflict } from "../../api/upgrade";

interface ConflictResolverProps {
  conflicts: UpgradeConflict[];
  busy: boolean;
  onResolve: (resolutions: { conflictId: number; content: string }[]) => void;
}

type LineKind = "same" | "changed";

/** Marks the lines that differ from the checked-out text, so it's obvious *where* each side changed. */
function markLines(text: string, base: string): { text: string; kind: LineKind }[] {
  const baseLines = new Set(base.replace(/\r\n/g, "\n").split("\n"));
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => ({ text: line, kind: baseLines.has(line) ? "same" : "changed" }));
}

function MarkedText({ text, base }: { text: string; base: string }) {
  const lines = useMemo(() => markLines(text, base), [text, base]);
  return (
    <pre className="upg-conflict__text">
      {lines.map((l, i) => (
        <div key={i} className={l.kind === "changed" ? "upg-line--changed" : undefined}>
          {l.text || " "}
        </div>
      ))}
    </pre>
  );
}

/**
 * Shown when "Lämna in" found that someone changed the same place in the wiki after this checkout
 * was made. Per page: what the wiki says now and what the consultant wrote, changed lines
 * highlighted, and an editable result that starts as the consultant's version. Git does the rest -
 * the consultant never sees a merge marker.
 */
export function ConflictResolver({ conflicts, busy, onResolve }: ConflictResolverProps) {
  const [results, setResults] = useState<Record<number, string>>(() =>
    Object.fromEntries(conflicts.map((c) => [c.conflictId, c.mine])),
  );

  return (
    <section className="upg-conflicts" aria-label="Ändringar att slå ihop">
      <div className="upg-conflicts__intro">
        <strong>Någon har ändrat samma ställe i wikin sedan du checkade ut.</strong> Gå igenom sidorna nedan: jämför wikins text
        med din och skriv det som ska gälla i rutan <em>Resultat</em>. Ändrade rader är markerade. När du är klar förs resultatet in
        i wikin.
      </div>

      {conflicts.map((c) => (
        <article key={c.conflictId} className="upg-conflict">
          <h3 className="upg-conflict__title">
            {c.release} · {c.title}
          </h3>
          <div className="upg-conflict__cols">
            <div className="upg-conflict__col">
              <div className="upg-conflict__label">Wikin nu</div>
              <MarkedText text={c.wiki} base={c.base} />
              <button type="button" className="daily-flow__btn" onClick={() => setResults((r) => ({ ...r, [c.conflictId]: c.wiki }))}>
                Använd wikins
              </button>
            </div>
            <div className="upg-conflict__col">
              <div className="upg-conflict__label">Din version</div>
              <MarkedText text={c.mine} base={c.base} />
              <button type="button" className="daily-flow__btn" onClick={() => setResults((r) => ({ ...r, [c.conflictId]: c.mine }))}>
                Använd min
              </button>
            </div>
          </div>
          <div className="upg-conflict__label">Resultat – det här förs in i wikin</div>
          <textarea
            className="sup-input upg-editor__textarea upg-conflict__result"
            value={results[c.conflictId] ?? ""}
            onChange={(e) => setResults((r) => ({ ...r, [c.conflictId]: e.target.value }))}
            spellCheck={false}
          />
        </article>
      ))}

      <div className="sup-actions">
        <button
          type="button"
          className="daily-flow__btn daily-flow__btn--primary"
          disabled={busy}
          onClick={() => onResolve(conflicts.map((c) => ({ conflictId: c.conflictId, content: results[c.conflictId] ?? c.mine })))}
        >
          Slå ihop och för in i wikin
        </button>
      </div>
    </section>
  );
}
