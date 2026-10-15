import { useEffect, useMemo, useRef, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { useToast } from "../../components/Toast";
import { buildAgenda, type AgendaStep, type AgendaStepId } from "./agenda";
import { StepTransitionModal } from "./StepTransitionModal";
import { EndMeetingModal } from "./EndMeetingModal";
import { PlannerPanel } from "./PlannerPanel";
import { RolePlaceholderPanel } from "./RolePlaceholderPanel";
import { OvrigtPanel } from "./OvrigtPanel";
import { ScrumMasterView } from "./ScrumMasterView";
import { ReleaseTestView } from "./ReleaseTestView";
import { InfluencerLotteryPanel } from "./InfluencerLotteryPanel";
import { TodaysInfluencersPanel } from "./TodaysInfluencersPanel";
import { todayIso } from "./influencers";
import { fetchMeetingInfluencers, type MeetingInfluencerDto } from "../../api/teamCheckIn";
import { ensureAudio, playTone } from "./meetingAudio";
import "./TeamCheckInBoard.css";

// 60 minutes is a starting guess for how long a Teamavstämning actually runs - retune this one
// constant if the real slot turns out shorter/longer. The two warnings are fixed relative to it:
// "kvarten kvar" (15 min left) and "5 min kvar", same idea as DailyFlow's own meeting timer.
const TOTAL_SECONDS = 60 * 60;
const QUARTER_LEFT_SECONDS = 15 * 60;
const FIVE_LEFT_SECONDS = 5 * 60;

function playQuarterLeftSignal() {
  playTone(880, 220);
}
function playFiveLeftSignal() {
  playTone(740, 150);
  playTone(740, 150, 220);
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function renderPanel(
  step: AgendaStep,
  todaysInfluencers: MeetingInfluencerDto[],
  onInfluencersChanged: (meetingDate: string, influencers: MeetingInfluencerDto[]) => void,
) {
  switch (step.id) {
    case "veckans-influencers":
      return <TodaysInfluencersPanel influencers={todaysInfluencers} />;
    case "nasta-influencer":
      return <InfluencerLotteryPanel onChanged={onInfluencersChanged} />;
    case "aktivitetsboarden":
      return <PlannerPanel />;
    case "scrum-master":
      return <ScrumMasterView />;
    case "release-test":
      return <ReleaseTestView />;
    case "ovrigt":
      return <OvrigtPanel />;
    default:
      return <RolePlaceholderPanel step={step} />;
  }
}

/** True while focus is somewhere that ArrowLeft/ArrowRight should move a text caret instead of the
 *  agenda - a free-text search box, a sprint-goal wiki URL field, etc. */
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

/** A full-screen dialog (the influencer lottery's reel, say) owns the keyboard while it's open -
 *  an arrow key must not swap the agenda step out from under it. */
function isDialogOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

interface TeamCheckInBoardProps {
  onNavigate?: (board: "team-home" | "refinement" | "dailys" | "review" | "test" | "teamcheckin") => void;
  onHome?: () => void;
}

/**
 * "Teamavstämning" - a recurring cross-team meeting, deliberately with no team switcher (it's one
 * meeting for both teams, not a per-team board). Left: a fixed agenda, with a whole-meeting
 * countdown once the meeting is actually started. Right: whatever the current agenda step has to
 * show - see renderPanel.
 *
 * Two modes: before "Starta möte", clicking any agenda item just previews its panel - no flash, no
 * running timer, nothing recorded. Starting resets to step 0 with a fresh clock; from then on every
 * step change (Nästa/Föregående, arrow keys, or clicking a different agenda item) flashes the
 * transition card, same as a real meeting.
 */
export function TeamCheckInBoard({ onNavigate, onHome }: TeamCheckInBoardProps) {
  const { showToast } = useToast();
  const [started, setStarted] = useState(false);
  // Tracked by id rather than index: "Veckans influencers" can appear as point 2 after the board
  // has loaded (its fetch resolves later), which would otherwise shift every later step's index.
  const [stepId, setStepId] = useState<AgendaStepId>("laget-runt");
  const [todaysInfluencers, setTodaysInfluencers] = useState<MeetingInfluencerDto[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(TOTAL_SECONDS);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [endingMeeting, setEndingMeeting] = useState(false);
  const playedQuarterRef = useRef(false);
  const playedFiveRef = useRef(false);

  const agenda = useMemo(() => buildAgenda(todaysInfluencers.map((i) => i.displayName)), [todaysInfluencers]);
  const agendaRef = useRef(agenda);
  agendaRef.current = agenda;
  const stepIndex = Math.max(0, agenda.findIndex((s) => s.id === stepId));
  const step = agenda[stepIndex];

  // Anyone drawn at an earlier meeting to present today becomes agenda point 2.
  useEffect(() => {
    const controller = new AbortController();
    fetchMeetingInfluencers(todayIso(), controller.signal)
      .then(setTodaysInfluencers)
      .catch(() => {
        // Not worth interrupting the meeting over - the agenda just runs without point 2.
      });
    return () => controller.abort();
  }, []);

  function handleInfluencersChanged(meetingDate: string, influencers: MeetingInfluencerDto[]) {
    if (meetingDate === todayIso()) setTodaysInfluencers(influencers);
  }

  function moveBy(delta: number) {
    setStepId((current) => {
      const list = agendaRef.current;
      const i = Math.max(0, list.findIndex((s) => s.id === current));
      return list[Math.min(Math.max(i + delta, 0), list.length - 1)].id;
    });
  }

  useEffect(() => {
    if (!started || !timerEnabled) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === QUARTER_LEFT_SECONDS && !playedQuarterRef.current) {
          playedQuarterRef.current = true;
          playQuarterLeftSignal();
          showToast("En kvart kvar av mötet.");
        }
        if (next === FIVE_LEFT_SECONDS && !playedFiveRef.current) {
          playedFiveRef.current = true;
          playFiveLeftSignal();
          showToast("5 minuter kvar av mötet.", "error");
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [started, timerEnabled, showToast]);

  // Flashes on every step change once the meeting is running - but this effect also fires once on
  // mount (before anything has been started), where it must stay silent.
  useEffect(() => {
    if (started) setTransitioning(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  // Arrow-key browsing of the agenda - both before and during the meeting. Ignored while focus is
  // in a text field (search boxes, the wiki-url editor, …) so it doesn't fight the caret.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(document.activeElement) || isDialogOpen()) return;
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goBack();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goNext() {
    if (started && timerEnabled) ensureAudio();
    moveBy(1);
  }

  function goBack() {
    if (started && timerEnabled) ensureAudio();
    moveBy(-1);
  }

  function jumpTo(i: number) {
    if (started && timerEnabled) ensureAudio();
    setStepId(agenda[i].id);
  }

  function handleStart() {
    setStarted(true);
    setStepId(agenda[0].id);
    setRemainingSeconds(TOTAL_SECONDS);
    playedQuarterRef.current = false;
    playedFiveRef.current = false;
    if (timerEnabled) ensureAudio();
    // Flashes even though stepIndex may already have been 0 from browsing beforehand - "the
    // meeting has actually begun" deserves its own flash regardless of which step that happens to be.
    setTransitioning(true);
  }

  function handleEndMeeting() {
    setEndingMeeting(true);
  }

  /** Closing the "tack för idag" card is also what resets the board - the next time someone opens
   *  Teamavstämning it should start fresh (▶ Starta möte again), not resume a stopped clock on
   *  whichever step the meeting happened to end on. */
  function handleCloseEndMeeting() {
    setEndingMeeting(false);
    setStarted(false);
    setStepId(agenda[0].id);
    setRemainingSeconds(TOTAL_SECONDS);
    playedQuarterRef.current = false;
    playedFiveRef.current = false;
  }

  function toggleTimer() {
    setTimerEnabled((prev) => {
      const next = !prev;
      if (next) ensureAudio();
      return next;
    });
  }

  const level = remainingSeconds <= FIVE_LEFT_SECONDS ? "crit" : remainingSeconds <= QUARTER_LEFT_SECONDS ? "warn" : "";

  return (
    <BoardShell activeBoard="teamcheckin" onNavigate={onNavigate} onHome={onHome} title="Teamavstämning">
      <div className="tcb-layout">
        <div className="tcb-left">
          {!started ? (
            <button type="button" className="daily-flow__btn daily-flow__btn--primary tcb-start" onClick={handleStart}>
              ▶ Starta möte
            </button>
          ) : (
            <div className={"tcb-timer" + (level ? ` tcb-timer--${level}` : "")}>
              <div className="tcb-timer__clock">{timerEnabled ? formatClock(remainingSeconds) : "--:--"}</div>
              <button type="button" className="tcb-timer__toggle" onClick={toggleTimer} title={timerEnabled ? "Stäng av timern" : "Slå på timern"}>
                ⏱
              </button>
            </div>
          )}

          <ol className="tcb-agenda">
            {agenda.map((s, i) => (
              <li
                key={s.id}
                className={
                  "tcb-agenda__item" +
                  (i === stepIndex ? " tcb-agenda__item--active" : started && i < stepIndex ? " tcb-agenda__item--done" : "")
                }
              >
                <button type="button" className="tcb-agenda__button" onClick={() => jumpTo(i)} title={started ? undefined : "Förhandsgranska"}>
                  <span className="tcb-agenda__icon">{s.icon}</span>
                  <span className="tcb-agenda__label">{s.label}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="tcb-controls">
            <button type="button" className="daily-flow__btn" onClick={goBack} disabled={stepIndex === 0}>
              ← Föregående
            </button>
            <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={goNext} disabled={stepIndex === agenda.length - 1}>
              Nästa →
            </button>
          </div>

          {started && (
            <button type="button" className="daily-flow__btn tcb-end" onClick={handleEndMeeting}>
              ⏹ Avsluta mötet
            </button>
          )}
        </div>

        <div className="tcb-right">
          {!started && <div className="tcb-preview-banner">Förhandsgranskning - mötet är inte startat än</div>}
          {renderPanel(step, todaysInfluencers, handleInfluencersChanged)}
        </div>
      </div>

      {transitioning && <StepTransitionModal step={step} onDone={() => setTransitioning(false)} />}
      {endingMeeting && <EndMeetingModal onClose={handleCloseEndMeeting} />}
    </BoardShell>
  );
}
