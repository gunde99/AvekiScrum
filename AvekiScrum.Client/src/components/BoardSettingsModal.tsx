import { useEffect } from "react";
import { createPortal } from "react-dom";
import { updateBoardSettings, useBoardSettings, type TestCardLayout } from "../settings/boardSettings";
import "./BoardSettingsModal.css";

interface BoardSettingsModalProps {
  onClose: () => void;
}

const STALE_DAY_OPTIONS = [0, 1, 2, 3, 5];

const TEST_LAYOUTS: { id: TestCardLayout; label: string; hint: string }[] = [
  { id: "rows", label: "Rader", hint: "En rad per test-task, rubriken längst till höger." },
  { id: "cards", label: "Kort med rubrik", hint: "Testets rubrik överst i varje kort, huvudkort och personer under." },
];

/**
 * BoardShell's ⚙️: how this person likes to read the boards. Everything here applies immediately
 * and is remembered in this browser - there is no "Spara". A modal rather than a route, like the
 * talking points next to it, so opening it never unmounts a running daily flow behind it.
 */
export function BoardSettingsModal({ onClose }: BoardSettingsModalProps) {
  const settings = useBoardSettings();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="board-settings__overlay" onClick={onClose}>
      <div className="board-settings" role="dialog" aria-label="Inställningar" onClick={(e) => e.stopPropagation()}>
        <div className="board-settings__head">
          <span className="board-settings__title">Inställningar</span>
          <button type="button" className="board-settings__close" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </div>
        <p className="board-settings__intro">Gäller direkt och sparas i den här webbläsaren.</p>

        <section className="board-settings__section">
          <h3>Dailys</h3>
          <label className="board-settings__option">
            <input
              type="checkbox"
              checked={settings.showWarnings}
              onChange={() => updateBoardSettings({ showWarnings: !settings.showWarnings })}
            />
            <span>
              Visa varningar
              <small>⚠/◎ per kort, färgade rader och Varning-märket på grupperna - på boarden och i daily-flödet.</small>
            </span>
          </label>
          <label className="board-settings__option">
            <input
              type="checkbox"
              checked={settings.hideStaleClosed}
              onChange={() => updateBoardSettings({ hideStaleClosed: !settings.hideStaleClosed })}
            />
            <span>
              Hoppa över stängda kort i daily-flödet
              <small>
                Kort som stängdes för mer än{" "}
                <select
                  className="board-settings__inline-select"
                  value={settings.staleClosedWorkingDays}
                  onChange={(e) => updateBoardSettings({ staleClosedWorkingDays: Number(e.target.value) })}
                >
                  {STALE_DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>{" "}
                arbetsdag{settings.staleClosedWorkingDays === 1 ? "" : "ar"} sedan. Boardens statistik räknar dem ändå.
              </small>
            </span>
          </label>
        </section>

        <section className="board-settings__section">
          <h3>Test</h3>
          <div className="board-settings__choice" role="radiogroup" aria-label="Layout för testkort">
            {TEST_LAYOUTS.map((layout) => (
              <label
                key={layout.id}
                className={"board-settings__choice-item" + (settings.testCardLayout === layout.id ? " board-settings__choice-item--active" : "")}
              >
                <input
                  type="radio"
                  name="test-card-layout"
                  checked={settings.testCardLayout === layout.id}
                  onChange={() => updateBoardSettings({ testCardLayout: layout.id })}
                />
                <span>
                  {layout.label}
                  <small>{layout.hint}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="board-settings__subsection">
            <label className="board-settings__option">
              <input
                type="checkbox"
                checked={settings.showTestStatusAge}
                onChange={() => updateBoardSettings({ showTestStatusAge: !settings.showTestStatusAge })}
              />
              <span>
                Visa tid i status
                <small>Hur länge testet legat i sin status. En blockering som hävts räknas som ny start - först då är det redo att testas.</small>
              </span>
            </label>
            <label className="board-settings__option">
              <input
                type="checkbox"
                checked={settings.showTestLastChanged}
                onChange={() => updateBoardSettings({ showTestLastChanged: !settings.showTestLastChanged })}
              />
              <span>
                Visa senast ändrad
                <small>När något senast ändrades på testkortet - status, tagg, kommentar eller annat fält.</small>
              </span>
            </label>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
