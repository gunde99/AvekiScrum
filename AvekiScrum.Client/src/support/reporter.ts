import { identityName } from "../auth/identity";

const STORAGE_KEY = "avekisupport.reporter";

/**
 * Who is filing the bug.
 *
 * When the user is signed in, that identity wins and nobody types anything - it's also the name
 * Azure records as the card's creator, so the two can't disagree. The stored name is the fallback
 * for a PAT-mode Api (local development), where there is no signed-in user at all.
 */
export function loadReporter(): string {
  const signedIn = identityName();
  if (signedIn) return signedIn;
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    // Private mode / storage disabled - the form just asks again each time.
    return "";
  }
}

/** True when the name comes from the sign-in and so isn't the user's to edit. */
export function reporterIsFromSignIn(): boolean {
  return identityName().length > 0;
}

export function saveReporter(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do - remembering the name is a convenience, not a requirement */
  }
}
