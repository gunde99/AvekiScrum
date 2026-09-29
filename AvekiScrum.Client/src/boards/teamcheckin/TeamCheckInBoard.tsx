import { useEffect, useRef, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { useToast } from "../../components/Toast";
import { AGENDA, type AgendaStep } from "./agenda";
import { StepTransitionModal } from "./StepTransitionModal";
import { PlannerPanel } from "./PlannerPanel";
import { RolePlaceholderPanel } from "./RolePlaceholderPanel";
import { ScrumMasterView } from "./ScrumMasterView";
import { ReleaseTestView } from "./ReleaseTestView";
import "./TeamCheckInBoard.css";

// 60 minutes is a starting guess for how long a Teamavstämning actually runs - retune this one
// constant if the real slot turns out shorter/longer. The two warnings are fixed relative to it:
// "kvarten kvar" (15 min left) and "5 min kvar", same idea as DailyFlow's own meeting timer.
const TOTAL_SECONDS = 60 * 60;
const QUARTER_LEFT_SECONDS = 15 * 60;
const FIVE_LEFT_SECONDS = 5 * 60;

// Tones via the Web Audio API rather than shipped sound files - same approach as DailyFlow.tsx's
// own timer, duplicated rather than shared since the two boards' timers otherwise have nothing in
// common (this one is a flat countdown with no per-turn budget).
let audioCtx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioCtor();
    } catch {
      audioCtx = null;
    }
  } else if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq: number, durMs: number, delayMs = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const start = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durMs / 1000 + 0.05);
}

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

function renderPanel(step: AgendaStep) {
  switch (step.id) {
    case "aktivitetsboarden":
      return <PlannerPanel />;
    case "scrum-master":
      return <ScrumMasterView />;
    case "release-test":
      return <ReleaseTestView />;
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
  const [stepIndex, setStepIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(TOTAL_SECONDS);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const playedQuarterRef = useRef(false);
  const playedFiveRef = useRef(false);

  const step = AGENDA[stepIndex];

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
      if (isTypingTarget(document.activeElement)) return;
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goBack();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goNext() {
    if (started && timerEnabled) ensureAudio();
    setStepIndex((i) => Math.min(i + 1, AGENDA.length - 1));
  }

  function goBack() {
    if (started && timerEnabled) ensureAudio();
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function jumpTo(i: number) {
    if (started && timerEnabled) ensureAudio();
    setStepIndex(i);
  }

  function handleStart() {
    setStarted(true);
    setStepIndex(0);
    setRemainingSeconds(TOTAL_SECONDS);
    playedQuarterRef.current = false;
    playedFiveRef.current = false;
    if (timerEnabled) ensureAudio();
    // Flashes even though stepIndex may already have been 0 from browsing beforehand - "the
    // meeting has actually begun" deserves its own flash regardless of which step that happens to be.
    setTransitioning(true);
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
            {AGENDA.map((s, i) => (
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
            <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={goNext} disabled={stepIndex === AGENDA.length - 1}>
              Nästa →
            </button>
          </div>
        </div>

        <div className="tcb-right">
          {!started && <div className="tcb-preview-banner">Förhandsgranskning - mötet är inte startat än</div>}
          {renderPanel(step)}
        </div>
      </div>

      {transitioning && <StepTransitionModal step={step} onDone={() => setTransitioning(false)} />}
    </BoardShell>
  );
}
