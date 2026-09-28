import type { ProductBacklogItem, ProductBacklogResponse } from "../../api/refinement";
import type { WorkItemRelationRef } from "../../api/workitems";
import type { DeveloperTeamId } from "../../api/dailys";

/** Lets a ProductBacklogItem render through WorkItemRefCard - the same richer relation-card look
 *  used everywhere else a Feature's hierarchy shows up. createdDate/isBlocked aren't part of the
 *  Refinement response (neither is read by that card), so they're stubbed rather than plumbed
 *  through the backend for a value nothing displays. */
export function toRelationRef(item: ProductBacklogItem): WorkItemRelationRef {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    state: item.state,
    activity: null,
    assignedTo: item.assignedTo,
    createdDate: null,
    isBlocked: false,
    storyPoints: item.storyPoints,
  };
}

export function isItemDone(state: string): boolean {
  const s = state.trim().toLowerCase();
  return s === "closed" || s === "done" || s === "removed";
}

export type StatusFilterKey = "all" | "open" | "done";

export const STATUS_FILTER_OPTIONS: { key: StatusFilterKey; label: string }[] = [
  { key: "all", label: "Status: alla" },
  { key: "open", label: "Ej klara" },
  { key: "done", label: "Klara" },
];

export function matchesStatusFilter(item: ProductBacklogItem, filter: StatusFilterKey): boolean {
  if (filter === "all") return true;
  return filter === "done" ? isItemDone(item.state) : !isItemDone(item.state);
}

/** Exact, case-insensitive tag match - used by the "Taggade kort" source to pick the actual
 *  matches back out of a response that also carries each match's Epic/Feature ancestors (fetched
 *  for the EpicChain, but themselves untagged unless they happen to carry the tag too). */
export function matchesTag(item: ProductBacklogItem, tag: string): boolean {
  const t = tag.trim().toLowerCase();
  return item.tags.some((x) => x.toLowerCase() === t);
}

/** The other team's PO - their cards sitting in this team's area path/tag scope are cross-team
 *  noise for refinement, not this team's own backlog, so team-scoped sources hide them by default. */
const OTHER_TEAM_PO: Record<DeveloperTeamId, string> = {
  Nord: "Andreas Petersson",
  Syd: "Maria Fagrell",
};

export function isOtherTeamPoCard(item: ProductBacklogItem, team: DeveloperTeamId): boolean {
  const blocked = OTHER_TEAM_PO[team];
  return !!blocked && !!item.createdBy && item.createdBy.trim().toLowerCase() === blocked.toLowerCase();
}

export function matchesSearch(item: ProductBacklogItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    String(item.id).includes(q) ||
    item.title.toLowerCase().includes(q) ||
    item.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function itemsById(backlog: ProductBacklogResponse): Map<number, ProductBacklogItem> {
  return new Map(backlog.items.map((i) => [i.id, i]));
}

/** The Epic chain above a Feature, topmost first - empty if the Feature has no parent. */
export function epicChain(item: ProductBacklogItem, byId: Map<number, ProductBacklogItem>): ProductBacklogItem[] {
  const chain: ProductBacklogItem[] = [];
  const seen = new Set<number>();
  let current = item.parentId != null ? byId.get(item.parentId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId != null ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function childItems(item: ProductBacklogItem, byId: Map<number, ProductBacklogItem>): ProductBacklogItem[] {
  return item.childIds.map((id) => byId.get(id)).filter((x): x is ProductBacklogItem => !!x);
}

export type BacklogSectionKind = "icebox" | "closed" | "row";

/** One board column's worth of Features within a row - "Gemensamt", "myCarta", etc. Only row-kind
 *  sections are split into lanes; Icebox/Closed show a flat list instead (see buildBacklogSections). */
export interface BacklogLane {
  key: string;
  label: string;
  order: number;
  features: ProductBacklogItem[];
}

export interface BacklogSection {
  key: string;
  label: string;
  kind: BacklogSectionKind;
  color: string | null;
  order: number;
  features: ProductBacklogItem[];
  lanes: BacklogLane[];
}

/** Azure's own row colours, for when the board's row config doesn't carry one (some boards were
 *  set up before custom row colours existed, or a row was added since) - keeps the four known
 *  priority lanes visually the same everywhere in the app instead of falling back to plain grey. */
const KNOWN_ROW_COLORS: Record<string, string> = {
  Måste: "c50f2e",
  Bör: "ed2939",
  Önskvärt: "f59e42",
  Extra: "9dbf21",
};

function rowColor(name: string, azureColor: string | null): string | null {
  return azureColor ?? KNOWN_ROW_COLORS[name] ?? null;
}

/**
 * Groups a product backlog's Features into the board's own sections: Icebox first, then each
 * swimlane row in board order, Closed last. A Feature's *column* decides Icebox/Closed (those are
 * board-wide special columns, not per-row); everything else is grouped by its *row* (swimlane),
 * then further split into one lane per remaining board column - mirrors how the Planeringsboard's
 * "Flytta kort"-vy renders the product backlog (each row is itself a strip of per-column lanes).
 */
export function buildBacklogSections(
  backlog: ProductBacklogResponse,
  filter: (item: ProductBacklogItem) => boolean,
): BacklogSection[] {
  const board = backlog.board;
  if (!board) return [];

  const byId = itemsById(backlog);
  const columnKindByName = new Map(board.columns.map((c) => [c.name, c.kind]));
  const rowByName = new Map(board.rows.map((r) => [r.name, r]));
  const laneColumns = board.columns.filter((c) => c.kind === "lane").sort((a, b) => a.order - b.order);

  const sections = new Map<string, BacklogSection>();
  const hasIcebox = board.columns.some((c) => c.kind === "icebox");
  const hasClosed = board.columns.some((c) => c.kind === "closed");
  if (hasIcebox) sections.set("icebox", { key: "icebox", label: "Icebox", kind: "icebox", color: null, order: -2, features: [], lanes: [] });
  for (const row of board.rows) {
    sections.set(`row:${row.name}`, {
      key: `row:${row.name}`,
      label: row.name,
      kind: "row",
      color: rowColor(row.name, row.color),
      order: row.order,
      features: [],
      lanes: [],
    });
  }
  if (hasClosed) sections.set("closed", { key: "closed", label: "Closed", kind: "closed", color: null, order: 1_000_000, features: [], lanes: [] });

  for (const featureId of backlog.featureIds) {
    const feature = byId.get(featureId);
    if (!feature || !filter(feature)) continue;

    const columnKind = feature.boardColumn ? columnKindByName.get(feature.boardColumn) : undefined;
    const key =
      columnKind === "icebox" ? "icebox" : columnKind === "closed" ? "closed" : `row:${feature.boardLane ?? "Standard"}`;
    let section = sections.get(key);
    if (!section) {
      // A lane Azure reports on the item but that wasn't in the board's own row list - keep it
      // visible rather than silently dropping the Feature.
      const row = feature.boardLane ? rowByName.get(feature.boardLane) : undefined;
      const name = feature.boardLane ?? "Standard";
      section = { key, label: name, kind: "row", color: rowColor(name, row?.color ?? null), order: 999, features: [], lanes: [] };
      sections.set(key, section);
    }
    section.features.push(feature);
  }

  // Row sections split into one lane per board column - Icebox/Closed stay flat (features[]).
  for (const section of sections.values()) {
    if (section.kind !== "row") continue;
    const lanes = new Map<string, BacklogLane>(
      laneColumns.map((c) => [c.name, { key: `${section.key}::${c.name}`, label: c.name, order: c.order, features: [] }]),
    );
    for (const f of section.features) {
      const columnName = f.boardColumn || "Övrigt";
      let lane = lanes.get(columnName);
      if (!lane) {
        lane = { key: `${section.key}::${columnName}`, label: columnName, order: 999, features: [] };
        lanes.set(columnName, lane);
      }
      lane.features.push(f);
    }
    section.lanes = [...lanes.values()].sort((a, b) => a.order - b.order);
  }

  return [...sections.values()].sort((a, b) => a.order - b.order);
}

export interface SprintGroup {
  /** null groups everything that couldn't be traced up to a Feature. */
  feature: ProductBacklogItem | null;
  chain: ProductBacklogItem[];
  children: ProductBacklogItem[];
}

/**
 * The "sprint" source has no board/swimlanes - just a flat set of User Stories/Bugs, grouped here
 * by whichever Feature each one traces up to (its Feature is rarely itself scheduled into the
 * sprint, so it's fetched separately - see GetRefinementSprintAsync on the backend).
 */
export function buildSprintGroups(backlog: ProductBacklogResponse): SprintGroup[] {
  const byId = itemsById(backlog);
  const featureIds = new Set(backlog.featureIds);
  const leaves = backlog.items.filter((i) => i.type !== "Feature" && i.type !== "Epic");

  const groups = new Map<number | null, SprintGroup>();
  for (const leaf of leaves) {
    let featureId: number | null = null;
    const seen = new Set<number>();
    let cursor = leaf.parentId != null ? byId.get(leaf.parentId) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      if (featureIds.has(cursor.id)) {
        featureId = cursor.id;
        break;
      }
      cursor = cursor.parentId != null ? byId.get(cursor.parentId) : undefined;
    }

    let group = groups.get(featureId);
    if (!group) {
      const feature = featureId != null ? byId.get(featureId) ?? null : null;
      group = { feature, chain: feature ? epicChain(feature, byId) : [], children: [] };
      groups.set(featureId, group);
    }
    group.children.push(leaf);
  }

  return [...groups.values()].sort((a, b) => (a.feature?.title ?? "￿").localeCompare(b.feature?.title ?? "￿", "sv"));
}
