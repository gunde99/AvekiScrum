import "./StartupError.css";

interface StartupErrorProps {
  error: unknown;
}

/**
 * Shown when the app can't start - almost always something in the sign-in configuration.
 *
 * The alternative is a blank page, which is what this replaces: a white screen tells whoever is
 * setting the server up precisely nothing, while the message and the error code below usually
 * point straight at the setting that's wrong.
 */
export function StartupError({ error }: StartupErrorProps) {
  const message = error instanceof Error ? error.message : String(error);
  const code = extractErrorCode(message);

  return (
    <div className="startup-error">
      <div className="startup-error__card">
        <h1>
          Aveki<span>Scrum</span>
        </h1>
        <h2>Kunde inte logga in</h2>
        <p className="startup-error__hint">{hintFor(code)}</p>

        <details>
          <summary>Tekniska detaljer</summary>
          <pre>{message}</pre>
        </details>

        <div className="startup-error__actions">
          <button type="button" className="wi-btn wi-btn--primary" onClick={() => window.location.reload()}>
            Försök igen
          </button>
          <a className="wi-btn" href="/api/health" target="_blank" rel="noreferrer">
            Kontrollera servern
          </a>
        </div>
      </div>
    </div>
  );
}

/** The AADSTSnnnnn code Entra puts in its error messages, when there is one. */
function extractErrorCode(message: string): string | null {
  return /AADSTS\d+/.exec(message)?.[0] ?? null;
}

/**
 * The handful of failures that actually happen when this is being set up, in plain language.
 * Anything else falls through to the generic line plus the raw message.
 */
function hintFor(code: string | null): string {
  switch (code) {
    case "AADSTS50011":
      return "Adressen appen skickades tillbaka till är inte registrerad i Entra. Lägg till den exakt, avslutande snedstreck inkluderat, som redirect-URI av typen Single-page application.";
    case "AADSTS65001":
      return "Behörigheten är inte godkänd. Kör Grant admin consent på båda app-registreringarna.";
    case "AADSTS700016":
      return "Klient-id:t hittas inte i katalogen. Kontrollera VITE_ENTRA_CLIENT_ID i bygget.";
    case "AADSTS900971":
    case "AADSTS90002":
      return "Tenant-id:t stämmer inte. Kontrollera VITE_ENTRA_TENANT_ID i bygget.";
    default:
      return "Något gick fel innan appen hann starta. Detaljerna nedan brukar peka ut vilken inställning det gäller – börja med redirect-URI:n i Entra och att servern svarar på /api/health.";
  }
}
