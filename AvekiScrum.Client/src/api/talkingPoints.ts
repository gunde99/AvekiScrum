import type { DeveloperTeamId } from "./dailys";
import { apiFetch, describeFailure } from "../lib/apiFetch";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

/** One "Sak att ta upp" - see AvekiScrum.Domain.Entities.Scrum.TalkingPoint. */
export interface TalkingPointDto {
  id: string;
  team: string;
  bodyHtml: string;
  assigneeEmail: string;
  assigneeDisplayName: string;
  createdByEmail: string;
  createdByDisplayName: string;
  createdAt: string;
  raised: boolean;
  raisedAt: string | null;
}

export async function fetchTalkingPoints(team: DeveloperTeamId, signal?: AbortSignal): Promise<TalkingPointDto[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/talking-points?team=${team}`, { signal });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte hämta saker att ta upp"));
  }
  return (await response.json()) as TalkingPointDto[];
}

export async function createTalkingPoint(request: {
  team: DeveloperTeamId;
  bodyHtml: string;
  assigneeEmail: string;
  assigneeDisplayName: string;
  createdByEmail?: string;
  createdByDisplayName?: string;
}): Promise<TalkingPointDto> {
  const response = await apiFetch(`${API_BASE_URL}/api/talking-points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte spara saken att ta upp"));
  }
  return (await response.json()) as TalkingPointDto;
}

export async function updateTalkingPoint(
  id: string,
  request: { team: DeveloperTeamId; bodyHtml: string; assigneeEmail: string; assigneeDisplayName: string },
): Promise<TalkingPointDto> {
  const response = await apiFetch(`${API_BASE_URL}/api/talking-points/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte spara ändringarna"));
  }
  return (await response.json()) as TalkingPointDto;
}

export async function setTalkingPointRaised(id: string, team: DeveloperTeamId, raised: boolean): Promise<TalkingPointDto> {
  const response = await apiFetch(`${API_BASE_URL}/api/talking-points/${id}/raised`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team, raised }),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, raised ? "Kunde inte bocka av" : "Kunde inte återställa"));
  }
  return (await response.json()) as TalkingPointDto;
}

/** The settings page's "tänd/släck allt" bulk action. */
export async function setAllTalkingPointsRaised(team: DeveloperTeamId, raised: boolean): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/talking-points/raised-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team, raised }),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, raised ? "Kunde inte bocka av alla" : "Kunde inte återställa alla"));
  }
}

export async function deleteTalkingPoint(id: string, team: DeveloperTeamId): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/talking-points/${id}?team=${team}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte ta bort"));
  }
}
