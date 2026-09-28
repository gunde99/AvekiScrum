import type { DailyStoryDto } from "../../api/dailys";
import { fullPersonName } from "../../lib/personNames";

/**
 * The three ways a card can be presented at sprint review. Every card the team worked on gets
 * exactly one of these tags before the meeting, and this board exists to make that sorting quick.
 */
export type ReviewLaneKey = "muntligt" | "skriftligt" | "visning";

export interface ReviewLane {
  key: ReviewLaneKey;
  /** The Azure tag written to the card. */
  tag: string;
  label: string;
  /** One line on what happens to these cards at the review. */
  hint: string;
  icon: string;
  /** Heading for this lane in the preview walk-through and the published report. */
  previewTitle: string;
}

/**
 * Order matters: Visning first. It's the lane that costs the meeting the most time, so it's the
 * one people want to see and revise, and it should be the shortest drag from the card list.
 */
export const REVIEW_LANES: ReviewLane[] = [
  {
    key: "visning",
    tag: "Review_Visning",
    label: "Visning",
    hint: "Demas live för deltagarna.",
    icon: "🖥️",
    /** Heading used in the preview walk-through and in the Teams report. */
    previewTitle: "Det här ska demas",
  },
  {
    key: "muntligt",
    tag: "Review_Muntligt",
    label: "Muntligt",
    hint: "Berättas kort - ingen demo behövs.",
    icon: "🗣️",
    previewTitle: "Det här ska vi prata om",
  },
  {
    key: "skriftligt",
    tag: "Review_Skriftligt",
    label: "Skriftligt",
    hint: "Sammanfattas i text, tas inte upp på mötet.",
    icon: "📝",
    previewTitle: "Det här ska vi bara förmedla i skrift",
  },
];

export const REVIEW_TAGS = REVIEW_LANES.map((l) => l.tag);

function normalize(tag: string): string {
  return tag.trim().toLowerCase();
}

/** The lane a card has already been sorted into, or null while it's still unsorted. */
export function laneOf(story: DailyStoryDto): ReviewLaneKey | null {
  const tags = (story.tags ?? []).map(normalize);
  return REVIEW_LANES.find((lane) => tags.includes(normalize(lane.tag)))?.key ?? null;
}

/**
 * The card's tags with every review tag stripped and `lane`'s added (or none, when clearing).
 * A card belongs in exactly one lane, so moving it between panels has to remove the old tag as
 * well as add the new one - otherwise it would show up in two panels at once.
 */
export function tagsForLane(story: DailyStoryDto, lane: ReviewLane | null): string[] {
  const withoutReview = (story.tags ?? []).filter((t) => !REVIEW_TAGS.some((r) => normalize(r) === normalize(t)));
  return lane ? [...withoutReview, lane.tag] : withoutReview;
}

// Closed/Done first (nothing left to decide about them), New last (furthest from ready) - matches
// how the daily board's own status filter orders things.
const STATUS_PRIORITY = ["Closed", "Done", "Resolved", "Active", "New"];

function statusPriority(status: string): number {
  const index = STATUS_PRIORITY.indexOf(status);
  return index < 0 ? STATUS_PRIORITY.length : index;
}

export interface StatusGroup {
  status: string;
  stories: DailyStoryDto[];
}

/** Cards with no sprint goal, grouped by Azure status - Closed first, New last. Used for the
 *  "(Inget sprintmål)" catch-all group, which otherwise has nothing else in common to sort by. */
export function groupByStatus(stories: DailyStoryDto[]): StatusGroup[] {
  const byStatus = new Map<string, DailyStoryDto[]>();
  for (const story of stories) {
    const key = story.azureStatus || "Okänd";
    const list = byStatus.get(key);
    if (list) list.push(story);
    else byStatus.set(key, [story]);
  }
  return [...byStatus.entries()]
    .sort(([a], [b]) => statusPriority(a) - statusPriority(b))
    .map(([status, groupStories]) => ({ status, stories: groupStories }));
}

export const UNASSIGNED_DEV_LABEL = "Ej tilldelad";

export interface DeveloperGroup {
  label: string;
  stories: DailyStoryDto[];
}

/**
 * Groups a panel's already-sorted cards by developer, alphabetically with "Ej tilldelad" last.
 * Deliberately simpler than dailysLogic's buildGroups("developer", ...): that one also surfaces
 * task/PR participants for the sprint-wide list, which isn't the question here - a panel just
 * needs "whose card is this."
 */
export function groupByDeveloper(stories: DailyStoryDto[]): DeveloperGroup[] {
  const byDev = new Map<string, DailyStoryDto[]>();
  for (const story of stories) {
    const key = fullPersonName(story.developer) || UNASSIGNED_DEV_LABEL;
    const list = byDev.get(key);
    if (list) list.push(story);
    else byDev.set(key, [story]);
  }
  const names = [...byDev.keys()].filter((k) => k !== UNASSIGNED_DEV_LABEL).sort((a, b) => a.localeCompare(b, "sv"));
  const groups = names.map((label) => ({ label, stories: byDev.get(label)! }));
  const unassigned = byDev.get(UNASSIGNED_DEV_LABEL);
  if (unassigned) groups.push({ label: UNASSIGNED_DEV_LABEL, stories: unassigned });
  return groups;
}
