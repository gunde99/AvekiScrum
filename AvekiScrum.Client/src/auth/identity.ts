import { fetchSignedInUser, type SignedInUser } from "../api/me";

let current: SignedInUser | null = null;
let lastError: string | null = null;

/**
 * The signed-in identity, read once at startup and kept here so the rest of the app can ask
 * without threading it through props or another context.
 *
 * This is what replaced the reporter name people used to type in themselves - see reporter.ts,
 * which now only handles the case where the Api runs without sign-in.
 */
export async function loadIdentity(): Promise<SignedInUser> {
  if (current) return current;
  try {
    current = await fetchSignedInUser();
    lastError = null;
  } catch (error) {
    // A failure here shouldn't stop the app from loading - but it must not pass silently either.
    // The signed-out state looks identical to "the Api rejected your token", and those two need
    // very different fixes, so the reason is kept for the banner in AppShell.
    lastError = error instanceof Error ? error.message : String(error);
    current = { signedIn: false };
  }
  return current;
}

export function getIdentity(): SignedInUser | null {
  return current;
}

/** Why we don't know who the user is, when sign-in was supposed to tell us. */
export function getIdentityError(): string | null {
  return lastError;
}

/** The name to put on a card, or "" when nobody is signed in. */
export function identityName(): string {
  return current?.signedIn ? (current.displayName ?? "") : "";
}
