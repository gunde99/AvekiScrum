import type { DeveloperTeamId } from "./dailys";
import { apiFetch } from "../lib/apiFetch";

export interface SprintGoalDeliverable {
  id: string;
  text: string;
  priority: number | null;
  done: boolean;
}

export interface SprintGoalDoneCriterion {
  id: string;
  text: string;
  checked: boolean;
}

export interface SprintGoalSubGoal {
  id: string;
  title: string;
  description: string;
  priority: number | null;
  workItemIds: number[];
}

export interface SprintGoal {
  id: string;
  number: number;
  title: string;
  description: string;
  owners: string[];
  expert: string;
  deliverables: SprintGoalDeliverable[];
  definitionOfDone: SprintGoalDoneCriterion[];
  workItemIds: number[];
  subGoals: SprintGoalSubGoal[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export async function fetchSprintGoals(team: DeveloperTeamId, signal?: AbortSignal): Promise<SprintGoal[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/sprint-goals?team=${team}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load sprint goals for team ${team}: HTTP ${response.status}`);
  }
  const raw = (await response.json()) as SprintGoal[];
  // The backend DTO's collection fields are nullable (C# `IReadOnlyCollection<T>?`) and come
  // back as JSON `null` whenever a Wiki page's table doesn't populate them - normalize to empty
  // arrays here so nothing downstream needs to null-check before calling .length/.map.
  return raw.map((g) => ({
    ...g,
    owners: g.owners ?? [],
    deliverables: g.deliverables ?? [],
    definitionOfDone: g.definitionOfDone ?? [],
    workItemIds: g.workItemIds ?? [],
    subGoals: (g.subGoals ?? []).map((s) => ({ ...s, workItemIds: s.workItemIds ?? [] })),
  }));
}
