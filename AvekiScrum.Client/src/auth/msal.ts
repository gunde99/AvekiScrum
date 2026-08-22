import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import { authEnabled, loginRequest, msalConfig } from "./authConfig";

export const msalInstance = new PublicClientApplication(msalConfig);

let initialized = false;

/**
 * Gets MSAL ready and picks up an existing session.
 *
 * `initialize` must finish before any other MSAL call - it's also what establishes the connection
 * to the Windows broker when the extension is present. `handleRedirectPromise` catches the return
 * leg of a redirect sign-in.
 */
export async function initializeAuth(): Promise<AccountInfo | null> {
  if (!authEnabled) return null;
  if (!initialized) {
    await msalInstance.initialize();
    initialized = true;
  }

  const redirectResult = await msalInstance.handleRedirectPromise();
  if (redirectResult?.account) {
    msalInstance.setActiveAccount(redirectResult.account);
    return redirectResult.account;
  }

  const existing = msalInstance.getAllAccounts();
  if (existing.length > 0) {
    msalInstance.setActiveAccount(existing[0]);
    return existing[0];
  }

  // Nobody signed in yet. On a domain-joined machine the browser already has a session with
  // Entra, so this usually completes without showing anything at all.
  try {
    const silent = await msalInstance.ssoSilent(loginRequest);
    if (silent.account) {
      msalInstance.setActiveAccount(silent.account);
      return silent.account;
    }
  } catch {
    // No usable session - the caller redirects to the real sign-in.
  }
  return null;
}

/** Full sign-in. Redirect rather than popup: popups get blocked, and this is the whole app. */
export async function signIn(): Promise<void> {
  await msalInstance.loginRedirect(loginRequest);
}

export async function signOut(): Promise<void> {
  await msalInstance.logoutRedirect();
}

/**
 * A token for our own Api, or null when auth is off (local development against a PAT-mode Api).
 *
 * Falls back to an interactive redirect only when the silent path genuinely can't work - an
 * expired session, or consent that hasn't been given. Anything else is rethrown rather than
 * bouncing the user to a login page for a transient network error.
 */
export async function getApiToken(): Promise<string | null> {
  if (!authEnabled) return null;

  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) {
    await signIn();
    return null;
  }

  try {
    const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await msalInstance.acquireTokenRedirect({ ...loginRequest, account });
      return null;
    }
    throw error;
  }
}
