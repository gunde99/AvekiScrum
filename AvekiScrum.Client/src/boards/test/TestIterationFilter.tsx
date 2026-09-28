import { useEffect, useRef, useState } from "react";
import { fetchSprints, type DeveloperTeamId, type SprintOption } from "../../api/dailys";
import { FloatingPopover } from "../dailys/FloatingPopover";
import "./TestIterationFilter.css";

interface TestIterationFilterProps {
  team: DeveloperTeamId;
  /** The iteration already shown as "the" sprint - left out of the candidate list, since it's on
   *  screen regardless of anything picked here. */
  currentPath: string;
  selectedPaths: Set<string>;
  onToggle: (option: SprintOption) => void;
  /** Paths currently being fetched - shown as a spinner on their own row instead of disabling the
   *  whole popover, so picking a second sprint doesn't have to wait for the first to land. */
  loadingPaths: Set<string>;
  includeClosed: boolean;
  onToggleIncludeClosed: () => void;
}

/**
 * "Include older test-tasks": lets the test board fold in one or more additional sprints besides
 * the one it's already showing, so a test task left lingering in a sprint nobody looks at anymore
 * doesn't quietly stay forgotten. Deliberately its own control rather than a second SprintPicker -
 * that one *replaces* which sprint is on screen, this one *adds* to it.
 */
export function TestIterationFilter({
  team,
  currentPath,
  selectedPaths,
  onToggle,
  loadingPaths,
  includeClosed,
  onToggleIncludeClosed,
}: TestIterationFilterProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SprintOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchSprints(team, currentPath, controller.signal)
      .then((result) => {
        setOptions(result.filter((o) => o.path !== currentPath));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [open, team, currentPath]);

  let lastFolder: string | null = null;

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={"test-iter-filter__trigger" + (selectedPaths.size > 0 ? " test-iter-filter__trigger--active" : "")}
        onClick={() => setOpen((o) => !o)}
        title="Ta med test-tasks från fler sprintar än den som visas"
      >
        {selectedPaths.size > 0 ? `Äldre sprintar (${selectedPaths.size})` : "+ Äldre sprintar"}
        <span className="test-iter-filter__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <FloatingPopover anchorRef={buttonRef} onClose={() => setOpen(false)} className="test-iter-filter__pop">
          <div className="test-iter-filter__head">Inkludera fler sprintar</div>
          {loading && <p className="test-iter-filter__status">Hämtar…</p>}
          {error && <p className="test-iter-filter__status test-iter-filter__status--error">Fel: {error}</p>}
          {!loading && !error && options.length === 0 && <p className="test-iter-filter__status">Inga fler sprintar hittades.</p>}
          {!loading && !error && options.length > 0 && (
            <ul className="test-iter-filter__list">
              {options.map((option) => {
                const showHeading = option.releaseFolder !== lastFolder;
                lastFolder = option.releaseFolder;
                const checked = selectedPaths.has(option.path);
                const busy = loadingPaths.has(option.path);
                return (
                  <li key={option.path}>
                    {showHeading && <div className="test-iter-filter__heading">Release {releaseLabel(option.releaseFolder)}</div>}
                    <label className="test-iter-filter__option">
                      <input type="checkbox" checked={checked} disabled={busy} onChange={() => onToggle(option)} />
                      <span className="test-iter-filter__option-name">
                        {option.name}
                        {option.isCurrent && <span className="test-iter-filter__badge">Nu</span>}
                      </span>
                      <span className="test-iter-filter__option-dates">
                        {busy ? "Hämtar…" : `${option.startDate} – ${option.endDate}`}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <label className="test-iter-filter__closed">
            <input type="checkbox" checked={includeClosed} onChange={onToggleIncludeClosed} disabled={selectedPaths.size === 0} />
            Visa även stängda kort från de äldre sprintarna
          </label>
        </FloatingPopover>
      )}
    </>
  );
}

/** The short name of a release folder ("Utveckling\27.1" -> "27.1") - all a heading needs to say. */
function releaseLabel(folder: string): string {
  const parts = folder.split("\\");
  return parts[parts.length - 1] || folder;
}
