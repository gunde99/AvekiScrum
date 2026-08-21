import type { ReactNode } from "react";
import { useTheme } from "../theme/ThemeContext";
import "./BoardShell.css";

const BOARDS = [
  { id: "planering", label: "Planering", enabled: false },
  { id: "dailys", label: "Dailys", enabled: true },
  { id: "review", label: "Review", enabled: true },
  { id: "retro", label: "Retro", enabled: false },
] as const;

export type BoardId = (typeof BOARDS)[number]["id"];

/** The boards that actually exist. The others are shown in the nav but disabled, so navigation
 *  can only ever emit one of these - which is what lets the boards themselves narrow their prop. */
export type NavigableBoardId = Extract<BoardId, "dailys" | "review">;

interface BoardShellProps {
  activeBoard: BoardId;
  title: string;
  subtitle?: string;
  /** Switches board. Only the enabled ones are clickable. */
  onNavigate?: (board: NavigableBoardId) => void;
  children: ReactNode;
}

// Shared header/nav shell for all four Scrum boards. No AvekiScrum wordmark/logo
// asset is available yet (see docs/Grafisk profil.pdf) - using a styled text
// placeholder until the real logotype files are sourced.
export function BoardShell({ activeBoard, title, subtitle, onNavigate, children }: BoardShellProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="board-shell">
      <header className="board-shell__header">
        <div className="board-shell__brand">Aveki<span>Scrum</span></div>
        <nav className="board-shell__nav">
          {BOARDS.map((board) => (
            <button
              key={board.id}
              type="button"
              className={
                "board-shell__nav-item" +
                (board.id === activeBoard ? " board-shell__nav-item--active" : "") +
                (!board.enabled ? " board-shell__nav-item--disabled" : "")
              }
              disabled={!board.enabled || board.id === activeBoard}
              onClick={() => onNavigate?.(board.id as NavigableBoardId)}
              title={board.enabled ? undefined : "Kommer senare"}
            >
              {board.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="board-shell__theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Byt till ljust läge" : "Byt till mörkt läge"}
          aria-label="Växla mellan ljust och mörkt läge"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </header>
      <main className="board-shell__content">
        <div className="board-shell__page-header">
          <h1>{title}</h1>
          {subtitle && <p className="board-shell__subtitle">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
