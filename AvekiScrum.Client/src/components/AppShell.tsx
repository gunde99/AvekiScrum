import { useState, type ReactNode } from "react";
import { useTheme } from "../theme/ThemeContext";
import { authEnabled } from "../auth/authConfig";
import { getIdentity, getIdentityError } from "../auth/identity";
import { Diagnostics } from "./Diagnostics";
import { PersonAvatar } from "./PersonAvatar";
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
  const identity = getIdentity();
  // Signed in at Entra but rejected by our own Api: every view will show its own failure, and
  // none of them will say why. One banner naming the real problem beats six error messages.
  const identityProblem = authEnabled && identity && !identity.signedIn ? getIdentityError() : null;
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
        {/* Who the cards will be written as. Worth showing precisely because nobody had to log in
            to get here - without it there's no way to tell whose name ends up in Azure. */}
        {identity?.signedIn && (
          <span className="board-shell__user" title={identity.email ?? undefined}>
            <PersonAvatar name={identity.displayName} size={26} />
            <span className="board-shell__user-name">{identity.displayName}</span>
          </span>
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
        {identityProblem && (
          <div className="board-shell__auth-warning" role="alert">
            <strong>Servern känner inte igen din inloggning.</strong> Du är inloggad i webbläsaren,
            men API:t avvisar din token, så ingenting kan hämtas från Azure DevOps. Detaljer i
            serverloggen under <code>AvekiScrum.Auth</code>. ({identityProblem}){" "}
            <button type="button" className="diag-open" onClick={() => setShowDiagnostics(true)}>
              Kör diagnostik
            </button>
          </div>
        )}
        <div className="board-shell__page-header">
          <h1>{title}</h1>
          {subtitle && <p className="board-shell__subtitle">{subtitle}</p>}
        </div>
        {children}
      </main>
      {showDiagnostics && <Diagnostics onClose={() => setShowDiagnostics(false)} />}
    </div>
  );
}
