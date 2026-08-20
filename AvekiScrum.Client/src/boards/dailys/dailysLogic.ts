import type { DailyPullRequestDto, DailyStoryDto, DailyTaskDto } from "../../api/dailys";
import { fullPersonName, personKey, samePerson, uniqueNames } from "../../lib/personNames";

export { fullPersonName, compactPersonName, personKey, samePerson, uniqueNames, reviewerNames } from "../../lib/personNames";

// ─── Progress / status helpers ────────────────────────────
export function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0;
}

/**
 * A card's state on the board, taken from its Azure state - the same axis the Status filter
 * offers (New / Active / Resolved / Closed).
 *
 * Not to be confused with `story.stage`, which is the *development flow* position derived from
 * the card's tasks (Development → CodeReview → Testing → Done). The two genuinely disagree: a
 * card can be Closed while a test task under it is still open, so it sits at stage "CodeReview".
 * Counting "klara" by stage is what made filtering on Closed report 16 of 22 done - every number
 * a person is meant to trust therefore counts by state, and stage is left to drive the flow
 * visuals it was built for.
 */
export type StoryStatusBucket = "done" | "active" | "new";

export function storyStatusBucket(s: DailyStoryDto): StoryStatusBucket {
  const state = (s.azureStatus || "").trim().toLowerCase();
  if (state === "closed" || state === "done") return "done";
  if (state === "new" || state === "proposed" || state === "") return "new";
  return "active"; // Active, Resolved, and any custom in-between state
}

export function isStoryDone(s: DailyStoryDto): boolean {
  return storyStatusBucket(s) === "done";
}

export interface StoryStats {
  total: number;
  done: number;
  active: number;
  newCount: number;
  totalSP: number;
  doneSP: number;
  /** Share of story points delivered, or - when nothing is pointed - share of cards closed, so a
   *  fully finished group of unpointed cards doesn't read as 0%. */
  progress: number;
  /** True when `progress` had to fall back to counting cards. */
  progressFromCards: boolean;
}

export function summarizeStories(stories: DailyStoryDto[]): StoryStats {
  const done = stories.filter((s) => storyStatusBucket(s) === "done").length;
  const active = stories.filter((s) => storyStatusBucket(s) === "active").length;
  const newCount = stories.filter((s) => storyStatusBucket(s) === "new").length;
  const totalSP = stories.reduce((a, s) => a + (s.storyPoints || 0), 0);
  const doneSP = stories.filter(isStoryDone).reduce((a, s) => a + (s.storyPoints || 0), 0);
  const progressFromCards = totalSP === 0;
  return {
    total: stories.length,
    done,
    active,
    newCount,
    totalSP,
    doneSP,
    progress: progressFromCards ? pct(done, stories.length) : pct(doneSP, totalSP),
    progressFromCards,
  };
}

export function isTestTask(t: DailyTaskDto): boolean {
  const stage = (t.stage || "").toLowerCase();
  const activity = (t.activity || "").toLowerCase();
  return stage === "test" || activity === "testing" || activity === "test";
}

export function isDocumentationTask(t: DailyTaskDto): boolean {
  const stage = (t.stage || "").toLowerCase();
  const activity = (t.activity || "").toLowerCase();
  return stage === "documentation" || activity === "documentation";
}

export function isDevelopmentTask(t: DailyTaskDto): boolean {
  return (
    ["new", "active", "resolved", "done"].includes((t.stage || "").toLowerCase()) &&
    !isTestTask(t) &&
    !isDocumentationTask(t)
  );
}

export function isProgressTaskDone(t: DailyTaskDto): boolean {
  const stage = (t.stage || "").toLowerCase();
  const status = (t.status || "").toLowerCase();
  const activity = (t.activity || "").toLowerCase();
  const isTestOrDoc =
    stage === "test" || stage === "documentation" || activity === "testing" || activity === "test" || activity === "documentation";
  if (isTestOrDoc) return status === "closed" || stage === "done";
  return status === "closed" || stage === "resolved" || stage === "done";
}

export function isPullRequestDone(pr: DailyPullRequestDto): boolean {
  const st = (pr.status || "").toLowerCase();
  return st === "completed" || st === "complete" || st === "merged";
}

export function storyProg(s: DailyStoryDto): number {
  const tasks = s.tasks || [];
  const prs = s.pullRequests || [];
  const total = tasks.length + prs.length;
  if (!total) return 0;
  const doneT = tasks.filter(isProgressTaskDone).length;
  const donePr = prs.filter(isPullRequestDone).length;
  return pct(doneT + donePr, total);
}

export interface TaskPillCounts {
  utv: { count: number; done: boolean };
  pr: { count: number; done: boolean };
  test: { count: number; done: boolean };
  dok: { count: number; done: boolean };
}

export function taskPillCounts(s: DailyStoryDto): TaskPillCounts {
  const tasks = s.tasks || [];
  const prs = s.pullRequests || [];

  const utvTasks = tasks.filter((t) => ["New", "Active", "Resolved", "Done"].includes(t.stage));
  const testTasks = tasks.filter((t) => t.stage === "Test");
  const dokTasks = tasks.filter((t) => t.stage === "Documentation");

  return {
    utv: { count: utvTasks.length, done: utvTasks.length > 0 && utvTasks.every((t) => t.stage === "Done") },
    pr: { count: prs.length, done: prs.length > 0 && prs.every(isPullRequestDone) },
    test: { count: testTasks.length, done: testTasks.length > 0 && testTasks.every((t) => t.status === "Closed") },
    dok: { count: dokTasks.length, done: dokTasks.length > 0 && dokTasks.every((t) => t.status === "Closed") },
  };
}

// ─── DoR (Definition of Ready) task-category status ───────
// Rules (per DoR checklist convention ported from Planeringsboardens Korthygien/Behovsbedömning):
// every US/Bug needs at least one Development-activity task; Test/Documentation-activity tasks
// are optional ("ev.") categories. The "DoR" tag means a conscious decision has already been made
// about every optional category - so an empty Test/Documentation category on a DoR-tagged card is
// not a gap, it is "not needed by decision" and must look different from both "empty/unknown" and
// "done".
export type DorPillState = "empty" | "not-needed" | "in-progress" | "done";

export interface DorPillInfo {
  state: DorPillState;
  tasks: DailyTaskDto[];
}

export interface DorStatus {
  hasDorTag: boolean;
  test: DorPillInfo;
  dok: DorPillInfo;
}

function hasTag(tags: string[] | undefined, tag: string): boolean {
  return (tags ?? []).some((t) => t.trim().toLowerCase() === tag.toLowerCase());
}

function optionalCategoryState(tasks: DailyTaskDto[], hasDorTag: boolean): DorPillState {
  if (tasks.length === 0) return hasDorTag ? "not-needed" : "empty";
  return tasks.every(isProgressTaskDone) ? "done" : "in-progress";
}

export function dorStatus(s: DailyStoryDto): DorStatus {
  const tasks = s.tasks || [];
  const hasDorTag = hasTag(s.tags, "DoR");
  const testTasks = tasks.filter(isTestTask);
  const dokTasks = tasks.filter(isDocumentationTask);

  return {
    hasDorTag,
    test: { state: optionalCategoryState(testTasks, hasDorTag), tasks: testTasks },
    dok: { state: optionalCategoryState(dokTasks, hasDorTag), tasks: dokTasks },
  };
}

const STAGE_LABELS: Record<string, string> = {
  New: "Ny",
  Development: "Aktiv",
  CodeReview: "Granskning",
  Testing: "Test",
  Documentation: "Dokumentation",
  Done: "Klar",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function azureStatusClass(status: string | null | undefined): string {
  const st = (status || "").toLowerCase();
  if (st === "active") return "as-active";
  if (st === "resolved") return "as-resolved";
  if (st === "closed") return "as-closed";
  if (st === "done") return "as-done";
  return "as-new";
}

export function ageLabel(date: string | null | undefined): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (diff === 0) return "idag";
  if (diff === 1) return "1d";
  return `${diff}d`;
}

// ─── Test-status filters ──────────────────────────────────────────────────
export type TestFilterKey = "unassigned" | "notok";

export const TEST_FILTER_LABELS: Record<TestFilterKey, string> = {
  unassigned: "Ej tilldelade",
  notok: "Testade ej OK",
};

/** True when the story has at least one test task matching the given condition. */
export function matchesTestFilter(story: DailyStoryDto, key: TestFilterKey): boolean {
  const testTasks = (story.tasks ?? []).filter(isTestTask);
  if (testTasks.length === 0) return false;
  if (key === "unassigned") return testTasks.some((t) => !t.assignedTo || !t.assignedTo.trim());
  return testTasks.some((t) => (t.tags ?? []).some((tag) => tag.trim().toLowerCase() === "test ej ok"));
}

// ─── Daily-flow participants (who gets a turn at the standup) ─────────────
export interface FlowParticipant {
  /** personKey - the same identity the flow itself matches groups to the roster with. */
  key: string;
  displayName: string;
  /** Cards in this person's group on the board right now; 0 for roster members with nothing. */
  cardCount: number;
  /** On the team's configured developer roster, as opposed to merely owning a card here. */
  isRoster: boolean;
}

/**
 * Everyone the daily flow would otherwise stop at, in one list: the team's roster developers
 * (including anyone currently without cards, who still gets asked how it's going) plus whoever
 * else owns cards on the board. "Ej tilldelad" is left out - it's a bucket, not a person.
 */
export function buildFlowParticipants(groups: StoryGroup[], roster: PersonRef[]): FlowParticipant[] {
  const participants = new Map<string, FlowParticipant>();

  for (const dev of roster) {
    const key = personKey(dev.displayName);
    if (!key) continue;
    const group = groups.find((g) => samePerson(g.label, dev.displayName));
    participants.set(key, {
      key,
      displayName: group?.label ?? dev.displayName,
      cardCount: group?.stories.length ?? 0,
      isRoster: true,
    });
  }

  for (const group of groups) {
    if (group.label === UNASSIGNED_GROUP_LABEL) continue;
    const key = personKey(group.label);
    if (!key || participants.has(key)) continue;
    participants.set(key, { key, displayName: group.label, cardCount: group.stories.length, isRoster: false });
  }

  return [...participants.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "sv-SE", { sensitivity: "base" }));
}

/**
 * Whether a participant takes part by default, before anyone touches the picker: roster
 * developers do, people who merely happen to own a card here (a QA lead, someone from the other
 * team) don't, and anyone named in the backend's DailyFlow:ExcludedByDefault doesn't either.
 */
export function participantOnByDefault(participant: FlowParticipant, excludedByDefault: PersonRef[]): boolean {
  if (excludedByDefault.some((p) => samePerson(p.displayName, participant.displayName))) return false;
  return participant.isRoster;
}

interface PersonRef {
  displayName: string;
}

// ─── "Stäm av med teamet" (cards walked through up front in the daily) ────
export const REVIEW_TAG = "Stäm av med teamet";

function hasReviewTag(tags: string[] | undefined): boolean {
  return (tags ?? []).some((t) => t.trim().toLowerCase() === REVIEW_TAG.toLowerCase());
}

export function withoutReviewTag(tags: string[] | undefined): string[] {
  return (tags ?? []).filter((t) => t.trim().toLowerCase() !== REVIEW_TAG.toLowerCase());
}

/** One card to walk through, plus the work items that actually asked for it. */
export interface ReviewTarget {
  storyId: number;
  title: string;
  /** The story and/or the tasks carrying the tag - what "Ta bort taggen" has to clear. */
  taggedIds: number[];
  /** Titles of the tagged tasks, so the flow can say the request came from a task. */
  taggedTaskTitles: string[];
}

/**
 * The tag is honoured on tasks as well as on stories, because "let's look at this together" is
 * just as often about one task as about the whole card. Either way the *story* is what gets shown
 * - it carries the taskboard and the full context - so several tagged tasks under one story
 * collapse into a single turn rather than making the team open the same card three times.
 */
export function collectReviewTargets(stories: DailyStoryDto[]): ReviewTarget[] {
  return stories
    .map((story) => {
      const taggedTasks = (story.tasks ?? []).filter((t) => hasReviewTag(t.tags));
      const storyTagged = hasReviewTag(story.tags);
      if (!storyTagged && taggedTasks.length === 0) return null;
      return {
        storyId: story.id,
        title: story.title,
        taggedIds: [...(storyTagged ? [story.id] : []), ...taggedTasks.map((t) => t.id)],
        taggedTaskTitles: taggedTasks.map((t) => t.title),
      } satisfies ReviewTarget;
    })
    .filter((t): t is ReviewTarget => t !== null)
    .sort((a, b) => a.storyId - b.storyId);
}

// ─── "Stale closed" (settled work that no longer needs daily airtime) ─────
/** A card closed this many working days ago or fewer still shows on the board. */
export const CLOSED_STALE_WORKING_DAYS = 2;

function parseLocalDate(iso: string): Date | null {
  // Deliberately not `new Date(iso)`: a bare "2026-08-17" is parsed as UTC midnight, which lands
  // on the previous day west of Greenwich and would shift the whole count by one.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Working days (Mon-Fri) elapsed after `iso` up to and including today. Null if undatable. */
export function workingDaysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  const start = iso ? parseLocalDate(iso) : null;
  if (!start) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  let count = 0;
  while (cursor <= today) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * True for cards that have been closed long enough that the team has already seen them go by in
 * a daily or two. Weekends don't count, so a Friday close is still fresh on Tuesday.
 */
export function isStaleClosed(story: DailyStoryDto, now: Date = new Date()): boolean {
  const status = (story.azureStatus || "").toLowerCase();
  if (status !== "closed" && status !== "done") return false;
  const days = workingDaysSince(story.completedDate, now);
  // Undatable close - keep it visible rather than hiding something we can't reason about.
  if (days === null) return false;
  return days > CLOSED_STALE_WORKING_DAYS;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("sv-SE", { month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─── Sorting ───────────────────────────────────────────────
export type SortKey = "id" | "title" | "developer" | "azureStatus" | "lastChangedDate" | "storyPoints" | "stageLabel" | "progress";
export type SortDir = "asc" | "desc";

function sortValue(s: DailyStoryDto, key: SortKey): number | string {
  switch (key) {
    case "id":
      return s.id;
    case "title":
      return s.title || "";
    case "developer":
      return fullPersonName(s.developer);
    case "azureStatus":
      return s.azureStatus || "";
    case "lastChangedDate":
      return s.lastChangedDate ? new Date(s.lastChangedDate).getTime() : 0;
    case "storyPoints":
      return s.storyPoints || 0;
    case "stageLabel":
      return s.stageLabel || stageLabel(s.stage);
    case "progress":
      return storyProg(s);
    default:
      return 0;
  }
}

export function sortStories<T extends DailyStoryDto>(stories: T[], key: SortKey, dir: SortDir): T[] {
  return [...stories].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), "sv-SE", { numeric: true, sensitivity: "base" });
    if (cmp === 0) cmp = a.id - b.id;
    return dir === "desc" ? -cmp : cmp;
  });
}

// ─── Grouping ──────────────────────────────────────────────
export type GroupMode = "goals" | "developer" | "none";

export const UNASSIGNED_GROUP_LABEL = "Ej tilldelad";

/** The 4 Utvecklingsflöde kanban lanes a dev task can be dragged between. */
export type FlowLaneStage = "New" | "Active" | "Resolved" | "Done";

export type DevRoleBucket = "owner" | "partner" | "involved" | "tester";

export interface DevRoleSubGroup {
  key: DevRoleBucket;
  label: string;
  stories: (DailyStoryDto & { roleText?: string })[];
}

export interface StoryGroup {
  id: string;
  label: string;
  mode: GroupMode;
  goals?: string[];
  stories: (DailyStoryDto & { roleText?: string })[];
  /** Developer-mode only: the same stories as `stories`, split by why they belong to this
   *  person, in priority order (their own cards first) so mixed involvement doesn't read as one
   *  flat undifferentiated list. */
  subGroups?: DevRoleSubGroup[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// The backend only puts a card on the board if its owner is this team's own developer (or it's
// unowned) - so the card's own `developer` field is the one name that's always safe to hand a
// top-level group. Everyone else who merely touches the card (a task assignee, a PR reviewer) is
// very often NOT on this team's own roster - a QA consultant testing the card, or a developer
// from the other team helping out - and giving them their own top-level group on a board that
// isn't theirs is misleading. Their involvement still surfaces, just nested inside the real
// owner's group (see storyParticipantKeys/classifyDevRole below) instead of standing alone.
function storyOwnerKey(s: DailyStoryDto): string | null {
  return s.developer || null;
}

// Broader than storyOwnerKey on purpose: once a person already has their own top-level group
// (because they own at least one card), that group should also surface every other card they
// merely contributed to - a task, a Development Partner credit, a PR review - since that's real,
// useful involvement. It just isn't enough on its own to spawn a top-level group for someone who
// isn't really on this team's board (see storyOwnerKey's own comment).
function storyParticipantKeys(s: DailyStoryDto): string[] {
  return [
    s.developer,
    ...(s.tasks || []).map((t) => t.assignedTo),
    s.developmentPartner,
    ...(s.pullRequests || []).flatMap((pr) => pr.reviewers || []),
  ].filter((v): v is string => !!v);
}

const DEV_ROLE_BUCKET_LABELS: Record<DevRoleBucket, string> = {
  owner: "Huvudansvarig",
  partner: "Development Partner",
  involved: "Inblandad i utvecklingen",
  tester: "Testare",
};

const DEV_ROLE_BUCKET_ORDER: DevRoleBucket[] = ["owner", "partner", "involved", "tester"];

/** Priority-ordered: a story only lands in the first bucket it matches, so someone who's both the
 *  owner and has a test task on their own card just shows up once, under "Huvudansvarig". */
function classifyDevRole(s: DailyStoryDto, dev: string): DevRoleBucket | null {
  if (samePerson(s.developer, dev)) return "owner";

  const isPartner = samePerson(s.developmentPartner, dev);
  const isReviewer = (s.pullRequests || []).some((pr) => (pr.reviewers || []).some((r) => samePerson(r, dev)));
  if (isPartner || isReviewer) return "partner";

  const tasks = (s.tasks || []).filter((t) => samePerson(t.assignedTo, dev));
  if (tasks.some(isDevelopmentTask)) return "involved";
  if (tasks.some(isTestTask)) return "tester";

  return null;
}

function storyOwnershipText(s: DailyStoryDto): string {
  const st = (s.azureStatus || "").toLowerCase();
  if (st === "closed" || st === "done") return "Ägde kortet";
  if (st === "resolved") return "Har löst kortet";
  if (st === "active") return "Äger kortet";
  return "Äger ej påbörjat kort";
}

function taskRoleText(tasks: DailyTaskDto[], activeSingular: string, donePrefix: string, singular: string, plural: string): string {
  const done = tasks.every(isProgressTaskDone);
  const count = tasks.length;
  if (done) return `${donePrefix} ${count} ${count === 1 ? singular : plural} klar${count === 1 ? "t" : "a"}`;
  return `${activeSingular} ${count} ${count === 1 ? singular : plural}`;
}

function testRoleText(tasks: DailyTaskDto[]): string {
  const done = tasks.every(isProgressTaskDone);
  if (done) return tasks.length === 1 ? "Har testat" : `Har testat ${tasks.length} kort`;
  return tasks.length === 1 ? "Testar" : `Testar ${tasks.length} kort`;
}

function prRoleText(prs: DailyPullRequestDto[]): string {
  const done = prs.every(isPullRequestDone);
  if (done) return prs.length === 1 ? "Har granskat PR" : `Har granskat ${prs.length} PR`;
  return prs.length === 1 ? "Granskar PR" : `Granskar ${prs.length} PR`;
}

function developerRoleText(s: DailyStoryDto, dev: string): string {
  const parts: string[] = [];
  const owned = samePerson(s.developer, dev);
  const tasks = (s.tasks || []).filter((t) => samePerson(t.assignedTo, dev));
  const prs = (s.pullRequests || []).filter((pr) => (pr.reviewers || []).some((r) => samePerson(r, dev)));

  if (owned) parts.push(storyOwnershipText(s));

  const devTasks = tasks.filter(isDevelopmentTask);
  const testTasks = tasks.filter(isTestTask);
  const docTasks = tasks.filter(isDocumentationTask);

  if (devTasks.length) parts.push(taskRoleText(devTasks, "Jobbar på", "Har", "utvecklingstask", "utvecklingstasks"));
  if (testTasks.length) parts.push(testRoleText(testTasks));
  if (docTasks.length) parts.push(taskRoleText(docTasks, "Dokumenterar", "Har", "dokumentationskort", "dokumentationskort"));
  if (prs.length) parts.push(prRoleText(prs));

  return parts.length ? `(${parts.join(", ")})` : "";
}

/** `developerRoster` is this team's actual Developers list (from /api/team-roles) - without it
 *  (empty array), every card participant is treated as roster-worthy, same as before this
 *  distinction existed. */
export function buildGroups(stories: DailyStoryDto[], mode: GroupMode, developerRoster: string[] = []): StoryGroup[] {
  if (mode === "none") {
    return [{ id: "all", label: "Alla kort", mode, stories }];
  }

  if (mode === "goals") {
    const goalOrder: string[] = [];
    stories.forEach((s) => {
      const g = s.sprintGoal || "(Inget sprintmål)";
      if (!goalOrder.includes(g)) goalOrder.push(g);
    });
    return goalOrder.map((goal) => ({
      id: "g-" + slugify(goal),
      label: goal,
      mode,
      stories: stories.filter((s) => (s.sprintGoal || "(Inget sprintmål)") === goal),
    }));
  }

  const isRosterDeveloper = (name: string) =>
    developerRoster.length === 0 || developerRoster.some((r) => samePerson(r, name));

  // A card's owner always earns a top-level group (the backend only puts this team's own
  // developers' cards on the board). Someone who merely contributed - a task, a PR review - only
  // earns their OWN top-level group if they're a real developer on this team's roster; otherwise
  // (a QA consultant testing the card, a developer from the other team helping out) their
  // involvement still surfaces, just nested inside the real owner's group below instead of
  // standing alone.
  const devs = [
    ...new Set(
      uniqueNames(
        stories.flatMap((s) => {
          const owner = storyOwnerKey(s);
          const rosterParticipants = storyParticipantKeys(s).filter((k) => isRosterDeveloper(fullPersonName(k)));
          return owner ? [owner, ...rosterParticipants] : rosterParticipants;
        }),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "sv-SE", { sensitivity: "base" }));
  const devGroups = devs.map((dev) => {
    const devStories = stories
      .filter((s) => storyParticipantKeys(s).some((name) => samePerson(name, dev)))
      .map((s) => ({ ...s, roleText: developerRoleText(s, dev) }));
    const goals = [...new Set(devStories.map((s) => s.sprintGoal).filter(Boolean))];

    const bucketed: Record<DevRoleBucket, (DailyStoryDto & { roleText?: string })[]> = {
      owner: [],
      partner: [],
      involved: [],
      tester: [],
    };
    for (const s of devStories) {
      const bucket = classifyDevRole(s, dev);
      if (bucket) bucketed[bucket].push(s);
    }
    const subGroups: DevRoleSubGroup[] = DEV_ROLE_BUCKET_ORDER.filter((key) => bucketed[key].length > 0).map((key) => ({
      key,
      label: DEV_ROLE_BUCKET_LABELS[key],
      stories: bucketed[key],
    }));

    return { id: "d-" + slugify(dev), label: dev, mode, goals, stories: devStories, subGroups };
  });

  // "Ej tilldelad" holds every card without an owner, plus anything that landed in no group at
  // all (only touched by someone outside this team's roster - see isRosterDeveloper above).
  // Ownerless cards go here even when a task assignee already shows them inside their group:
  // otherwise a card nobody owns is counted by no header at all, and the per-person totals stop
  // adding up to the board. Unattributed work is exactly what a daily wants surfaced anyway.
  const groupedStoryIds = new Set(devGroups.flatMap((g) => g.stories.map((s) => s.id)));
  const orphans = stories.filter((s) => !storyOwnerKey(s) || !groupedStoryIds.has(s.id));
  if (orphans.length > 0) {
    devGroups.push({
      id: "d-unassigned",
      label: UNASSIGNED_GROUP_LABEL,
      mode,
      goals: [...new Set(orphans.map((s) => s.sprintGoal).filter(Boolean))],
      stories: orphans.map((s) => ({ ...s, roleText: "" })),
      subGroups: [],
    });
  }

  return devGroups;
}
