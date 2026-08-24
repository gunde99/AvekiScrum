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
export async function fetchServerConfig(): Promise<ServerConfig> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/health`);
  } catch (cause) {
    // A network-level failure, which in practice means the Api isn't running. Said plainly here
    // because the alternative is this surfacing later as "Failed to fetch" inside an error about
    // tokens, which sends you looking at Entra for a problem that is one command away.
    throw new Error(
      `Ingen kontakt med API:t på ${API_BASE_URL || window.location.origin}. ` +
        `Kör det igång - start-pat.bat eller start-entra.bat i repo-roten - och ladda om sidan.`,
      { cause },
    );
  }

  if (!response.ok) {
    throw new Error(`API:t på ${API_BASE_URL || window.location.origin} svarade ${response.status} på /api/health.`);
  }
  return (await response.json()) as ServerConfig;
}
