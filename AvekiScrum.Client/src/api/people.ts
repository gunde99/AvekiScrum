import type { DeveloperTeamId } from "./dailys";

export interface PersonOption {
  email: string;
  displayName: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

/** Developers + PO for one team - used for the Ansvarig picker. */
export async function fetchTeamMembers(team: DeveloperTeamId, signal?: AbortSignal): Promise<PersonOption[]> {
  const response = await fetch(`${API_BASE_URL}/api/team-members?team=${team}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load team members for team ${team}: HTTP ${response.status}`);
  }
  return (await response.json()) as PersonOption[];
}

/** Developers across both teams - used for the Development Partner picker. */
export async function fetchDevelopers(signal?: AbortSignal): Promise<PersonOption[]> {
  const response = await fetch(`${API_BASE_URL}/api/developers`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load developers: HTTP ${response.status}`);
  }
  return (await response.json()) as PersonOption[];
}

/** Everyone in both teams, all roles - used where the pick isn't developer-only (e.g. choosing
 *  a tester for a test task). */
export async function fetchAllPeople(signal?: AbortSignal): Promise<PersonOption[]> {
  const response = await fetch(`${API_BASE_URL}/api/people`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load people: HTTP ${response.status}`);
  }
  return (await response.json()) as PersonOption[];
}

export interface TeamRoles {
  po: PersonOption | null;
  testLead: PersonOption | null;
  developers: PersonOption[];
  /** Seeds the daily-flow participant picker the first time this browser opens the team - people
   *  on long-term absence, on loan elsewhere, and so on. Only a starting point: once the picker
   *  has been saved locally, that selection wins. */
  flowExcludedByDefault?: PersonOption[];
}

/** The team's Product Owner, Test Lead and full developer roster - used by the Daily Flow. */
export async function fetchTeamRoles(team: DeveloperTeamId, signal?: AbortSignal): Promise<TeamRoles> {
  const response = await fetch(`${API_BASE_URL}/api/team-roles?team=${team}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load team roles for team ${team}: HTTP ${response.status}`);
  }
  return (await response.json()) as TeamRoles;
}
