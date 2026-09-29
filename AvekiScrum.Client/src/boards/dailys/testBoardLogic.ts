import type { DailyStoryDto, DailyTaskDto } from "../../api/dailys";
import { isStoryDone, isTestTask, UNASSIGNED_GROUP_LABEL, type SortDir } from "./dailysLogic";

/** A test task's own status says where it is in its own lifecycle, but whether it can be picked up
 *  depends on its parent story having reached one of these. */
export const TEST_READY_PARENT_STATES = new Set(["Resolved", "Closed", "Done"]);

export function testResultFromTags(tags: string[]): "ok" | "notok" | null {
  const lower = tags.map((t) => t.trim().toLowerCase());
  if (lower.includes("test ej ok")) return "notok";
  if (lower.includes("test ok")) return "ok";
  return null;
}

/** T-shirt-size tags for how big a test is - "S"/"M"/"L"/"XL", exactly (not e.g. "ange storlek
 *  (S/M/L)", the reminder tag someone puts on an untriaged task - that's a prompt, not a value). */
export const TEST_SIZES = ["XL", "L", "M", "S"] as const;
export type TestSize = (typeof TEST_SIZES)[number];

export function testSizeTag(tags: string[] | undefined): TestSize | null {
  if (!tags) return null;
  return TEST_SIZES.find((size) => tags.includes(size)) ?? null;
}

export interface TestTaskRow extends DailyTaskDto {
  storyId: number;
  storyTitle: string;
  /** "User Story" | "Bug" - which icon to show in front of the story reference. */
  storyType: string;
  /** The parent card's owner - "Utvecklare" grouping is by this, not by the test task's own assignee. */
  storyDeveloper: string | null;
  storySprintGoal: string;
  storyAzureStatus: string;
  /** Only needed to build a real Azure DevOps link for the static export - the live board opens
   *  the story in-app via storyId instead. */
  storyWebUrl: string;
  parentReady: boolean;
  parentClosed: boolean;
  /** Which sprint this row came from - set by TestTaskBoard when it merges in extra iterations
   *  (see its extraIterations prop), left undefined for a plain single-iteration board. Not set by
   *  buildTestTaskRows itself, since it has no notion of "which sprint" its input belongs to. */
  sprintLabel?: string;
  sprintPath?: string;
}

export function buildTestTaskRows(stories: DailyStoryDto[]): TestTaskRow[] {
  return stories.flatMap((s) =>
    (s.tasks ?? [])
      .filter(isTestTask)
      .map((t) => ({
        ...t,
        storyId: s.id,
        storyTitle: s.title,
        storyType: s.type,
        storyDeveloper: s.developer,
        storySprintGoal: s.sprintGoal,
        storyAzureStatus: s.azureStatus,
        storyWebUrl: s.webUrl,
        parentReady: TEST_READY_PARENT_STATES.has(s.azureStatus),
        parentClosed: isStoryDone(s),
      })),
  );
}

/** 1-4, same colours everywhere else in the app shows priority (see PlanningSprintGoalMarkdownParser's
 *  PriorityEmoji on the backend) - red is the most urgent, green the least. */
export const PRIORITY_LABELS: Record<number, string> = {
  1: "P1 – Hög",
  2: "P2 – Standard",
  3: "P3 – Lägre",
  4: "P4 – Lägst",
};

export const PRIORITY_EMOJI: Record<number, string> = {
  1: "🔴",
  2: "🔵",
  3: "🟡",
  4: "🟢",
};

export type TestStatusBucket =
  | "anomaly"
  | "awaitingFix"
  | "shouldClose"
  | "awaitingParentClose"
  | "blocked"
  | "inProgress"
  | "readyToTest"
  | "assignedNotStarted"
  | "notReady"
  | "done";

export const TEST_STATUS_LABELS: Record<TestStatusBucket, string> = {
  anomaly: "Avvikelse – stängd men Test ej OK",
  awaitingFix: "Inväntar utvecklarens respons",
  shouldClose: "Test OK – borde stängas",
  awaitingParentClose: "Testet klart – väntar på att huvudkortet stängs",
  blocked: "Blockerad",
  inProgress: "Under test",
  readyToTest: "Redo att testas – ej tilldelad",
  assignedNotStarted: "Tilldelad – ej påbörjad",
  notReady: "Förberedd – huvudkortet inte klart",
  done: "Klart",
};

/** Most actionable first, "nothing to do here" last - matches the order sections render in. */
export const TEST_STATUS_ORDER: TestStatusBucket[] = [
  "anomaly",
  "awaitingFix",
  "shouldClose",
  "awaitingParentClose",
  "blocked",
  "inProgress",
  "readyToTest",
  "assignedNotStarted",
  "notReady",
  "done",
];

/** Nothing left to act on in these - collapsed by default so they don't crowd out the rows that
 *  actually need someone's attention. */
export const TEST_STATUS_COLLAPSED_BY_DEFAULT: ReadonlySet<TestStatusBucket> = new Set(["done", "notReady"]);

/**
 * The task's own Azure status only tells half the story - whether it's actually ready or done also
 * depends on the parent story's status and the "Test OK"/"Test ej OK" verdict tags. Checked in
 * priority order: a closed task is judged first (the most definitive state - a verdict tag on a
 * closed task is either confirmation or a contradiction worth flagging), then whether the parent
 * story is even ready yet, then whether something's actively blocking it, then the verdict tags,
 * then plain progress.
 */
export function classifyTestStatus(row: TestTaskRow): TestStatusBucket {
  const closed = (row.status || "").trim().toLowerCase() === "closed";
  const verdict = testResultFromTags(row.tags);

  if (closed) {
    // Closed but marked "didn't pass" is a contradiction someone should look at, not a normal
    // "done" - it means either the tag or the closure is wrong.
    if (verdict === "notok") return "anomaly";
    return row.parentClosed ? "done" : "awaitingParentClose";
  }
  // Parent-readiness is checked before the task's own status/tags: a test task started early
  // (or tagged early) on a story that hasn't reached Resolved yet is still just "prepared", not
  // actually actionable.
  if (!row.parentReady) return "notReady";
  if (row.isBlocked) return "blocked";
  if (verdict === "notok") return "awaitingFix";
  if (verdict === "ok") return "shouldClose";
  if (row.status === "Active") return "inProgress";
  // Both are waiting to actually be started, but for different reasons: one still needs a tester,
  // the other already has one and is just sitting in their queue.
  return row.assignedTo && row.assignedTo.trim() ? "assignedNotStarted" : "readyToTest";
}

export type TestGroupMode = "status" | "tester" | "developer" | "sprintgoal" | "none";

export const TEST_GROUP_MODE_LABELS: Record<TestGroupMode, string> = {
  status: "Status",
  tester: "Testare",
  developer: "Utvecklare",
  sprintgoal: "Sprintmål",
  none: "Ogrupperat",
};

export interface TestTaskGroup {
  key: string;
  label: string;
  tasks: TestTaskRow[];
  collapsedByDefault: boolean;
}

function groupByKey(rows: TestTaskRow[], keyFn: (r: TestTaskRow) => string | null): TestTaskGroup[] {
  const map = new Map<string, TestTaskRow[]>();
  for (const row of rows) {
    const raw = keyFn(row);
    const label = raw && raw.trim() ? raw.trim() : UNASSIGNED_GROUP_LABEL;
    const list = map.get(label) ?? [];
    list.push(row);
    map.set(label, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === UNASSIGNED_GROUP_LABEL) return 1;
      if (b === UNASSIGNED_GROUP_LABEL) return -1;
      return a.localeCompare(b, "sv");
    })
    .map(([label, tasks]) => ({ key: label, label, tasks, collapsedByDefault: false }));
}

export function groupTestTasks(rows: TestTaskRow[], mode: TestGroupMode): TestTaskGroup[] {
  if (rows.length === 0) return [];

  if (mode === "none") {
    return [{ key: "all", label: "Alla test-tasks", tasks: rows, collapsedByDefault: false }];
  }

  if (mode === "status") {
    const byBucket = new Map<TestStatusBucket, TestTaskRow[]>();
    for (const row of rows) {
      const bucket = classifyTestStatus(row);
      const list = byBucket.get(bucket) ?? [];
      list.push(row);
      byBucket.set(bucket, list);
    }
    return TEST_STATUS_ORDER.filter((b) => byBucket.has(b)).map((b) => ({
      key: b,
      label: TEST_STATUS_LABELS[b],
      tasks: byBucket.get(b)!,
      collapsedByDefault: TEST_STATUS_COLLAPSED_BY_DEFAULT.has(b),
    }));
  }

  if (mode === "tester") return groupByKey(rows, (r) => r.assignedTo);
  if (mode === "developer") return groupByKey(rows, (r) => r.storyDeveloper);
  return groupByKey(rows, (r) => r.storySprintGoal); // sprintgoal
}

export type TestSortKey = "title" | "status" | "tester" | "changed";

export const TEST_SORT_LABELS: Record<TestSortKey, string> = {
  title: "Titel",
  status: "Status",
  tester: "Testare",
  changed: "Status sedan",
};

export function sortTestTasks(rows: TestTaskRow[], key: TestSortKey, dir: SortDir): TestTaskRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case "title":
        return factor * a.title.localeCompare(b.title, "sv");
      case "status":
        return factor * (TEST_STATUS_ORDER.indexOf(classifyTestStatus(a)) - TEST_STATUS_ORDER.indexOf(classifyTestStatus(b)));
      case "tester":
        return factor * (a.assignedTo ?? "").localeCompare(b.assignedTo ?? "", "sv");
      case "changed":
      default: {
        const da = ageSourceDate(a, classifyTestStatus(a));
        const db = ageSourceDate(b, classifyTestStatus(b));
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return factor * da.localeCompare(db);
      }
    }
  });
}

export function matchesTestSearch(row: TestTaskRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.title.toLowerCase().includes(q) || row.storyTitle.toLowerCase().includes(q) || String(row.id).includes(q);
}

/** Not "active" - that name is reserved for the status filter buttons' own selected/deselected
 *  modifier (test-board__status--active), and reusing it here made the "Under test" filter button
 *  look permanently selected regardless of whether it actually was. "neutral" gives the three
 *  tone-less buckets their own class to key the filter buttons' active styling off - without it, a
 *  selected "Redo att testas" chip had nothing but the shared opacity rule to go on and never
 *  actually looked selected. Also maps a bucket onto DailyFlow.css's existing
 *  .daily-flow__list-status--* palette for the row badges, reused rather than invented fresh. */
export function statusBadgeClass(bucket: TestStatusBucket): string {
  switch (bucket) {
    case "anomaly":
    case "awaitingFix":
      return "notok";
    case "shouldClose":
    case "done":
      return "ok";
    case "blocked":
      return "blocked";
    case "inProgress":
      return "inprogress";
    case "awaitingParentClose":
    case "readyToTest":
    case "assignedNotStarted":
    case "notReady":
      return "neutral";
  }
}

/** Which date "tid i status" is measured from. Normally the task's own last status change - but
 *  an assigned-and-not-started task hasn't changed status since it became ready; what's actually
 *  aging is how long it's sat with its tester, so that bucket measures from when it got assigned
 *  instead. */
export function ageSourceDate(row: TestTaskRow, bucket: TestStatusBucket): string | null {
  return bucket === "assignedNotStarted" ? row.assignedDate ?? row.statusChangedDate : row.statusChangedDate;
}

/** The verb statusAge's tooltip uses for whichever date ageSourceDate picked. */
export function ageChangeLabel(bucket: TestStatusBucket): string {
  return bucket === "assignedNotStarted" ? "Tilldelad" : "Statusen ändrades";
}

export interface StatusAge {
  text: string;
  title: string;
  tone: "fresh" | "aging" | "stale" | "unknown";
}

/** How long a test task has sat in its current status (or, for an assigned-not-started task, with
 *  its tester - see ageSourceDate) - shown on the board and included as-of export time in the
 *  static export, so a stale row is just as visible in the handed-off file. `changeLabel` only
 *  changes the tooltip's wording, not what's measured - the caller picks it to match whichever
 *  date it actually passed in. */
export function statusAge(value: string | null, changeLabel = "Statusen ändrades"): StatusAge {
  if (!value) return { text: "Okänd tid", title: "Datum saknas.", tone: "unknown" };
  const changed = new Date(value);
  if (Number.isNaN(changed.getTime())) return { text: "Okänd tid", title: "Datumet kan inte läsas.", tone: "unknown" };

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - changed.getTime()) / 60_000));
  const days = Math.floor(elapsedMinutes / 1_440);
  const hours = Math.floor(elapsedMinutes / 60);
  const text = days > 0 ? (days === 1 ? "1 dag" : `${days} dagar`)
    : hours > 0 ? (hours === 1 ? "1 timme" : `${hours} timmar`)
      : elapsedMinutes > 0 ? `${elapsedMinutes} min` : "Nyss";
  const tone = days >= 7 ? "stale" : days >= 3 ? "aging" : "fresh";
  const title = `${changeLabel} ${changed.toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" })}.`;
  return { text, title, tone };
}
