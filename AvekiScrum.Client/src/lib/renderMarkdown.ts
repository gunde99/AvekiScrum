import { marked } from "marked";

// This Azure DevOps org uses Markdown-format discussions (confirmed by raw `![](...)`/`**bold**`
// syntax showing up unrendered in comment text), and System.Description/AcceptanceCriteria are
// markdown-compatible too - CommonMark passes raw HTML blocks through untouched, so running
// already-HTML content through the same renderer is safe and gives us one code path for both.
marked.setOptions({ breaks: true, gfm: true });

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

// Azure DevOps attachment URLs (used for pasted/embedded images) require the org's PAT to fetch,
// which the browser doesn't have and never should. Rewrite them to our own attachment proxy
// (see AvekiScrum.Api's /api/attachments/{id} endpoint) before rendering so images actually load.
const ATTACHMENT_URL_PATTERN = /https:\/\/dev\.azure\.com\/[^/\s]+\/[^/\s]+\/_apis\/wit\/attachments\/([0-9a-fA-F-]{36})(\?[^)"'\s]*)?/g;

function rewriteAttachmentUrls(text: string): string {
  return text.replace(ATTACHMENT_URL_PATTERN, (_match, id: string, query: string | undefined) => {
    const params = new URLSearchParams(query ?? "");
    const fileName = params.get("fileName");
    const suffix = fileName ? `?fileName=${encodeURIComponent(fileName)}` : "";
    return `${API_BASE_URL}/api/attachments/${id}${suffix}`;
  });
}

export function renderWorkItemContent(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "";
  const rewritten = rewriteAttachmentUrls(raw);
  return marked.parse(rewritten, { async: false }) as string;
}
