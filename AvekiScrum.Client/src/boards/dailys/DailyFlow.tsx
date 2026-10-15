import { useEffect, useRef, useState, type ReactNode } from "react";
import { PersonAvatar } from "../../components/PersonAvatar";
import { RichText } from "../../components/RichText";
import { useToast } from "../../components/Toast";
import { fetchTeamRoles, type PersonOption } from "../../api/people";
import { updateWorkItemFields } from "../../api/workitems";
import { WorkItemModal } from "../../components/workitem/WorkItemModal";
import { fetchDailys, fetchSprints, saveDailyCheckIns, type DailyStoryDto, type DeveloperTeamId } from "../../api/dailys";
import { fetchTalkingPoints, isRaisedForTeam, setTalkingPointRaised, type TalkingPointDto } from "../../api/talkingPoints";
import type { SprintGoal } from "../../api/sprintGoals";
import { MoodGauge } from "./MoodGauge";
import { TestTaskBoard, type ExtraTestIteration } from "./TestTaskBoard";
import {
  collectReviewTargets,
  compactPersonName,
  fullPersonName,
  pct,
  personKey,
  REVIEW_TAG,
  samePerson,
  storyProg,
  storyStatusBucket,
  summarizeStories,
  UNASSIGNED_GROUP_LABEL,
  withoutReviewTag,
  type GroupMode,
  type StoryGroup,
} from "./dailysLogic";
import { LinkCardsModal } from "./LinkCardsModal";
import "./DailyFlow.css";

type FlowStepKind = "review" | "developer" | "goal" | "po" | "testlead" | "talkingPoints" | "onemorething";

interface FlowStep {
  kind: FlowStepKind;
  key: string; // group id for developer/goal steps, "po"/"testlead" for the closing steps
  name: string;
  /** Review steps only: the work item to show embedded. */
  workItemId?: number;
  /** Review steps only: the story and/or tasks carrying the tag, and which tasks those were. */
  taggedIds?: number[];
  taggedTaskTitles?: string[];
  /** talkingPoints steps only: this person's still-open "Saker att ta upp" entries. */
  talkingPoints?: TalkingPointDto[];
  /** talkingPoints steps only: renders with its own CheckInGauge like a full participant turn -
   *  used for someone outside the team roster (see buildTalkingPointTailSteps below), instead of
   *  the lightweight variant spliced in front of a present roster member's own turn. */
  fullTurn?: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Elin and Chica (team leads riding along as optional developer-roster participants) always take
// their turn last, after even the PO/test-lead closing turns, and never count toward the time
// budget - see the "tailSteps" split in the flow-building effect below, and isCountedStep next.
function isTimeExemptPerson(name: string): boolean {
  return samePerson(name, "Elin Jonsson") || samePerson(name, "Chica Robertsson");
}

/** Elin and Chica ride along on the developer roster (see isTimeExemptPerson) but aren't
 *  developers - their actual roles, for the role line under their name during their turn. */
function specialRoleLabel(name: string): string | null {
  if (samePerson(name, "Elin Jonsson")) return "Teamledare";
  if (samePerson(name, "Chica Robertsson")) return "Processansvarig";
  return null;
}

/** Review cards aren't a "turn" in the time-budget sense, and neither is a time-exempt person, a
 *  talking-points step (lightweight ones piggyback on the turn right after them; full-turn ones are
 *  for someone outside the roster the budget was built for), nor the "One more thing..." card. */
function isCountedStep(step: FlowStep | null | undefined): boolean {
  return (
    !!step &&
    step.kind !== "review" &&
    step.kind !== "talkingPoints" &&
    step.kind !== "onemorething" &&
    !isTimeExemptPerson(step.name)
  );
}

// ─── Daily timer ───────────────────────────────────────────────────────────
// A whole-meeting 15-minute countdown, plus an *adaptive* per-turn budget: at the start of every
// counted turn, whatever's left of a separate virtual "budget pool" is split evenly across every
// counted turn still ahead (including the one about to start). Leaving a turn early only debits
// the pool by what was actually used, so unused time flows forward to whoever's left. Running over
// never debits more than that turn's own share, so nobody else's slice shrinks because of it - the
// overrun only eats into the visible whole-meeting clock, which is a separate, real-time countdown.
// The pool and the clock start at the same value but are otherwise independent.
const TIMER_TOTAL_SECONDS = 15 * 60;
const TIMER_ENABLED_STORAGE_KEY = "avekiscrum.dailyflow.timerEnabled";

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Tones are generated with the Web Audio API rather than shipping sound files - there is no
// existing audio asset/pattern in this app to fit into, and this keeps the feature self-contained.
let dailyFlowAudioCtx: AudioContext | null = null;

function ensureDailyFlowAudio(): AudioContext | null {
  const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!dailyFlowAudioCtx) {
    try {
      dailyFlowAudioCtx = new AudioCtor();
    } catch {
      dailyFlowAudioCtx = null;
    }
  } else if (dailyFlowAudioCtx.state === "suspended") {
    void dailyFlowAudioCtx.resume();
  }
  return dailyFlowAudioCtx;
}

function playDailyFlowTone(freq: number, durMs: number, delayMs = 0, type: OscillatorType = "sine", gainPeak = 0.16) {
  const ctx = ensureDailyFlowAudio();
  if (!ctx) return;
  const start = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durMs / 1000 + 0.05);
}

function playFiveMinuteSignal() {
  playDailyFlowTone(880, 220);
}
function playOneMinuteSignal() {
  playDailyFlowTone(740, 150);
  playDailyFlowTone(740, 150, 220);
}
function playEndGong() {
  playDailyFlowTone(523.25, 320);
  playDailyFlowTone(392.0, 550, 200);
  playDailyFlowTone(261.63, 850, 420, "sine", 0.2);
}

interface DailyFlowProps {
  team: DeveloperTeamId;
  mode: GroupMode;
  groups: StoryGroup[];
  allStories: DailyStoryDto[];
  /** Every card on the team's board, before any filtering. Cards tagged "Stäm av med teamet" are
   *  found here rather than in `allStories`: someone tagged them precisely so they'd come up, and
   *  a filter set for browsing the board is no reason to skip them. */
  unfilteredStories: DailyStoryDto[];
  /** Which sprint allStories itself belongs to - used to anchor the test-lead turn's own lookup of
   *  last sprint's still-open test tasks (see the effect below) and to label its cards once both
   *  sprints are shown. Omit and that lookup simply doesn't run. */
  currentIteration?: { path: string; label: string };
  onHighlightChange: (groupId: string | null) => void;
  onOpenWorkItem: (id: number) => void;
  /** Refreshes just the given person's cards (developer turns only) instead of the whole board -
   *  see fetchDailyPerson/applyPersonRefresh. Rejects on failure; the button reports that itself. */
  onRefreshPerson: (person: string) => Promise<void>;
  /** Lets the board patch its local copy after a test task is reassigned, so the change shows
   *  immediately without a full refetch. */
  onTaskAssigned?: (taskId: number, displayName: string) => void;
  sprintGoalsByNumber?: Map<number, SprintGoal>;
  /** Lets the embedded card's "Validering" button open the validation dialog on the board. */
  onOpenValidation?: (id: number) => void;
  /** Lets the board drop the review tag from its local copy once it's been cleared in Azure.
   *  `clearedIds` are the work items actually written - the story and/or some of its tasks. */
  onReviewTagCleared?: (storyId: number, clearedIds: number[]) => void;
  /** Lets the board show cards that were just tagged with the goal, without a refetch. */
  onCardsLinked?: (storyIds: number[], goalNumber: number) => void;
  /** personKeys of the people taking part today; everyone else is skipped. */
  participantKeys: Set<string>;
  onClose: () => void;
}

export function DailyFlow({
  team,
  mode,
  groups,
  allStories,
  unfilteredStories,
  currentIteration,
  onHighlightChange,
  onOpenWorkItem,
  onRefreshPerson,
  onTaskAssigned,
  sprintGoalsByNumber,
  onOpenValidation,
  onReviewTagCleared,
  onCardsLinked,
  participantKeys,
  onClose,
}: DailyFlowProps) {
  const [roles, setRoles] = useState<{ po: PersonOption | null; testLead: PersonOption | null } | null>(null);
  const [previousIteration, setPreviousIteration] = useState<ExtraTestIteration | null>(null);
  const [current, setCurrent] = useState<FlowStep | null | undefined>(undefined); // undefined = still preparing
  const [queue, setQueue] = useState<FlowStep[]>([]);
  const [history, setHistory] = useState<FlowStep[]>([]);
  const [checkIns, setCheckIns] = useState<Record<string, number>>({});
  // Optimistically hides a talking point the moment its "✓ Lyft" is clicked, without waiting for a
  // refetch of the whole flow (which would also reshuffle/resize a round already in progress).
  const [raisedTalkingPointIds, setRaisedTalkingPointIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  // Ticked by default: showing the card in the daily is what the tag asked for, so it comes off
  // afterwards. Untick to keep it for tomorrow.
  const [clearTagOnNext, setClearTagOnNext] = useState(true);
  const [clearedReviewIds, setClearedReviewIds] = useState<Set<string>>(new Set());
  const [refreshingCards, setRefreshingCards] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(() => localStorage.getItem(TIMER_ENABLED_STORAGE_KEY) !== "false");
  const [remainingSeconds, setRemainingSeconds] = useState(TIMER_TOTAL_SECONDS);
  const [speakerElapsedSeconds, setSpeakerElapsedSeconds] = useState(0);
  // The adaptive budget pool - see the comment above TIMER_TOTAL_SECONDS. Starts equal to the
  // clock but is debited independently of it.
  const [budgetPoolRemaining, setBudgetPoolRemaining] = useState(TIMER_TOTAL_SECONDS);
  const playedFiveRef = useRef(false);
  const playedOneRef = useRef(false);
  const playedEndRef = useRef(false);
  const { showToast } = useToast();

  // The whole-meeting countdown - ticks once a second while enabled, pauses in place while
  // disabled. Only resets on mount (i.e. when the flow is (re)started).
  useEffect(() => {
    if (!timerEnabled) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 300 && !playedFiveRef.current) {
          playedFiveRef.current = true;
          playFiveMinuteSignal();
        }
        if (next === 60 && !playedOneRef.current) {
          playedOneRef.current = true;
          playOneMinuteSignal();
        }
        if (next === 0 && !playedEndRef.current) {
          playedEndRef.current = true;
          playEndGong();
        }
        return next;
      });
      setSpeakerElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerEnabled]);

  // The test-lead turn also shows last sprint's still-open test tasks by default (see
  // TestLeadTurn/extraIterations) - a card left lingering in a sprint nobody looks at anymore
  // otherwise stays forgotten until someone happens to open the standalone Test board's own
  // iteration filter. Best-effort: no toast on failure, since this is a nice-to-have on top of the
  // turn's own cards, not something the daily should ever block or complain about.
  useEffect(() => {
    const path = currentIteration?.path;
    if (!path) return;
    let cancelled = false;
    fetchSprints(team, path)
      .then((options) => {
        const idx = options.findIndex((o) => o.path === path);
        const previous = idx > 0 ? options[idx - 1] : null;
        if (!previous) return null;
        return fetchDailys(team, undefined, previous.path).then((response) => ({
          path: previous.path,
          label: response.meta.sprint,
          stories: response.teams[0]?.stories ?? [],
        }));
      })
      .then((iteration) => {
        if (!cancelled && iteration) setPreviousIteration(iteration);
      })
      .catch(() => {
        // Best-effort, see comment above.
      });
    return () => {
      cancelled = true;
    };
  }, [team, currentIteration?.path]);

  // Per-turn clock resets every time the current step changes - Nästa/Föregående/Hoppa över.
  useEffect(() => {
    setSpeakerElapsedSeconds(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key]);

  function toggleTimer() {
    setTimerEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(TIMER_ENABLED_STORAGE_KEY, String(next));
      if (next) ensureDailyFlowAudio();
      return next;
    });
  }

  // Build the order once, when the flow starts - later filter changes on the board don't
  // reshuffle or resize an already-running flow.
  useEffect(() => {
    let cancelled = false;

    // Cards tagged "Stäm av med teamet" - on the card itself or on one of its tasks - are walked
    // through first, whichever mode the daily runs in. With none tagged this is simply empty and
    // the daily starts as before. Deliberately read from the unfiltered set: hiding bugs or
    // long-closed cards while browsing must not quietly drop a card someone asked to discuss.
    const reviewSteps: FlowStep[] = collectReviewTargets(unfilteredStories).map((t) => ({
      kind: "review" as const,
      key: `review-${t.storyId}`,
      name: t.title,
      workItemId: t.storyId,
      taggedIds: t.taggedIds,
      taggedTaskTitles: t.taggedTaskTitles,
    }));

    const start = (rest: FlowStep[]) => {
      const fullOrder = [...reviewSteps, ...rest];
      setReviewCount(reviewSteps.length);
      setTotal(fullOrder.length);
      setCurrent(fullOrder[0] ?? null);
      setQueue(fullOrder.slice(1));
    };

    Promise.all([
      fetchTeamRoles(team).catch(() => ({ po: null, testLead: null, developers: [] })),
      // Best-effort: a talking-points fetch failure shouldn't block the daily itself from starting.
      fetchTalkingPoints(team).catch(() => [] as TalkingPointDto[]),
    ]).then(([r, allPoints]) => {
        if (cancelled) return;
        setRoles(r);
        // The picker covers the closing steps too - neither the PO nor the test lead is always
        // at the standup, and an unticked person shouldn't get a turn nobody is there to take.
        const takesPart = (name: string) => participantKeys.has(personKey(name));
        const closingSteps: FlowStep[] = [];
        if (!r.po || takesPart(r.po.displayName))
          closingSteps.push({ kind: "po", key: "po", name: r.po?.displayName || "Product Owner" });
        if (!r.testLead || takesPart(r.testLead.displayName))
          closingSteps.push({ kind: "testlead", key: "testlead", name: r.testLead?.displayName || "Testansvarig" });

        // "Saker att ta upp" - still-open talking points, grouped by who they're assigned to. A
        // roster member's own items are spliced right in front of their turn further down; anyone
        // else's - PO/test-lead, someone on the other team, a stakeholder, or Miro as SM by default
        // - get their own full turn appended at the very end, via buildTalkingPointTailSteps.
        const openPoints = allPoints.filter((p) => !isRaisedForTeam(p, team));
        const byAssignee = new Map<string, TalkingPointDto[]>();
        for (const p of openPoints) {
          const key = personKey(p.assigneeDisplayName);
          const list = byAssignee.get(key);
          if (list) list.push(p);
          else byAssignee.set(key, [p]);
        }
        const rosterNames = [
          ...r.developers.map((d) => d.displayName),
          ...(r.po ? [r.po.displayName] : []),
          ...(r.testLead ? [r.testLead.displayName] : []),
        ];
        const isRosterMember = (name: string) => rosterNames.some((n) => samePerson(n, name));
        // A roster member absent from today's flow simply doesn't get a talking-point turn either -
        // it stays open for the day they're actually back. Anyone not on the roster at all has no
        // participant toggle to respect, so they always get their turn.
        function buildTalkingPointTailSteps(map: Map<string, TalkingPointDto[]>): FlowStep[] {
          return [...map.values()]
            .filter((items) => !isRosterMember(items[0].assigneeDisplayName) || takesPart(items[0].assigneeDisplayName))
            .map((items) => ({
              kind: "talkingPoints" as const,
              key: `tp-tail-${personKey(items[0].assigneeDisplayName)}`,
              name: items[0].assigneeDisplayName,
              talkingPoints: items,
              fullTurn: true,
            }));
        }

        // A single "One more thing..." card right after the last regular participant - only when
        // there's actually something behind it, so a daily with nothing to raise never gains an
        // extra empty step.
        function withOneMoreThing(tailSteps: FlowStep[]): FlowStep[] {
          return tailSteps.length === 0 ? [] : [{ kind: "onemorething" as const, key: "one-more-thing", name: "" }, ...tailSteps];
        }

        if (mode === "goals") {
          // Sprint goals keep their existing (meaningful) order instead of being shuffled. The
          // PO and test lead close the round here just as they do in the developer standup - the
          // questions differ, but both still need their turn. There's no per-developer turn in
          // this mode to splice a roster member's talking point in front of, so every one of them
          // falls through to a full tail turn here too.
          start([
            ...groups.map((g) => ({ kind: "goal" as const, key: g.id, name: g.label })),
            ...closingSteps,
            ...withOneMoreThing(buildTalkingPointTailSteps(byAssignee)),
          ]);
          return;
        }

        // Every roster developer gets a turn, even with zero cards right now (e.g. someone just
        // back from leave) - not just whoever already happens to own a story this sprint. Cards
        // owned by someone not on the roster (shouldn't normally happen) still get a turn too, so
        // nothing silently drops off the board.
        const roster = r.developers.length > 0 ? r.developers : groups.map((g) => ({ email: g.id, displayName: g.label }));
        // A group not matched to any roster entry (shouldn't normally happen) still gets a turn -
        // nothing with real cards silently drops off the board. "Ej tilldelad" is excluded: it's a
        // bucket, not a person, so there's nobody to check in with during the standup.
        const extraGroups = groups.filter(
          (g) => g.label !== UNASSIGNED_GROUP_LABEL && !roster.some((d) => samePerson(d.displayName, g.label)),
        );
        const toDevStep = (dev: { email: string; displayName: string }): FlowStep => {
          const matchingGroup = groups.find((g) => samePerson(g.label, dev.displayName));
          return matchingGroup
            ? { kind: "developer" as const, key: matchingGroup.id, name: matchingGroup.label }
            : { kind: "developer" as const, key: `dev-${dev.email}`, name: dev.displayName };
        };
        // The participant picker has the final say on who gets a turn: someone off sick is
        // unticked before the meeting rather than skipped over live. Elin and Chica are pulled out
        // here and appended after everyone else (closing PO/test-lead turns included) - see
        // isTimeExemptPerson.
        const devSteps: FlowStep[] = shuffle([
          ...roster.filter((dev) => takesPart(dev.displayName) && !isTimeExemptPerson(dev.displayName)).map(toDevStep),
          ...extraGroups
            .filter((g) => takesPart(g.label) && !isTimeExemptPerson(g.label))
            .map((g) => ({ kind: "developer" as const, key: g.id, name: g.label })),
        ]);
        const tailSteps: FlowStep[] = [
          ...roster.filter((dev) => takesPart(dev.displayName) && isTimeExemptPerson(dev.displayName)).map(toDevStep),
          ...extraGroups
            .filter((g) => takesPart(g.label) && isTimeExemptPerson(g.label))
            .map((g) => ({ kind: "developer" as const, key: g.id, name: g.label })),
        ];

        // Splices a lightweight talking-points step immediately before a present developer's own
        // turn - "first thing in their flow, before their cards show as usual". Whatever's left
        // (nobody matched a devStep - a PO/test-lead assignee, say) falls through to a full tail
        // turn below.
        const remainingPoints = new Map(byAssignee);
        const devStepsWithTalkingPoints: FlowStep[] = [];
        for (const step of devSteps) {
          const items = remainingPoints.get(personKey(step.name));
          if (items) {
            devStepsWithTalkingPoints.push({ kind: "talkingPoints", key: `tp-${step.key}`, name: step.name, talkingPoints: items });
            remainingPoints.delete(personKey(step.name));
          }
          devStepsWithTalkingPoints.push(step);
        }

        start([
          ...devStepsWithTalkingPoints,
          ...closingSteps,
          ...tailSteps,
          ...withOneMoreThing(buildTalkingPointTailSteps(remainingPoints)),
        ]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onHighlightChange(current && (current.kind === "developer" || current.kind === "goal") ? current.key : null);
  }, [current, onHighlightChange]);

  useEffect(() => {
    return () => onHighlightChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Leaving a review step normally clears its "Stäm av med teamet" tag - the card has now been
   * shown, which is what the tag was asking for. Unticking the box leaves the tag in place so the
   * card comes back tomorrow. Failure is reported but never blocks moving on: the daily shouldn't
   * stall on a bookkeeping write.
   */
  async function clearReviewTag(step: FlowStep) {
    // Same set the step was built from - a filtered-out card must still be findable here, or
    // clearing its tag would silently do nothing.
    const story = unfilteredStories.find((s) => s.id === step.workItemId);
    if (!story) return;
    // The tag can sit on the card, on one or more of its tasks, or on both - each one is its own
    // work item and needs its own write. They're cleared independently so one failure (a task
    // someone edited meanwhile, say) still lets the others through.
    const targets = (step.taggedIds ?? [story.id]).map((id) => ({
      id,
      tags: id === story.id ? story.tags : (story.tasks ?? []).find((t) => t.id === id)?.tags,
    }));

    const cleared: number[] = [];
    const failed: string[] = [];
    for (const target of targets) {
      try {
        await updateWorkItemFields(target.id, { tags: withoutReviewTag(target.tags) });
        cleared.push(target.id);
      } catch (err) {
        failed.push(`#${target.id} (${err instanceof Error ? err.message : "okänt fel"})`);
      }
    }

    if (cleared.length > 0) {
      onReviewTagCleared?.(story.id, cleared);
      showToast(`Taggen "${REVIEW_TAG}" borttagen från ${cleared.map((id) => `#${id}`).join(", ")}.`, "success");
    }
    if (failed.length > 0) {
      showToast(`Kunde inte ta bort taggen från ${failed.join(", ")}.`, "error");
    }
  }

  // Debits the budget pool for the turn that's ending, capped at that turn's own share - see the
  // comment above TIMER_TOTAL_SECONDS. Time-exempt people and review steps never touch the pool.
  function debitBudgetPool() {
    if (!isCountedStep(current)) return;
    setBudgetPoolRemaining((pool) => Math.max(0, pool - Math.min(speakerElapsedSeconds, timerBudgetSeconds)));
  }

  // today, not now: two runs on the same calendar day (a practice round before the real daily,
  // say) should overwrite each other's save, not fork on the clock time they each happened to
  // finish at.
  function todayLocalDate(): string {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }

  // Saves the round's check-in numbers once it actually finishes - not on an early "✕" close,
  // which is a cancel, not a completion. Silent on failure (a toast here would land right on top
  // of the "alla har gått igenom daily-flödet" screen for no actionable reason) but logged, so a
  // recurring save failure is still visible to someone who goes looking.
  function persistCheckIns(finishedHistory: FlowStep[]) {
    if (!currentIteration) return;
    const entries = finishedHistory
      .filter((step) => step.kind !== "review" && checkIns[step.key] != null)
      .map((step) => ({ kind: step.kind, key: step.key, label: step.name, score: checkIns[step.key] }));
    if (entries.length === 0) return;
    saveDailyCheckIns({
      team,
      sprintPath: currentIteration.path,
      sprintName: currentIteration.label,
      date: todayLocalDate(),
      entries,
    }).catch((err: unknown) => {
      console.error("Kunde inte spara incheckningssiffrorna för dailyn.", err);
    });
  }

  function goNext() {
    if (!current) return;
    // A real click, so it's a safe place to (re)prime the audio context - without this, it would
    // otherwise only ever get created inside the interval tick that plays the first signal, which
    // most browsers won't do since that isn't a user gesture, leaving the 5-min/1-min/end sounds
    // silently blocked.
    if (timerEnabled) ensureDailyFlowAudio();
    if (current.kind === "review" && clearTagOnNext && !clearedReviewIds.has(current.key)) {
      setClearedReviewIds((prev) => new Set(prev).add(current.key));
      void clearReviewTag(current);
    }
    debitBudgetPool();
    const finishedHistory = [...history, current];
    setHistory(finishedHistory);
    setCurrent(queue[0] ?? null);
    setQueue((q) => q.slice(1));
    if (queue.length === 0) persistCheckIns(finishedHistory);
  }

  function goBack() {
    if (history.length === 0 || !current) return;
    if (timerEnabled) ensureDailyFlowAudio();
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => [current, ...q]);
    setCurrent(prev);
  }

  function skip() {
    if (!current || queue.length === 0) return;
    if (timerEnabled) ensureDailyFlowAudio();
    debitBudgetPool();
    const [next, ...rest] = queue;
    setQueue([...rest, current]);
    setCurrent(next);
  }

  // Refreshes just the current developer's cards - see onRefreshPerson - so a card someone just
  // moved shows up without pausing the whole standup for a full-team refetch.
  async function refreshCurrentPersonCards() {
    if (!current || current.kind !== "developer" || refreshingCards) return;
    setRefreshingCards(true);
    try {
      await onRefreshPerson(current.name);
    } catch (err) {
      showToast(`Kunde inte uppdatera ${current.name}s kort: ${err instanceof Error ? err.message : "okänt fel"}`, "error");
    } finally {
      setRefreshingCards(false);
    }
  }

  function setCheckIn(key: string, value: number) {
    setCheckIns((m) => ({ ...m, [key]: value }));
  }

  // Marks a talking point raised - left as-is (still open) is exactly what happens if this is
  // never called for it: skipping the step or just moving on leaves it for next time.
  async function raiseTalkingPoint(id: string) {
    setRaisedTalkingPointIds((prev) => new Set(prev).add(id));
    try {
      await setTalkingPointRaised(id, team, true);
    } catch (err) {
      setRaisedTalkingPointIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast(`Kunde inte bocka av: ${err instanceof Error ? err.message : "okänt fel"}`, "error");
    }
  }

  if (current === undefined) {
    return (
      <div className="daily-flow">
        <p className="daily-flow__status">Förbereder daily-flödet…</p>
      </div>
    );
  }

  if (current === null) {
    return (
      <div className="daily-flow daily-flow--done">
        <div className="daily-flow__done-check">✓</div>
        <div>
          <div className="daily-flow__done-title">Alla har gått igenom daily-flödet!</div>
          <div className="daily-flow__done-sub">{total} steg avklarade.</div>
        </div>
        <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={onClose}>
          Avsluta
        </button>
      </div>
    );
  }

  const stepNumber = total - queue.length;
  // Adaptive per-turn budget: whatever's left in the pool, split across every counted turn still
  // ahead (this one included). See the comment above TIMER_TOTAL_SECONDS for how the pool itself
  // is debited when a turn ends.
  const remainingCountedSteps = (isCountedStep(current) ? 1 : 0) + queue.filter(isCountedStep).length;
  const timerBudgetSeconds =
    remainingCountedSteps > 0 ? Math.max(1, Math.floor(budgetPoolRemaining / remainingCountedSteps)) : 0;

  if (current.kind === "review") {
    // Review cards always sit at the front of the queue, so the current one's position among
    // them is just its step number.
    const reviewTotal = reviewCount;
    return (
      <div className="daily-flow">
        <div className="daily-flow__head">
          <span className="daily-flow__progress">Kort som behöver stämmas av</span>
          <button type="button" className="daily-flow__close" onClick={onClose} aria-label="Avsluta daily-flöde">
            ✕
          </button>
        </div>
        <DailyTimerBar
          enabled={timerEnabled}
          remainingSeconds={remainingSeconds}
          budgetSeconds={timerBudgetSeconds}
          speakerElapsedSeconds={speakerElapsedSeconds}
          currentName={null}
          onToggle={toggleTimer}
        />

        <div className="daily-flow__review">
          <div className="daily-flow__review-bar">
            <span className="daily-flow__review-count">
              Visar kort {stepNumber}/{reviewTotal}
            </span>
            {(current.taggedTaskTitles?.length ?? 0) > 0 && (
              // The card is here because a task under it was tagged, not the card itself - without
              // saying so the team is left hunting for a tag that isn't on what they're looking at.
              <span className="daily-flow__review-via" title={current.taggedTaskTitles!.join(", ")}>
                Taggad via {current.taggedTaskTitles!.length === 1 ? "task" : "tasks"}:{" "}
                {current.taggedTaskTitles!.join(", ")}
              </span>
            )}
            <label className="daily-flow__review-clear">
              <input type="checkbox" checked={clearTagOnNext} onChange={(e) => setClearTagOnNext(e.target.checked)} />
              Ta bort taggen "{REVIEW_TAG}" när jag går vidare
            </label>
          </div>
          <div className="daily-flow__review-card">
            <WorkItemModal
              key={current.workItemId}
              workItemId={current.workItemId!}
              embedded
              onClose={() => undefined}
              onOpenValidation={onOpenValidation}
            />
          </div>
        </div>

        <div className="daily-flow__controls">
          <button type="button" className="daily-flow__btn" onClick={goBack} disabled={history.length === 0}>
            ← Föregående
          </button>
          <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={goNext}>
            {queue.length === 0 ? "Avsluta" : "Nästa →"}
          </button>
        </div>
      </div>
    );
  }

  // Sits right after the last regular participant, before whatever "Saker att ta upp" tail turns
  // follow (see withOneMoreThing) - an empty daily card with nothing but this line, the same beat
  // as a keynote's own "one more thing".
  if (current.kind === "onemorething") {
    return (
      <div className="daily-flow">
        <div className="daily-flow__head">
          <span className="daily-flow__progress">
            Steg {stepNumber} av {total}
          </span>
          <button type="button" className="daily-flow__close" onClick={onClose} aria-label="Avsluta daily-flöde">
            ✕
          </button>
        </div>
        <DailyTimerBar
          enabled={timerEnabled}
          remainingSeconds={remainingSeconds}
          budgetSeconds={timerBudgetSeconds}
          speakerElapsedSeconds={speakerElapsedSeconds}
          currentName={null}
          onToggle={toggleTimer}
        />

        <div className="daily-flow__one-more-thing">
          <div className="daily-flow__one-more-thing-text">One more thing…</div>
        </div>

        <div className="daily-flow__controls">
          <button type="button" className="daily-flow__btn" onClick={goBack} disabled={history.length === 0}>
            ← Föregående
          </button>
          <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={goNext}>
            Nästa →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="daily-flow">
      <div className="daily-flow__head">
        <span className="daily-flow__progress">
          Steg {stepNumber} av {total}
        </span>
        <button type="button" className="daily-flow__close" onClick={onClose} aria-label="Avsluta daily-flöde">
          ✕
        </button>
      </div>
      <DailyTimerBar
        enabled={timerEnabled}
        remainingSeconds={remainingSeconds}
        budgetSeconds={timerBudgetSeconds}
        speakerElapsedSeconds={speakerElapsedSeconds}
        currentName={isCountedStep(current) ? current.name : null}
        onToggle={toggleTimer}
      />

      <div className="daily-flow__body">
        <div className="daily-flow__person">
          {current.kind === "goal" ? (
            <div className="daily-flow__goal-icon">🎯</div>
          ) : (
            // key forces a fresh component instance per step - without it, PersonAvatar's
            // internal "image failed to load" state leaks forward: if one person's photo ever
            // fails once, every subsequent person in the same flow session gets stuck showing
            // initials too, since React would otherwise reuse the same instance across turns.
            <PersonAvatar key={current.key} name={current.name} size={72} />
          )}
          <div className="daily-flow__person-text">
            <div className={"daily-flow__name" + (current.kind === "goal" ? " daily-flow__name--goal" : "")}>{current.name}</div>
            <div className="daily-flow__role">
              {current.kind === "developer"
                ? (specialRoleLabel(current.name) ?? "Utvecklare")
                : current.kind === "goal"
                  ? "Sprintmål"
                  : current.kind === "po"
                    ? "Product Owner"
                    : current.kind === "testlead"
                      ? "Testansvarig"
                      : "Sak att ta upp"}
            </div>
          </div>
        </div>

        {current.kind === "developer" && (
          <DeveloperTurn
            stepKey={current.key}
            groups={groups}
            value={checkIns[current.key] ?? null}
            onChange={(v) => setCheckIn(current.key, v)}
          />
        )}
        {current.kind === "goal" && (
          <GoalTurn
            stepKey={current.key}
            groups={groups}
            goalNumber={Number(current.name.match(/\d+/)?.[0])}
            goalName={current.name}
            allStories={unfilteredStories}
            onCardsLinked={onCardsLinked}
            goal={sprintGoalsByNumber?.get(Number(current.name.match(/\d+/)?.[0]))}
            value={checkIns[current.key] ?? null}
            onChange={(v) => setCheckIn(current.key, v)}
          />
        )}
        {current.kind === "po" && (
          <PoTurn
            poName={roles?.po?.displayName ?? current.name}
            mode={mode}
            allStories={allStories}
            onOpenWorkItem={onOpenWorkItem}
            value={checkIns[current.key] ?? null}
            onChange={(v) => setCheckIn(current.key, v)}
          />
        )}
        {current.kind === "testlead" && (
          <TestLeadTurn
            allStories={allStories}
            onOpenWorkItem={onOpenWorkItem}
            onTaskAssigned={onTaskAssigned}
            currentIteration={currentIteration}
            previousIteration={previousIteration}
            value={checkIns[current.key] ?? null}
            onChange={(v) => setCheckIn(current.key, v)}
          />
        )}
        {current.kind === "talkingPoints" && (
          <TalkingPointsTurn
            items={(current.talkingPoints ?? []).filter((tp) => !raisedTalkingPointIds.has(tp.id))}
            fullTurn={!!current.fullTurn}
            value={checkIns[current.key] ?? null}
            onChange={(v) => setCheckIn(current.key, v)}
            onRaise={raiseTalkingPoint}
          />
        )}
      </div>

      <div className="daily-flow__controls">
        <button type="button" className="daily-flow__btn" onClick={goBack} disabled={history.length === 0}>
          ← Föregående
        </button>
        <button
          type="button"
          className="daily-flow__btn"
          onClick={skip}
          disabled={queue.length === 0}
          title="Flyttar personen till sist i listan"
        >
          Hoppa över
        </button>
        {current.kind === "developer" && (
          <button
            type="button"
            className="daily-flow__btn"
            onClick={refreshCurrentPersonCards}
            disabled={refreshingCards}
            title={`Hämtar bara ${current.name}s kort på nytt, inte hela boarden`}
          >
            {refreshingCards ? "Uppdaterar…" : `↻ Uppdatera ${compactPersonName(current.name)}s kort`}
          </button>
        )}
        <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={goNext}>
          {queue.length === 0 ? "Avsluta" : "Nästa →"}
        </button>
      </div>
    </div>
  );
}

/**
 * The 15-minute meeting countdown plus the current turn's own share of it. The per-turn line
 * escalates in colour the longer someone runs over - never a sound, no popup, so it stays
 * informative without interrupting whoever is talking.
 */
function DailyTimerBar({
  enabled,
  remainingSeconds,
  budgetSeconds,
  speakerElapsedSeconds,
  currentName,
  onToggle,
}: {
  enabled: boolean;
  remainingSeconds: number;
  budgetSeconds: number;
  speakerElapsedSeconds: number;
  /** null when the current step isn't a person's turn (e.g. a review card). */
  currentName: string | null;
  onToggle: () => void;
}) {
  if (!enabled) {
    return (
      <div className="daily-flow__timer daily-flow__timer--off">
        <span className="daily-flow__timer-off-note">Nedräkningstimer avstängd</span>
        <button type="button" className="daily-flow__timer-toggle" onClick={onToggle} title="Slå på timern">
          ⏱ Aktivera
        </button>
      </div>
    );
  }

  const level = remainingSeconds <= 60 ? "crit" : remainingSeconds <= 300 ? "warn" : "";
  const speakerLeft = budgetSeconds - speakerElapsedSeconds;
  // Escalates the longer someone runs over: a soft nudge at first, orange past a minute over,
  // red past two - still just a colour change, never a sound, so it stays unobtrusive.
  const overSeconds = -speakerLeft;
  const overLevel = overSeconds <= 0 ? "" : overSeconds >= 120 ? "over-red" : overSeconds >= 60 ? "over-orange" : "over";

  return (
    <div className="daily-flow__timer">
      <div className={"daily-flow__timer-clock" + (level ? ` daily-flow__timer-clock--${level}` : "")}>
        {formatClock(remainingSeconds)}
      </div>
      <div className="daily-flow__timer-meta">
        <div className="daily-flow__timer-track">
          <div
            className={"daily-flow__timer-fill" + (level ? ` daily-flow__timer-fill--${level}` : "")}
            style={{ width: `${Math.max(0, (remainingSeconds / TIMER_TOTAL_SECONDS) * 100)}%` }}
          />
        </div>
        {currentName && (
          <div className={"daily-flow__timer-speaker" + (overLevel ? ` daily-flow__timer-speaker--${overLevel}` : "")}>
            {currentName}:{" "}
            {speakerLeft >= 0
              ? `${formatClock(speakerLeft)} kvar av ${formatClock(budgetSeconds)}`
              : `${formatClock(-speakerLeft)} över tiden`}
          </div>
        )}
      </div>
      <button type="button" className="daily-flow__timer-toggle" onClick={onToggle} title="Stäng av timern">
        ⏱
      </button>
    </div>
  );
}

function CheckInGauge({
  label,
  value,
  onChange,
  stacked = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  /** Puts the input above the gauge instead of beside it, for narrow side columns. */
  stacked?: boolean;
}) {
  return (
    <div className={"daily-flow__mood" + (stacked ? " daily-flow__mood--stacked" : "")}>
      <div className="daily-flow__mood-label">{label}</div>
      <div className="daily-flow__mood-controls">
        <input
          type="number"
          min={1}
          max={5}
          step={0.01}
          className="daily-flow__mood-input"
          value={value ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 1 && v <= 5) onChange(v);
          }}
        />
        <MoodGauge value={value} />
      </div>
    </div>
  );
}

function DeveloperTurn({
  stepKey,
  groups,
  value,
  onChange,
}: {
  stepKey: string;
  groups: StoryGroup[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  const group = groups.find((g) => g.id === stepKey);
  const stories = group?.stories ?? [];
  const { done } = summarizeStories(stories);

  return (
    <div className="daily-flow__turn">
      <div className="daily-flow__turn-summary">
        <span className="df-stat">
          <strong>{stories.length}</strong> kort
        </span>
        <span className="df-stat">
          <strong>{done}</strong> klara
        </span>
      </div>
      <CheckInGauge label="Hur känns sprinten just nu? (1-5)" value={value} onChange={onChange} />
    </div>
  );
}

/**
 * One or more "Saker att ta upp" for the person whose turn this is. The lightweight variant (no
 * CheckInGauge) sits in front of a present roster member's own developer turn; the full-turn
 * variant (fullTurn) stands in for someone who has no turn of their own to sit in front of - see
 * buildTalkingPointTailSteps in the flow-building effect above.
 */
function TalkingPointsTurn({
  items,
  fullTurn,
  value,
  onChange,
  onRaise,
}: {
  items: TalkingPointDto[];
  fullTurn: boolean;
  value: number | null;
  onChange: (value: number) => void;
  onRaise: (id: string) => void;
}) {
  return (
    <div className="daily-flow__turn">
      {items.length === 0 ? (
        <p className="daily-flow__empty">Allt avbockat.</p>
      ) : (
        <ul className="daily-flow__talking-points">
          {items.map((tp) => (
            <li key={tp.id} className="daily-flow__talking-point">
              <RichText content={tp.bodyHtml} className="daily-flow__talking-point-body" />
              <button type="button" className="wi-btn wi-btn--primary" onClick={() => onRaise(tp.id)}>
                ✓ Lyft
              </button>
            </li>
          ))}
        </ul>
      )}
      {fullTurn && <CheckInGauge label="Hur känns sprinten just nu? (1-5)" value={value} onChange={onChange} />}
    </div>
  );
}

/** The four Azure states, in flow order, with the colour each one carries across the board. */
const GOAL_STATE_SLICES = [
  { key: "New", label: "New", cls: "df-slice--new" },
  { key: "Active", label: "Active", cls: "df-slice--active" },
  { key: "Resolved", label: "Resolved", cls: "df-slice--resolved" },
  { key: "Closed", label: "Closed", cls: "df-slice--closed" },
] as const;

/**
 * Story points per Azure state as a donut, with card progress underneath. Two different
 * questions, deliberately measured differently: the donut answers "where does the estimated work
 * sit", the bar answers "how many cards have we actually moved", which is why the bar counts
 * cards even when the donut has points to show.
 */
function GoalStats({ stories }: { stories: DailyStoryDto[] }) {
  const spByState = new Map<string, number>(GOAL_STATE_SLICES.map((s) => [s.key, 0]));
  for (const story of stories) {
    const state = (story.azureStatus || "").trim();
    const key = spByState.has(state) ? state : storyStatusBucket(story) === "done" ? "Closed" : storyStatusBucket(story) === "new" ? "New" : "Active";
    spByState.set(key, (spByState.get(key) ?? 0) + (story.storyPoints || 0));
  }
  const totalSP = [...spByState.values()].reduce((a, b) => a + b, 0);

  const total = stories.length;
  const closed = stories.filter((s) => storyStatusBucket(s) === "done").length;
  // "Påbörjat" is everything that has left the New column - Active, Resolved and Closed alike.
  const started = stories.filter((s) => storyStatusBucket(s) !== "new").length;
  const startedPct = pct(started, total);
  const closedPct = pct(closed, total);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="df-goal-stats">
      <div className="df-donut-wrap">
        {totalSP === 0 ? (
          <p className="df-donut-empty">Inga story points satta på det här sprintmålets kort.</p>
        ) : (
          <>
            <svg className="df-donut" viewBox="0 0 140 140" role="img" aria-label="Story points per status">
              <circle className="df-donut__track" cx="70" cy="70" r={radius} fill="none" strokeWidth="20" />
              {GOAL_STATE_SLICES.map((slice) => {
                const value = spByState.get(slice.key) ?? 0;
                if (value === 0) return null;
                const length = (value / totalSP) * circumference;
                const dash = `${length} ${circumference - length}`;
                const thisOffset = offset;
                offset += length;
                return (
                  <circle
                    key={slice.key}
                    className={`df-donut__slice ${slice.cls}`}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    strokeWidth="20"
                    strokeDasharray={dash}
                    // Negative offset walks clockwise from 12 o'clock (the -90° rotation in CSS).
                    strokeDashoffset={-thisOffset}
                  >
                    <title>{`${slice.label}: ${value} SP`}</title>
                  </circle>
                );
              })}
              <text className="df-donut__total" x="70" y="70" textAnchor="middle" dominantBaseline="central">
                {totalSP}
              </text>
            </svg>
            <div className="df-donut-legend">
              {GOAL_STATE_SLICES.map((slice) => (
                <span key={slice.key} className="df-legend-item">
                  <span className={`df-legend-swatch ${slice.cls}`} />
                  {slice.label}
                  <strong>{spByState.get(slice.key) ?? 0}</strong>
                </span>
              ))}
            </div>
            <span className="df-donut-caption">Story points per status</span>
          </>
        )}
      </div>

      <div className="df-goal-progress">
        <div className="df-progress-head">
          <span className="df-progress-title">Kort</span>
          <span className="df-progress-total">{total} st</span>
        </div>
        {/* Closed is a subset of started, so the green bar is drawn over the started bar from the
            same left edge rather than stacked after it. */}
        <div className="df-progress-track">
          <div className="df-progress-bar df-progress-bar--started" style={{ width: `${startedPct}%` }} />
          <div className="df-progress-bar df-progress-bar--closed" style={{ width: `${closedPct}%` }} />
        </div>
        <div className="df-progress-legend">
          <span className="df-legend-item">
            <span className="df-legend-swatch df-legend-swatch--started" />
            Påbörjade
            <strong>
              {started} · {startedPct}%
            </strong>
          </span>
          <span className="df-legend-item">
            <span className="df-legend-swatch df-legend-swatch--closed" />
            Closed
            <strong>
              {closed} · {closedPct}%
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function GoalTurn({
  stepKey,
  groups,
  goalNumber,
  goalName,
  allStories,
  onCardsLinked,
  goal,
  value,
  onChange,
}: {
  stepKey: string;
  groups: StoryGroup[];
  goalNumber: number;
  goalName: string;
  allStories: DailyStoryDto[];
  onCardsLinked?: (storyIds: number[], goalNumber: number) => void;
  goal?: SprintGoal;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const group = groups.find((g) => g.id === stepKey);
  const stories = group?.stories ?? [];
  const [linking, setLinking] = useState(false);
  // Only for a real goal: the "(Inget sprintmål)" bucket is where unlinked cards already sit, so
  // offering to link them to it would be a no-op.
  const canLink = Number.isFinite(goalNumber) && !!onCardsLinked;

  return (
    <>
      {/* Left: how the goal is actually going. Right (further down): the confidence check-in,
          stacked so it takes as little width as possible. The goal's own text sits between them. */}
      <div className="daily-flow__turn daily-flow__turn--stats">
        <GoalStats stories={stories} />
        {/* Sits with the goal's numbers because that is where you notice a card is missing from
            them - and it can be fixed without leaving the standup. */}
        {canLink && (
          <button type="button" className="wi-btn df-link-cards" onClick={() => setLinking(true)}>
            + Koppla kort
          </button>
        )}
      </div>

      {linking && canLink && (
        <LinkCardsModal
          goalNumber={goalNumber}
          goalName={goalName}
          stories={allStories}
          onClose={() => setLinking(false)}
          onLinked={(ids, n) => onCardsLinked?.(ids, n)}
        />
      )}

      {/* The goal's own detail (what it is, who owns it, what "done" means) is exactly what the
          team needs while scoring confidence. */}
      <div className="df-goal-detail">
        {!goal ? (
          // The "(Inget sprintmål)" bucket has no wiki entry by definition, so saying the lookup
          // failed reads as a fault. It's simply the leftovers, and gets said plainly as a heading.
          <h2 className="df-goal-title df-goal-title--other">Övriga kort – ej tillhörande ett sprintmål</h2>
        ) : (
          <>
            {/* The goal's own name, as a plain heading - the left column only says which number
                it is, and turning the title into another orange section head would make it read
                as a fourth field rather than as what the sections below are about. */}
            {goal.title && <h2 className="df-goal-title">{goal.title}</h2>}
            {goal.description && (
              <GoalSection title="Beskrivning">
                <div className="df-goal-section__text">{goal.description}</div>
              </GoalSection>
            )}
            {(goal.owners.length > 0 || goal.expert) && (
              <GoalSection title="Ansvar">
                <div className="df-goal-detail__meta">
                  {goal.owners.length > 0 && <span>Ansvarig: {goal.owners.join(", ")}</span>}
                  {goal.expert && <span>Sakkunnig: {goal.expert}</span>}
                </div>
              </GoalSection>
            )}
            {goal.deliverables.length > 0 && (
              <GoalSection title="Delleverans">
                <ul className="df-goal-detail__list">
                  {goal.deliverables.map((d) => (
                    <li key={d.id} className={d.done ? "df-goal-detail__done" : ""}>
                      {d.done ? "☑" : "☐"} {stripLeadingMarker(d.text)}
                    </li>
                  ))}
                </ul>
              </GoalSection>
            )}
            {goal.definitionOfDone.length > 0 && (
              <GoalSection title="Definition of Done">
                <ul className="df-goal-detail__list">
                  {goal.definitionOfDone.map((d) => (
                    <li key={d.id} className={d.checked ? "df-goal-detail__done" : ""}>
                      {d.checked ? "☑" : "☐"} {stripLeadingMarker(d.text)}
                    </li>
                  ))}
                </ul>
              </GoalSection>
            )}
            {goal.subGoals.length > 0 && (
              <GoalSection title="Delmål">
                <div className="df-goal-subgoals">
                  {goal.subGoals.map((s) => (
                    <div className="df-goal-subgoal" key={s.id}>
                      <div className="df-goal-subgoal__title">{s.title}</div>
                      {s.description && <div className="df-goal-subgoal__desc">{s.description}</div>}
                    </div>
                  ))}
                </div>
              </GoalSection>
            )}
          </>
        )}
      </div>

      <div className="df-goal-checkin">
        {/* The leftovers bucket has no goal to reach, so asking how confident we are of reaching
            it reads as nonsense there - it still gets a check-in, just a fitting question. */}
        <CheckInGauge
          label={goal ? "Hur säkra är vi på att nå det här sprintmålet? (1-5)" : "Hur ligger vi till med de här korten? (1-5)"}
          value={value}
          onChange={onChange}
          stacked
        />
      </div>
    </>
  );
}

function PoTurn({
  poName,
  mode,
  allStories,
  onOpenWorkItem,
  value,
  onChange,
}: {
  poName: string;
  mode: GroupMode;
  allStories: DailyStoryDto[];
  onOpenWorkItem: (id: number) => void;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const relevant = allStories
    .map((s) => ({
      story: s,
      isOwner: s.ownedByProductOwner || samePerson(s.developer, poName),
      isStakeholder: (s.stakeholders ?? []).some((n) => samePerson(n, poName)),
      isTagged: (s.tags ?? []).some((t) => samePerson(t, poName)),
    }))
    .filter((r) => r.isOwner || r.isStakeholder || r.isTagged);

  return (
    <div className="daily-flow__turn">
      <div className="daily-flow__turn-summary">
        <span className="df-stat">
          <strong>{relevant.length}</strong> kort
        </span>
      </div>
      {/* A sprintmål round has just walked through every goal, so the PO's turn is about how
          that landed - not the generic "how does the sprint feel" the developer round ends on. */}
      <CheckInGauge
        label={
          mode === "goals"
            ? "Hur trygg känner du dig med teamets framfart mot sprintmålen? (1-5)"
            : "Hur känns sprinten just nu? (1-5)"
        }
        value={value}
        onChange={onChange}
      />
      {relevant.length === 0 ? (
        <p className="daily-flow__empty">Inga kort just nu.</p>
      ) : (
        <ul className="daily-flow__list daily-flow__list--tall">
          {relevant.map(({ story: s, isOwner, isStakeholder, isTagged }) => (
            <li key={s.id}>
              <div className="df-row df-row--po">
                <button type="button" className="daily-flow__list-id df-row__id" onClick={() => onOpenWorkItem(s.id)} title="Öppna kortet">
                  #{s.id}
                </button>
                <span className="df-row__person">
                  <PersonAvatar name={s.developer} size={22} />
                  <span className="daily-flow__list-owner">{fullPersonName(s.developer) || "Ej tilldelad"}</span>
                </span>
                <span className="df-row__title" title={s.title}>
                  {s.title}
                </span>
                <span className="daily-flow__list-badges">
                  {isOwner && <span className="daily-flow__badge">Äger kortet</span>}
                  {isStakeholder && <span className="daily-flow__badge">Stakeholder</span>}
                  {isTagged && <span className="daily-flow__badge">Taggad</span>}
                </span>
                <span className="daily-flow__list-progress">{storyProg(s)}%</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mirrors the sprint-goal modal's boxed sections, but with the board's orange header instead of
 *  the modal's near-black - inside the already-orange flow panel, black bars read as a foreign
 *  element rather than part of the same card. */
function GoalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="df-goal-section">
      <div className="df-goal-section__head">{title}</div>
      <div className="df-goal-section__body">{children}</div>
    </section>
  );
}

/** Wiki checklist rows sometimes already start with their own ☐/☑/[ ]/- marker; strip it so the
 *  rendered checkbox isn't doubled up. */
function stripLeadingMarker(text: string): string {
  return text.replace(/^\s*(?:[☐☑☒✓✔]|\[[ xX]?\]|[-*])\s*/, "");
}

/**
 * The test lead's turn: the same board as the standalone "Test" tab (see TestTaskBoard.tsx),
 * embedded here with the daily flow's own mood check-in wrapped around it. Kept as a thin wrapper
 * rather than its own copy of the board logic, so a change to how test tasks are classified only
 * has to happen once.
 *
 * Also folds in last sprint's still-open test tasks (previousIteration, fetched by DailyFlow's own
 * effect above) - always with includeClosedFromExtra false, since a card that's already Closed in
 * a sprint nobody's looking at anymore isn't something the daily needs to surface, only one that's
 * still lingering.
 */
function TestLeadTurn({
  allStories,
  onOpenWorkItem,
  onTaskAssigned,
  currentIteration,
  previousIteration,
  value,
  onChange,
}: {
  allStories: DailyStoryDto[];
  onOpenWorkItem: (id: number) => void;
  onTaskAssigned?: (taskId: number, displayName: string) => void;
  currentIteration?: { path: string; label: string };
  previousIteration?: ExtraTestIteration | null;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div className="daily-flow__turn">
      <CheckInGauge label="Hur känns testläget just nu? (1-5)" value={value} onChange={onChange} />
      <TestTaskBoard
        allStories={allStories}
        onOpenWorkItem={onOpenWorkItem}
        onTaskAssigned={onTaskAssigned}
        embedded
        currentIteration={currentIteration}
        extraIterations={previousIteration ? [previousIteration] : undefined}
        includeClosedFromExtra={false}
      />
    </div>
  );
}
