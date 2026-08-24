import { useEffect, useState, type ReactNode } from "react";
import { PersonAvatar } from "../../components/PersonAvatar";
import { useToast } from "../../components/Toast";
import { fetchAllPeople, fetchTeamRoles, type PersonOption } from "../../api/people";
import { updateWorkItemFields } from "../../api/workitems";
import { WorkItemModal } from "../../components/workitem/WorkItemModal";
import type { DailyStoryDto, DailyTaskDto, DeveloperTeamId } from "../../api/dailys";
import type { SprintGoal } from "../../api/sprintGoals";
import { MoodGauge } from "./MoodGauge";
import {
  collectReviewTargets,
  fullPersonName,
  isTestTask,
  isStoryDone,
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
import "./DailyFlow.css";

type FlowStepKind = "review" | "developer" | "goal" | "po" | "testlead";

interface FlowStep {
  kind: FlowStepKind;
  key: string; // group id for developer/goal steps, "po"/"testlead" for the closing steps
  name: string;
  /** Review steps only: the work item to show embedded. */
  workItemId?: number;
  /** Review steps only: the story and/or tasks carrying the tag, and which tasks those were. */
  taggedIds?: number[];
  taggedTaskTitles?: string[];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
  onHighlightChange: (groupId: string | null) => void;
  onOpenWorkItem: (id: number) => void;
  /** Lets the board patch its local copy after a test task is reassigned, so the change shows
   *  immediately without a full refetch. */
  onTaskAssigned?: (taskId: number, displayName: string) => void;
  sprintGoalsByNumber?: Map<number, SprintGoal>;
  /** Lets the embedded card's "Validering" button open the validation dialog on the board. */
  onOpenValidation?: (id: number) => void;
  /** Lets the board drop the review tag from its local copy once it's been cleared in Azure.
   *  `clearedIds` are the work items actually written - the story and/or some of its tasks. */
  onReviewTagCleared?: (storyId: number, clearedIds: number[]) => void;
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
  onHighlightChange,
  onOpenWorkItem,
  onTaskAssigned,
  sprintGoalsByNumber,
  onOpenValidation,
  onReviewTagCleared,
  participantKeys,
  onClose,
}: DailyFlowProps) {
  const [roles, setRoles] = useState<{ po: PersonOption | null; testLead: PersonOption | null } | null>(null);
  const [current, setCurrent] = useState<FlowStep | null | undefined>(undefined); // undefined = still preparing
  const [queue, setQueue] = useState<FlowStep[]>([]);
  const [history, setHistory] = useState<FlowStep[]>([]);
  const [checkIns, setCheckIns] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  // Ticked by default: showing the card in the daily is what the tag asked for, so it comes off
  // afterwards. Untick to keep it for tomorrow.
  const [clearTagOnNext, setClearTagOnNext] = useState(true);
  const [clearedReviewIds, setClearedReviewIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

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

    fetchTeamRoles(team)
      .catch(() => ({ po: null, testLead: null, developers: [] }))
      .then((r) => {
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

        if (mode === "goals") {
          // Sprint goals keep their existing (meaningful) order instead of being shuffled. The
          // PO and test lead close the round here just as they do in the developer standup - the
          // questions differ, but both still need their turn.
          start([...groups.map((g) => ({ kind: "goal" as const, key: g.id, name: g.label })), ...closingSteps]);
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
        // The participant picker has the final say on who gets a turn: someone off sick is
        // unticked before the meeting rather than skipped over live.
        const devSteps: FlowStep[] = shuffle([
          ...roster.filter((dev) => takesPart(dev.displayName)).map((dev) => {
            const matchingGroup = groups.find((g) => samePerson(g.label, dev.displayName));
            return matchingGroup
              ? { kind: "developer" as const, key: matchingGroup.id, name: matchingGroup.label }
              : { kind: "developer" as const, key: `dev-${dev.email}`, name: dev.displayName };
          }),
          ...extraGroups
            .filter((g) => takesPart(g.label))
            .map((g) => ({ kind: "developer" as const, key: g.id, name: g.label })),
        ]);
        start([...devSteps, ...closingSteps]);
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

  function goNext() {
    if (!current) return;
    if (current.kind === "review" && clearTagOnNext && !clearedReviewIds.has(current.key)) {
      setClearedReviewIds((prev) => new Set(prev).add(current.key));
      void clearReviewTag(current);
    }
    setHistory((h) => [...h, current]);
    setCurrent(queue[0] ?? null);
    setQueue((q) => q.slice(1));
  }

  function goBack() {
    if (history.length === 0 || !current) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => [current, ...q]);
    setCurrent(prev);
  }

  function skip() {
    if (!current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue([...rest, current]);
    setCurrent(next);
  }

  function setCheckIn(key: string, value: number) {
    setCheckIns((m) => ({ ...m, [key]: value }));
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
                ? "Utvecklare"
                : current.kind === "goal"
                  ? "Sprintmål"
                  : current.kind === "po"
                    ? "Product Owner"
                    : "Testansvarig"}
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
            value={checkIns[current.key] ?? null}
            onChange={(v) => setCheckIn(current.key, v)}
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
        <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={goNext}>
          {queue.length === 0 ? "Avsluta" : "Nästa →"}
        </button>
      </div>
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
  goal,
  value,
  onChange,
}: {
  stepKey: string;
  groups: StoryGroup[];
  goal?: SprintGoal;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const group = groups.find((g) => g.id === stepKey);
  const stories = group?.stories ?? [];

  return (
    <>
      {/* Left: how the goal is actually going. Right (further down): the confidence check-in,
          stacked so it takes as little width as possible. The goal's own text sits between them. */}
      <div className="daily-flow__turn daily-flow__turn--stats">
        <GoalStats stories={stories} />
      </div>

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

// A test task's own status says where it is in its own lifecycle, but whether it can be picked up
// depends on its PARENT story having reached Resolved. Once a verdict exists it lives in a
// "Test OK"/"Test ej OK" tag rather than in the status.
const TEST_READY_PARENT_STATES = new Set(["Resolved", "Closed", "Done"]);

function testResultFromTags(tags: string[]): "ok" | "notok" | null {
  const lower = tags.map((t) => t.trim().toLowerCase());
  if (lower.includes("test ej ok")) return "notok";
  if (lower.includes("test ok")) return "ok";
  return null;
}

interface TestTaskRow extends DailyTaskDto {
  storyId: number;
  storyTitle: string;
  parentReady: boolean;
  /** The story this test belongs to is finished. Nothing left to chase once the test is too. */
  parentClosed: boolean;
}

/** A test that has been carried out - closed, or carrying a verdict tag. */
function isTestFinished(t: TestTaskRow): boolean {
  return (t.status || "").trim().toLowerCase() === "closed" || testResultFromTags(t.tags) === "ok";
}

function TestTaskList({
  tasks,
  onOpenWorkItem,
  people,
  onAssign,
  busyTaskId,
}: {
  tasks: TestTaskRow[];
  onOpenWorkItem: (id: number) => void;
  people: PersonOption[];
  onAssign: (task: TestTaskRow, person: PersonOption) => void;
  busyTaskId: number | null;
}) {
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  return (
    <ul className="daily-flow__list daily-flow__list--tall">
      {tasks.map((t) => {
        const result = testResultFromTags(t.tags);
        // A finished test says so as a verdict, not as an Azure state: "Closed" on a row under
        // "Klara test" is the least informative thing the badge could show, and it hides the
        // difference between a test that passed and one that was merely closed.
        const statusLabel =
          result === "notok"
            ? "Test ej OK"
            : result === "ok"
              ? "Test OK"
              : isTestFinished(t)
                ? "Stängd"
                : t.status === "Active"
                  ? "Pågår"
                  : t.status || "Ny";
        // Closed without a verdict gets its own muted badge rather than borrowing the green one -
        // it means "nobody wrote down whether it passed", which is not the same as Test OK.
        const statusCls =
          result === "notok" ? "notok" : result === "ok" ? "ok" : isTestFinished(t) ? "noverdict" : (t.status || "").toLowerCase();
        return (
          <li key={t.id}>
            <div className="df-row df-row--test">
              <span className={`daily-flow__list-status daily-flow__list-status--${statusCls}`}>{statusLabel}</span>
              {/* Opens the test task itself, not its parent story - the shown id IS the task's,
                  so opening the parent made the row look like it described the wrong card. */}
              <button type="button" className="daily-flow__list-id df-row__id" onClick={() => onOpenWorkItem(t.id)} title="Öppna testkortet">
                #{t.id}
              </button>
              <span className="df-row__person">
                <button
                  type="button"
                  className="df-assign"
                  onClick={() => setPickerFor(pickerFor === t.id ? null : t.id)}
                  title="Välj testare"
                  disabled={busyTaskId === t.id}
                >
                  <PersonAvatar name={t.assignedTo} size={20} />
                  <span className={"daily-flow__list-owner" + (t.assignedTo ? "" : " df-assign__empty")}>
                    {busyTaskId === t.id ? "Sparar…" : fullPersonName(t.assignedTo) || "Ej tilldelad"}
                  </span>
                </button>
                {pickerFor === t.id && (
                  <select
                    className="df-assign__select"
                    autoFocus
                    defaultValue=""
                    onBlur={() => setPickerFor(null)}
                    onChange={(e) => {
                      const person = people.find((p) => p.email === e.target.value);
                      setPickerFor(null);
                      if (person) onAssign(t, person);
                    }}
                  >
                    <option value="">– välj testare –</option>
                    {people.map((p) => (
                      <option key={p.email} value={p.email}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </span>
              <span className="df-row__title" title={t.title + " (" + t.storyTitle + ")"}>
                {t.title}{" "}
                {/* The story in parentheses is the context for the test, and the thing you most
                    often want next - so it opens rather than just labelling. */}
                <button
                  type="button"
                  className="daily-flow__list-parent daily-flow__list-parent--link"
                  onClick={() => onOpenWorkItem(t.storyId)}
                  title={`Öppna #${t.storyId} ${t.storyTitle}`}
                >
                  ({t.storyTitle})
                </button>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TestLeadTurn({
  allStories,
  onOpenWorkItem,
  onTaskAssigned,
  value,
  onChange,
}: {
  allStories: DailyStoryDto[];
  onOpenWorkItem: (id: number) => void;
  onTaskAssigned?: (taskId: number, displayName: string) => void;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchAllPeople()
      .then((p) => !cancelled && setPeople(p))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAssign(task: TestTaskRow, person: PersonOption) {
    setBusyTaskId(task.id);
    try {
      await updateWorkItemFields(task.id, { assignedTo: person.email });
      showToast("#" + task.id + " tilldelad " + person.displayName + ".", "success");
      onTaskAssigned?.(task.id, person.displayName);
    } catch (err) {
      showToast("Kunde inte tilldela #" + task.id + ": " + (err instanceof Error ? err.message : "Okänt fel"), "error");
    } finally {
      setBusyTaskId(null);
    }
  }

  const all: TestTaskRow[] = allStories.flatMap((s) =>
    (s.tasks ?? [])
      .filter(isTestTask)
      .map((t) => ({
        ...t,
        storyId: s.id,
        storyTitle: s.title,
        parentReady: TEST_READY_PARENT_STATES.has(s.azureStatus),
        parentClosed: isStoryDone(s),
      })),
  );

  // A test that is done and whose story is closed is finished business - it would only pad the
  // list. Everything else the test lead still has a reason to look at.
  const visible = all.filter((t) => !(isTestFinished(t) && t.parentClosed));

  const finished = visible.filter(isTestFinished);
  const open = visible.filter((t) => !isTestFinished(t));
  const awaitingFix = open.filter((t) => testResultFromTags(t.tags) === "notok");
  const rest = open.filter((t) => testResultFromTags(t.tags) !== "notok");
  const inProgress = rest.filter((t) => t.status === "Active");
  const notStarted = rest.filter((t) => t.status !== "Active");
  const ready = notStarted.filter((t) => t.parentReady);
  const notReady = notStarted.filter((t) => !t.parentReady);
  const unassignedCount = open.filter((t) => !t.assignedTo).length;

  // "Klara test" first: these are the ones with an action attached - the testing is done, so the
  // story is waiting to be closed. Closed tests used to fall into "Redo att testa" simply because
  // they weren't Active, which read as work still to do.
  const sections: { label: string; tasks: TestTaskRow[] }[] = [
    { label: "Klara test – huvudkortet inte stängt", tasks: finished },
    { label: "Inväntar fix", tasks: awaitingFix },
    { label: "Under test", tasks: inProgress },
    { label: "Redo att testa", tasks: ready },
    { label: "Skapade, men inte redo", tasks: notReady },
  ];

  return (
    <div className="daily-flow__turn">
      <div className="daily-flow__turn-summary">
        <span className="df-stat">
          <strong>{visible.length}</strong> test-tasks
        </span>
        <span className="df-stat">
          <strong>{unassignedCount}</strong> utan ägare
        </span>
        {all.length !== visible.length && (
          <span className="df-hint">{all.length - visible.length} klara på stängda kort dolda</span>
        )}
      </div>
      <CheckInGauge label="Hur känns testläget just nu? (1-5)" value={value} onChange={onChange} />
      {visible.length === 0 ? (
        <p className="daily-flow__empty">Inga test-tasks att gå igenom.</p>
      ) : (
        sections
          .filter((s) => s.tasks.length > 0)
          .map((s) => (
            <div key={s.label}>
              <div className="daily-flow__group-label">
                {s.label} ({s.tasks.length})
              </div>
              <TestTaskList
                tasks={s.tasks}
                onOpenWorkItem={onOpenWorkItem}
                people={people}
                onAssign={handleAssign}
                busyTaskId={busyTaskId}
              />
            </div>
          ))
      )}
    </div>
  );
}
