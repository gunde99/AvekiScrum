import { apiFetch, describeFailure } from "../lib/apiFetch";
import type { ProductBacklogResponse } from "./refinement";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

/**
 * Teamavstämning's Scrum Master step, weeks 2+ of a sprint: work items tagged "Berör båda teamen"
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

/** One developer drawn for "Nästa veckas influencer" - see AvekiScrum.Domain.Entities.Scrum.MeetingInfluencer. */
export interface MeetingInfluencerDto {
  id: string;
  /** "yyyy-MM-dd" - the meeting they present at. */
  meetingDate: string;
  email: string;
  displayName: string;
  drawnAt: string;
}

/** Omit `date` for the full history (drives the lottery's fair rotation); pass one for that meeting only. */
export async function fetchMeetingInfluencers(date?: string, signal?: AbortSignal): Promise<MeetingInfluencerDto[]> {
  const url = date
    ? `${API_BASE_URL}/api/team-checkin/influencers?date=${encodeURIComponent(date)}`
    : `${API_BASE_URL}/api/team-checkin/influencers`;
  const response = await apiFetch(url, { signal });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte hämta influencers"));
  }
  return (await response.json()) as MeetingInfluencerDto[];
}

export async function addMeetingInfluencer(request: { meetingDate: string; email: string; displayName: string }): Promise<MeetingInfluencerDto> {
  const response = await apiFetch(`${API_BASE_URL}/api/team-checkin/influencers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte spara influencern"));
  }
  return (await response.json()) as MeetingInfluencerDto;
}

export async function deleteMeetingInfluencer(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/team-checkin/influencers/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(await describeFailure(response, "Kunde inte ångra"));
  }
}
