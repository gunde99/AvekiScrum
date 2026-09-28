import { useEffect, useRef, useState } from "react";
import { fetchSprints, type DeveloperTeamId, type SprintOption } from "../../api/dailys";
import { FloatingPopover } from "./FloatingPopover";
import "./SprintPicker.css";

interface SprintPickerProps {
  team: DeveloperTeamId;
  sprint: string;
  sprintStart: string;
  sprintEnd: string;
  sprintPath: string;
  onSelect: (path: string) => void;
}

/** The short name of a release folder ("Utveckling\27.1" -> "27.1") - all a heading needs to say. */
function releaseLabel(folder: string): string {
  const parts = folder.split("\\");
  return parts[parts.length - 1] || folder;
}

/**
 * Makes the board's "sp1 · 2026-08-17 – 2026-09-04" line a sprint switcher. The list is a window
 * of three releases centered on whichever sprint is on screen - the one before, the one it's in,
 * and the one after - so paging repeatedly slides the window instead of always snapping back to
 * today's release. A release with no iterations created yet just doesn't contribute any rows,
 * rather than the window being padded out to a fixed count.
 */
export function SprintPicker({ team, sprint, sprintStart, sprintEnd, sprintPath, onSelect }: SprintPickerProps) {
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
    fetchSprints(team, sprintPath, controller.signal)
      .then((result) => {
        setOptions(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [open, team, sprintPath]);

  let lastFolder: string | null = null;

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className="sprint-picker__trigger"
        onClick={() => setOpen((o) => !o)}
        title="Byt sprint"
      >
        {sprint} · {sprintStart} – {sprintEnd}
        <span className="sprint-picker__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <FloatingPopover anchorRef={buttonRef} onClose={() => setOpen(false)} className="sprint-picker__pop">
          {loading && <p className="sprint-picker__status">Hämtar…</p>}
          {error && <p className="sprint-picker__status sprint-picker__status--error">Fel: {error}</p>}
          {!loading && !error && options.length === 0 && <p className="sprint-picker__status">Inga sprintar hittades.</p>}
          {!loading && !error && options.length > 0 && (
            <ul className="sprint-picker__list">
              {options.map((option) => {
                const showHeading = option.releaseFolder !== lastFolder;
                lastFolder = option.releaseFolder;
                return (
                  <li key={option.path}>
                    {showHeading && <div className="sprint-picker__heading">Release {releaseLabel(option.releaseFolder)}</div>}
                    <button
                      type="button"
                      className={"sprint-picker__option" + (option.path === sprintPath ? " sprint-picker__option--active" : "")}
                      onClick={() => {
                        setOpen(false);
                        if (option.path !== sprintPath) onSelect(option.path);
                      }}
                    >
                      <span className="sprint-picker__option-name">
                        {option.name}
                        {option.isCurrent && <span className="sprint-picker__badge">Nu</span>}
                      </span>
                      <span className="sprint-picker__option-dates">
                        {option.startDate} – {option.endDate}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </FloatingPopover>
      )}
    </>
  );
}
