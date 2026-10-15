import type { DeveloperTeamId } from "./dailys";
import type { PersonOption } from "./people";
import { apiFetch, describeFailure } from "../lib/apiFetch";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

/** Which team(s) a talking point is relevant to. */
export type TalkingPointScope = "Nord" | "Syd" | "Both";

/** A team filter as used by the settings modal - "Alla" has no server-side equivalent of its own,
 *  it just means "don't scope the request to one team" (mapped to "Both" for the raise endpoints,
 *  and to no 'team' param at all for the list endpoint). */
export type TeamFilter = "Nord" | "Syd" | "Alla";

/**
 * The pseudo-person for "whoever is running today's daily as Scrum Master" - Team Syd's Miro is
 * both a developer and the SM, so a talking point assigned to his real name would get spliced in
 * front of his *developer* turn like anyone else's. Assigning to this sentinel instead deliberately
 * never matches a real roster name (see DailyFlow.tsx's isRosterMember/samePerson check), so it
 * always falls through to a full tail turn at the very end, regardless of whether that same person
 * already had a developer turn earlier in the flow.
 */
export const SCRUM_MASTER: PersonOption = { email: "scrum-master", displayName: "Scrum Master" };

/** One "Sak att ta upp" - see AvekiScrum.Domain.Entities.Scrum.TalkingPoint. */
export interface TalkingPointDto {
  id: string;
  scope: TalkingPointScope;
  bodyHtml: string;
  assigneeEmail: string;
  assigneeDisplayName: string;
  createdByEmail: string;
  createdByDisplayName: string;
  createdAt: string;
  nordRaised: boolean;
  nordRaisedAt: string | null;
  sydRaised: boolean;
  sydRaisedAt: string | null;
}

export function appliesToTeam(p: TalkingPointDto, team: DeveloperTeamId): boolean {
  return p.scope === "Both" || p.scope === team;
}

export function isRaisedForTeam(p: TalkingPointDto, team: DeveloperTeamId): boolean {
  return team === "Nord" ? p.nordRaised : p.sydRaised;
}

export function raisedAtForTeam(p: TalkingPointDto, team: DeveloperTeamId): string | null {
  return team === "Nord" ? p.nordRaisedAt : p.sydRaisedAt;
}

/** Done everywhere it's relevant - a Nord-only point just needs nordRaised, a Both-scoped one needs
 *  both flags (raised in Nord's daily and in Syd's, independently). */
export function isFullyRaised(p: TalkingPointDto): boolean {
  const nordDone = p.scope === "Syd" || p.nordRaised;
  const sydDone = p.scope === "Nord" || p.sydRaised;
  return nordDone && sydDone;
}

/** GET: omit `team` for everything (any scope); pass a concrete team for just what's relevant to it. */
export async function fetchTalkingPoints(team?: DeveloperTeamId, signal?: AbortSignal): Promise<TalkingPointDto[]> {
  const url = team ? `${API_BASE_URL}/api/talking-points?team=${team}` : `${API_BASE_URL}/api/talking-points`;
  const response = await apiFetch(url, { signal });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte hämta saker att ta upp"));
  }
  return (await response.json()) as TalkingPointDto[];
}

export async function createTalkingPoint(request: {
  scope: TalkingPointScope;
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
  request: { scope: TalkingPointScope; bodyHtml: string; assigneeEmail: string; assigneeDisplayName: string },
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

/** `team` is "Nord"/"Syd" for a single team's flag, or "Both" to mark it done (or reset) everywhere
 *  it's relevant at once - see isFullyRaised. */
export async function setTalkingPointRaised(id: string, team: TalkingPointScope, raised: boolean): Promise<TalkingPointDto> {
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

/** The settings modal's "tänd/släck allt" bulk action, scoped the same way as the list it was
 *  clicked from ("Nord"/"Syd", or "Both" for the "Alla" filter). */
export async function setAllTalkingPointsRaised(team: TalkingPointScope, raised: boolean): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/talking-points/raised-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team, raised }),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response, raised ? "Kunde inte bocka av alla" : "Kunde inte återställa alla"));
  }
}

export async function deleteTalkingPoint(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/talking-points/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await describeFailure(response, "Kunde inte ta bort"));
  }
}
