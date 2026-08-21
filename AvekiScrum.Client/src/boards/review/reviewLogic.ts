import type { DailyStoryDto } from "../../api/dailys";

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
