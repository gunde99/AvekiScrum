import type { ReactNode } from "react";
import { useTheme } from "../theme/ThemeContext";
import "./BoardShell.css";

export interface AppShellNavItem {
  id: string;
  label: string;
  /** Shown but not clickable when false - for boards that don't exist yet. */
  enabled?: boolean;
}

interface AppShellProps {
  /** Brand text, split so the second half takes the accent colour: "Aveki" + "Scrum". */
  brandPrefix: string;
  brandSuffix: string;
  nav: AppShellNavItem[];
  activeId: string;
  onNavigate?: (id: string) => void;
  /** Back to the start page. Omitted only where there is nowhere to go back to. */
  onHome?: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * The chrome both apps share: brand, nav, theme toggle, page heading. AvekiScrum and AvekiSupport
 * are separate tools with separate navigation, but they're the same product to whoever uses them,
 * so the frame around them is one component rather than two that drift apart.
 */
export function AppShell({
  brandPrefix,
  brandSuffix,
  nav,
  activeId,
  onNavigate,
  onHome,
  title,
  subtitle,
  children,
}: AppShellProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="board-shell">
      <header className="board-shell__header">
        {onHome ? (
          <button type="button" className="board-shell__brand board-shell__brand--link" onClick={onHome} title="Till startsidan">
            {brandPrefix}
            <span>{brandSuffix}</span>
          </button>
        ) : (
          <div className="board-shell__brand">
            {brandPrefix}
            <span>{brandSuffix}</span>
          </div>
        )}
        <nav className="board-shell__nav">
          {nav.map((item) => {
            const enabled = item.enabled !== false;
            return (
              <button
                key={item.id}
                type="button"
                className={
                  "board-shell__nav-item" +
                  (item.id === activeId ? " board-shell__nav-item--active" : "") +
                  (!enabled ? " board-shell__nav-item--disabled" : "")
                }
                disabled={!enabled || item.id === activeId}
                onClick={() => onNavigate?.(item.id)}
                title={enabled ? undefined : "Kommer senare"}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        {onHome && (
          <button type="button" className="board-shell__home" onClick={onHome} title="Till startsidan">
            ⌂ Start
          </button>
        )}
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
