import type { DailyPullRequestDto, DailyStoryDto, DailyTaskDto } from "../../api/dailys";
import { fullPersonName, samePerson, uniqueNames } from "../../lib/personNames";

export { fullPersonName, compactPersonName, personKey, samePerson, uniqueNames, reviewerNames } from "../../lib/personNames";

// ─── Progress / status helpers ────────────────────────────
export function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0;
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

  // Cards that landed in no dev group at all would otherwise vanish from this view entirely -
  // whether truly unowned, or only touched by someone outside this team's roster (see isRosterDeveloper
  // above) - they get their own bucket last, since unattributed work is exactly what a daily wants
  // to surface rather than silently drop.
  const groupedStoryIds = new Set(devGroups.flatMap((g) => g.stories.map((s) => s.id)));
  const orphans = stories.filter((s) => !groupedStoryIds.has(s.id));
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
