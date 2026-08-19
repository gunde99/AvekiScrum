const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export interface UploadedAttachment {
  id: string;
  /** Absolute URL, ready to embed directly in markdown/HTML - already resolved against API_BASE_URL. */
  url: string;
}

export async function uploadAttachment(blob: Blob, fileName: string): Promise<UploadedAttachment> {
  const response = await fetch(`${API_BASE_URL}/api/attachments?fileName=${encodeURIComponent(fileName)}`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload attachment: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { id: string; url: string };
  return { id: data.id, url: `${API_BASE_URL}${data.url}` };
}
