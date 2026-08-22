import { getApiToken } from "../auth/msal";

/**
 * fetch with the signed-in user's token attached.
 *
 * Every call to our Api goes through here so the token is added in one place rather than at
 * twenty call sites. When sign-in is off (local development against a PAT-mode Api) it behaves
 * exactly like plain fetch.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getApiToken();
  if (!token) return fetch(input, init);

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/**
 * An attachment as a blob URL.
 *
 * Azure DevOps attachments are proxied by our Api, which now requires a token - and an `<img>`
 * tag can't send one. So the bytes are fetched here and handed to the browser as a blob instead.
 * Returns the original URL untouched when auth is off, or when the fetch fails, so a broken image
 * is the worst case rather than a crash.
 */
export async function toAttachmentBlobUrl(url: string): Promise<string> {
  try {
    const token = await getApiToken();
    if (!token) return url;
    const response = await apiFetch(url);
    if (!response.ok) return url;
    return URL.createObjectURL(await response.blob());
  } catch {
    return url;
  }
}

/** True for URLs served by our attachment proxy - the ones that need a token. */
export function isAttachmentUrl(url: string, apiBaseUrl: string): boolean {
  return url.startsWith(`${apiBaseUrl}/api/attachments/`);
}

/**
 * The reason a request failed, as a sentence rather than a status code.
 *
 * The Api answers a failure with JSON carrying the exception message; "HTTP 500" on its own sent
 * us hunting through IIS logs for something the response already knew. Falls back to the status
 * when the body holds nothing useful.
 */
export async function describeFailure(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `${fallback}: HTTP ${response.status}`;

    try {
      const body = JSON.parse(text) as { error?: string; inner?: string; type?: string };
      const parts = [body.error, body.inner].filter(Boolean);
      if (parts.length > 0) return `${fallback}: ${parts.join(" – ")}`;
    } catch {
      // Not JSON - the plain-text endpoints answer like this.
    }
    return `${fallback}: ${text.slice(0, 300)}`;
  } catch {
    return `${fallback}: HTTP ${response.status}`;
  }
}
