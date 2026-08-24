const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export interface ServerConfig {
  status: string;
  /** The Azure DevOps project this Api talks to. */
  project: string;
  /** True when Testing:ProjectOverride points it at the sandbox. */
  sandbox: boolean;
  /** "Entra", "EntraWithPat" or "Pat". */
  authMode: string;
  /** Whether the Api will reject anonymous calls. The client follows this, not its own env. */
  signInRequired: boolean;
  environment: string;
}

/**
 * What the server expects of us, asked before anything else happens.
 *
 * This is the whole point of the endpoint being anonymous: the client can't know whether to run a
 * sign-in until the server has said so, and guessing from its own build-time env is what made the
 * two halves drift apart - a client that signed in against an Api that didn't care, or the reverse.
 * One source of truth, and it's the server.
 */
export interface FetchServerConfigOptions {
  /** How long to keep trying before giving up. */
  timeoutMs?: number;
  /** Called once the first attempt has failed, so the page can say it is waiting rather than sit blank. */
  onWaiting?: () => void;
}

/** An answer from the server that happens to be an error - never worth retrying. */
class ServerRespondedError extends Error {}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchServerConfig(options: FetchServerConfigOptions = {}): Promise<ServerConfig> {
  // The two halves are started together but are not ready together: Vite serves this page in a
  // couple of hundred milliseconds while `dotnet run` still has a build to finish. So the very
  // first health check losing the race is the normal case, not a fault - and "tryck Försök igen"
  // is a poor thing to ask of someone every single morning.
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let waitingAnnounced = false;
  let lastCause: unknown;

  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (!response.ok) {
        throw new ServerRespondedError(
          `API:t på ${API_BASE_URL || window.location.origin} svarade ${response.status} på /api/health.`,
        );
      }
      return (await response.json()) as ServerConfig;
    } catch (cause) {
      // A status code is an answer: the server is up and saying something is wrong, and hammering
      // it won't change that.
      if (cause instanceof ServerRespondedError) throw cause;
      lastCause = cause;

      if (Date.now() >= deadline) {
        // A network-level failure that outlasted the window means it really isn't coming. Said
        // plainly, because the alternative is this surfacing later as "Failed to fetch" inside an
        // error about tokens - which sends you looking at Entra for a problem that is a batch file.
        throw new Error(
          `Ingen kontakt med API:t på ${API_BASE_URL || window.location.origin}. ` +
            `Kör det igång - start-pat.bat eller start-entra.bat i repo-roten - och ladda om sidan.`,
          { cause: lastCause },
        );
      }

      if (!waitingAnnounced) {
        waitingAnnounced = true;
        options.onWaiting?.();
      }
      // Quick at first, since a warm Api is usually there within a second or two, then backing off
      // so a genuinely dead server isn't polled thirty times.
      await delay(Math.min(250 * attempt, 2000));
    }
  }
}
