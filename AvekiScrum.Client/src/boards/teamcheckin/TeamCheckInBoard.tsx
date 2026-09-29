import { useEffect, useRef, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { useToast } from "../../components/Toast";
import { AGENDA, type AgendaStep } from "./agenda";
import { StepTransitionModal } from "./StepTransitionModal";
import { PlannerPanel } from "./PlannerPanel";
import { RolePlaceholderPanel } from "./RolePlaceholderPanel";
import { ScrumMasterView } from "./ScrumMasterView";
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
    default:
      return <RolePlaceholderPanel step={step} />;
  }
}

interface TeamCheckInBoardProps {
  onNavigate?: (board: "refinement" | "dailys" | "review" | "test" | "teamcheckin") => void;
  onHome?: () => void;
}

/**
 * "Teamavstämning" - a recurring cross-team meeting, deliberately with no team switcher (it's one
 * meeting for both teams, not a per-team board). Left: a fixed agenda stepped through by hand, with
 * a whole-meeting countdown. Right: whatever the current agenda step has to show - see renderPanel.
 */
export function TeamCheckInBoard({ onNavigate, onHome }: TeamCheckInBoardProps) {
  const { showToast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(TOTAL_SECONDS);
  const [timerEnabled, setTimerEnabled] = useState(true);
  // Flashes on the very first step too - "here's what we're starting with" is as useful as "here's
  // what's next".
  const [transitioning, setTransitioning] = useState(true);
  const playedQuarterRef = useRef(false);
  const playedFiveRef = useRef(false);

  const step = AGENDA[stepIndex];

  useEffect(() => {
    if (!timerEnabled) return;
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
  }, [timerEnabled, showToast]);

  useEffect(() => {
    setTransitioning(true);
  }, [step.id]);

  function goNext() {
    if (timerEnabled) ensureAudio();
    setStepIndex((i) => Math.min(i + 1, AGENDA.length - 1));
  }

  function goBack() {
    if (timerEnabled) ensureAudio();
    setStepIndex((i) => Math.max(i - 1, 0));
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
          <div className={"tcb-timer" + (level ? ` tcb-timer--${level}` : "")}>
            <div className="tcb-timer__clock">{timerEnabled ? formatClock(remainingSeconds) : "--:--"}</div>
            <button type="button" className="tcb-timer__toggle" onClick={toggleTimer} title={timerEnabled ? "Stäng av timern" : "Slå på timern"}>
              ⏱
            </button>
          </div>

          <ol className="tcb-agenda">
            {AGENDA.map((s, i) => (
              <li
                key={s.id}
                className={
                  "tcb-agenda__item" +
                  (i === stepIndex ? " tcb-agenda__item--active" : i < stepIndex ? " tcb-agenda__item--done" : "")
                }
              >
                <span className="tcb-agenda__icon">{s.icon}</span>
                <span className="tcb-agenda__label">{s.label}</span>
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

        <div className="tcb-right">{renderPanel(step)}</div>
      </div>

      {transitioning && <StepTransitionModal step={step} onDone={() => setTransitioning(false)} />}
    </BoardShell>
  );
}
