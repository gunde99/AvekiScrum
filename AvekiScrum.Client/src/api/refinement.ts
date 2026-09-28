import { apiFetch, describeFailure } from "../lib/apiFetch";
import type { DeveloperTeamId } from "./dailys";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

export interface RefinementTeam {
  id: string;
  name: string;
}

export interface ProductBacklogRow {
  name: string;
  color: string | null;
  order: number;
}

/** Icebox and Closed render as their own top-level sections rather than as a column inside every
 *  row - see refinementLogic's section grouping. */
export type ProductBacklogColumnKind = "icebox" | "lane" | "closed";

export interface ProductBacklogColumn {
  name: string;
  kind: ProductBacklogColumnKind;
  order: number;
}

export interface ProductBacklogBoard {
  id: string;
  name: string;
  team: string;
  rows: ProductBacklogRow[];
  columns: ProductBacklogColumn[];
}

/**
 * One Feature/Epic/User Story/Bug. The board-specific fields are only set on a Feature fetched
 * through the product backlog - null on everything else (its Epic chain above, its User
 * Stories/Bugs below).
 */
export interface ProductBacklogItem {
  id: number;
  type: string;
  title: string;
  state: string;
  assignedTo: string | null;
  createdBy: string | null;
  storyPoints: number | null;
  tags: string[];
  parentId: number | null;
  childIds: number[];
  boardLane: string | null;
  boardColumn: string | null;
  stackRank: number | null;
}

/** board is null in "sprint" mode - no swimlanes, just that sprint's own hierarchy. */
export interface ProductBacklogResponse {
  board: ProductBacklogBoard | null;
  featureIds: number[];
  items: ProductBacklogItem[];
}

export async function fetchRefinementTeams(signal?: AbortSignal): Promise<RefinementTeam[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/refinement/teams`, { signal });
  if (!response.ok) throw new Error(await describeFailure(response, "Kunde inte hämta Azure DevOps-team"));
  return (await response.json()) as RefinementTeam[];
}

export interface FetchProductBacklogParams {
  boardTeam?: string;
  tag?: string;
  iteration?: string;
  areaPath?: string;
}

export async function fetchProductBacklog(
  params: FetchProductBacklogParams,
  signal?: AbortSignal,
): Promise<ProductBacklogResponse> {
  const qs = new URLSearchParams();
  if (params.boardTeam) qs.set("boardTeam", params.boardTeam);
  if (params.tag) qs.set("tag", params.tag);
  if (params.iteration) qs.set("iteration", params.iteration);
  if (params.areaPath) qs.set("areaPath", params.areaPath);
  const response = await apiFetch(`${API_BASE_URL}/api/refinement/productbacklog?${qs.toString()}`, { signal });
  if (!response.ok) throw new Error(await describeFailure(response, "Kunde inte hämta produktbackloggen"));
  return (await response.json()) as ProductBacklogResponse;
}

export async function fetchRefinementSprint(
  team: DeveloperTeamId,
  iteration: string,
  signal?: AbortSignal,
): Promise<ProductBacklogResponse> {
  const qs = new URLSearchParams({ team, iteration });
  const response = await apiFetch(`${API_BASE_URL}/api/refinement/sprint?${qs.toString()}`, { signal });
  if (!response.ok) throw new Error(await describeFailure(response, "Kunde inte hämta sprintens kort"));
  return (await response.json()) as ProductBacklogResponse;
}

/** "Taggade kort" - releaseFolder is the same value SprintOption.releaseFolder already carries
 *  (e.g. "Utveckling\27.1"), one level up from a single sprint's path. */
export async function fetchRefinementTagged(
  team: DeveloperTeamId,
  releaseFolder: string,
  signal?: AbortSignal,
): Promise<ProductBacklogResponse> {
  const qs = new URLSearchParams({ team, release: releaseFolder });
  const response = await apiFetch(`${API_BASE_URL}/api/refinement/tagged?${qs.toString()}`, { signal });
  if (!response.ok) throw new Error(await describeFailure(response, "Kunde inte hämta taggade kort"));
  return (await response.json()) as ProductBacklogResponse;
}

/** "Custom Search" - an id or a title fragment, matched project-wide. */
export async function fetchRefinementSearch(query: string, signal?: AbortSignal): Promise<ProductBacklogResponse> {
  const qs = new URLSearchParams({ q: query });
  const response = await apiFetch(`${API_BASE_URL}/api/refinement/search?${qs.toString()}`, { signal });
  if (!response.ok) throw new Error(await describeFailure(response, "Kunde inte söka bland korten"));
  return (await response.json()) as ProductBacklogResponse;
}
