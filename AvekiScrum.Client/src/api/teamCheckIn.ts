import { apiFetch, describeFailure } from "../lib/apiFetch";
import type { ProductBacklogResponse } from "./refinement";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

/**
 * Teamavstämning's Scrum Master step, weeks 2+ of a sprint: work items tagged "Berör både teamen"
 * in whichever sprint is current, across both teams' area paths at once - see the endpoint's own
 * comment for why "current" only needs to be resolved once (Nord and Syd share the cadence).
 */
export async function fetchCrossTeamTaggedItems(signal?: AbortSignal): Promise<ProductBacklogResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/team-checkin/cross-team-items`, { signal });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte hämta kort som berör båda teamen"));
  }
  return (await response.json()) as ProductBacklogResponse;
}
