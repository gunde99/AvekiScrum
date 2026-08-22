import { apiFetch } from "../lib/apiFetch";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export interface UploadedAttachment {
  id: string;
  /** Our proxy, which the browser can fetch with the user's token. For display only. */
  url: string;
  /** Azure DevOps' own url. This is what goes into the card, so the image renders in Azure too. */
  azureUrl: string;
}

export async function uploadAttachment(blob: Blob, fileName: string): Promise<UploadedAttachment> {
  const response = await apiFetch(`${API_BASE_URL}/api/attachments?fileName=${encodeURIComponent(fileName)}`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload attachment: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { id: string; url: string; azureUrl: string };
  return { id: data.id, url: `${API_BASE_URL}${data.url}`, azureUrl: data.azureUrl };
}
