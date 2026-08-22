import { fetchSignedInUser, type SignedInUser } from "../api/me";

let current: SignedInUser | null = null;

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
  } catch {
    // A failure here shouldn't stop the app from loading - it just means we don't know who you
    // are, and the support form asks for a name like it always did.
    current = { signedIn: false };
  }
  return current;
}

export function getIdentity(): SignedInUser | null {
  return current;
}

/** The name to put on a card, or "" when nobody is signed in. */
export function identityName(): string {
  return current?.signedIn ? (current.displayName ?? "") : "";
}
