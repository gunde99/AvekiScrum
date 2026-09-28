import { getIdentity, identityName } from "./identity";
import type { PersonOption } from "../api/people";

const STORAGE_KEY = "avekiscrum.dorApprover";

/**
 * Who to record as Custom.DoRApprovedBy on the Godkännande tab.
 *
 * That field is an Identity field in Azure DevOps, not free text - it validates whatever is sent
 * against a real account, so a typed name ("Okänd" and friends) is rejected outright. A signed-in
 * user's email always resolves. PAT mode has no signed-in user at all (same gap reporter.ts
 * covers for AvekiSupport's Buggrapportör line), so this remembers a person chosen once from the
 * roster instead - the PAT-mode "impersonate me" the tab offers.
 */
export function loadApprover(): PersonOption | null {
  const signedIn = getIdentity();
  if (signedIn?.signedIn && signedIn.email) {
    return { email: signedIn.email, displayName: signedIn.displayName ?? signedIn.email };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersonOption) : null;
  } catch {
    // Private mode / storage disabled - the tab just asks again each time.
    return null;
  }
}

/** True when the approver comes from the sign-in and so isn't the user's to change. */
export function approverIsFromSignIn(): boolean {
  return identityName().length > 0;
}

export function saveApprover(person: PersonOption | null): void {
  try {
    if (person) localStorage.setItem(STORAGE_KEY, JSON.stringify(person));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do - remembering the choice is a convenience, not a requirement */
  }
}
