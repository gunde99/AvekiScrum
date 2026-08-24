import { LogLevel, type Configuration } from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined;
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined;

/** The scope our own Api exposes. The Azure DevOps scopes are asked for server-side, on-behalf-of. */
export const API_SCOPE = (import.meta.env.VITE_API_SCOPE as string | undefined) ?? "";

/**
 * Whether this build *can* sign in - it was given a tenant, a client id and a scope.
 *
 * Not the same as whether it *should*: that is the server's call, see signInRequired below. The
 * two were the same thing once, and every mismatch between the client's env and the Api's
 * Auth:Mode showed up as something apparently broken - a name that vanished, a 401 on every call.
 */
export const authConfigured = Boolean(tenantId && clientId && API_SCOPE);

// Set once at startup from /api/health. Read by everything that has to know whether a token is
// expected, so there is exactly one answer and it came from the server.
let signInRequiredFlag = false;

export function setSignInRequired(required: boolean): void {
  signInRequiredFlag = required;
}

/** True when the Api rejects anonymous calls, i.e. Auth:Mode is one of the Entra modes. */
export function signInRequired(): boolean {
  return signInRequiredFlag;
}

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? "",
    authority: `https://login.microsoftonline.com/${tenantId ?? "common"}`,
    // Where Entra sends the user back. The app is a single page, so the root is the only route
    // that exists - and it must match a redirect URI registered on the SPA app.
    redirectUri: window.location.origin + "/",
    postLogoutRedirectUri: window.location.origin + "/",
  },
  cache: {
    // sessionStorage rather than localStorage: the token dies with the tab, which is the right
    // trade for a tool used on shared office machines. Silent re-auth makes it free anyway.
    cacheLocation: "sessionStorage",
  },
  system: {
    /**
     * Ask Windows for the token instead of the browser when possible. On a domain-joined machine
     * in Edge this makes sign-in completely invisible, and the token is bound to the device rather
     * than stored in browser storage.
     *
     * Only over https, which in practice means only in production. The broker requires it anyway,
     * so on `http://localhost` the handshake can't succeed - all it does is make the browser ask
     * "Få åtkomst till andra appar och tjänster på den här enheten?" on every session, for a
     * capability that then isn't used. The ordinary web flow with ssoSilent is what runs locally,
     * and it signs you in just as quietly.
     */
    allowPlatformBroker: window.location.protocol === "https:",
    loggerOptions: {
      logLevel: LogLevel.Error,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error("[MSAL]", message);
      },
    },
  },
};

/** What we ask for when signing someone in. */
export const loginRequest = {
  scopes: [API_SCOPE],
};
