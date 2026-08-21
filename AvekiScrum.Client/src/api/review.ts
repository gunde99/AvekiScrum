const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export interface ReviewReportCard {
  id: number;
  title: string;
  state: string;
  storyPoints: number;
  url: string | null;
}

export interface ReviewReportGroup {
  developer: string;
  cards: ReviewReportCard[];
}

export interface ReviewReportSection {
  key: string;
  title: string;
  icon: string;
  groups: ReviewReportGroup[];
}

export interface ReviewReportRequest {
  team: string;
  sprint: string;
  sprintStart: string | null;
  sprintEnd: string | null;
  sections: ReviewReportSection[];
  /** True builds the card and returns it without posting, so the layout can be checked first. */
  dryRun: boolean;
}

/** One TextBlock of the Adaptive Card - the only element type the report uses. */
export interface ReviewCardBlock {
  type: string;
  text: string;
  size?: string;
  weight?: string;
  isSubtle?: boolean;
  separator?: boolean;
  spacing?: string;
}

export interface ReviewPublishResponse {
  posted: boolean;
  card: {
    attachments: { content: { body: ReviewCardBlock[] } }[];
  };
}

/**
 * Builds the review report on the server and, unless `dryRun`, posts it to the team's Teams
 * channel. Both modes return the same card, so the preview shows exactly what gets published.
 */
export async function publishReviewReport(
  request: ReviewReportRequest,
  signal?: AbortSignal,
): Promise<ReviewPublishResponse> {
  const response = await fetch(`${API_BASE_URL}/api/review/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    // The endpoint answers a failed publish with a plain-text explanation (missing webhook,
    // Teams' own error body) - surfacing it verbatim is far more useful than the status code.
    throw new Error((await response.text()) || `Publiceringen misslyckades (${response.status}).`);
  }
  return (await response.json()) as ReviewPublishResponse;
}

/** The card blocks, dug out of the Teams message envelope. */
export function blocksOf(response: ReviewPublishResponse): ReviewCardBlock[] {
  return response.card?.attachments?.[0]?.content?.body ?? [];
}
