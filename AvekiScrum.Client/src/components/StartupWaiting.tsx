import "./StartupError.css";

/**
 * Shown while the Api is still coming up.
 *
 * The two halves start together but aren't ready together - Vite serves this page in a fraction of
 * the time `dotnet run` needs to build - so the wait is normal. Saying so beats both a blank page
 * and an error card that blames a server which is, at that moment, simply still starting.
 */
export function StartupWaiting() {
  return (
    <div className="startup-error">
      <div className="startup-error__card startup-error__card--waiting">
        <h1>
          Aveki<span>Scrum</span>
        </h1>
        <h2>Väntar på servern…</h2>
        <p className="startup-error__hint">
          API:t startar fortfarande. Sidan fortsätter själv så fort det svarar – du behöver inte göra något.
        </p>
      </div>
    </div>
  );
}
