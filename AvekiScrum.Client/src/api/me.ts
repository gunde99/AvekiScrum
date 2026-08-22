import { apiFetch } from "../lib/apiFetch";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export interface SignedInUser {
  signedIn: boolean;
  displayName?: string;
  email?: string;
  objectId?: string;
  /** The address in TeamRoleConfig this person matched, when they're in it. */
  matchedEmail?: string | null;
  roleGroups?: string[];
}

/**
 * Who the Api thinks is calling. Answers `{ signedIn: false }` when the Api runs in PAT mode,
 * which is how the client knows to fall back to asking for a name instead of assuming auth broke.
 */
export async function fetchSignedInUser(signal?: AbortSignal): Promise<SignedInUser> {
  const response = await apiFetch(`${API_BASE_URL}/api/me`, { signal });
  if (!response.ok) throw new Error(`Kunde inte hämta inloggad användare: HTTP ${response.status}`);
  return (await response.json()) as SignedInUser;
}
