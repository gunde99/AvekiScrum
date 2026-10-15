import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { PersonAvatar } from "../../components/PersonAvatar";
import type { InfluencerCandidate } from "./InfluencerLotteryPanel";
import { ensureAudio, playFanfare, playTick } from "./meetingAudio";
import "./InfluencerSpinner.css";

// Reel geometry - CARD_PITCH is one card plus the gap between cards, so "position p" (a float
// index into the strip) maps straight onto a pixel offset.
const CARD_WIDTH = 150;
const CARD_GAP = 18;
const CARD_PITCH = CARD_WIDTH + CARD_GAP;

// How far the reel travels and for how long. easeOutCubic over ~7s gives a fast blur at first and
// a long crawl over the last couple of cards - that crawl is where the suspense lives.
const TRAVEL_CARDS = 58;
const SPIN_MS = 7200;
const SETTLE_MS = 520;
const REDUCED_SPIN_MS = 1600;

// Where inside the winner's card the reel first comes to rest, as a fraction of a card either side
// of centre. Landing near an edge makes the last tick a genuine "will it go over?" moment; the
// settle step then eases it onto dead centre.
const LANDING_JITTER = 0.44;

const CONFETTI_COLORS = ["var(--aveki-orange)", "var(--aveki-yellow)", "var(--aveki-green)", "var(--aveki-blue-tint-2)", "#ffffff"];

type Phase = "spinning" | "landed";

function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * The strip the reel scrolls through: the visual pool, reshuffled per lap so it doesn't read as an
 * obvious loop, with the winner planted at `winnerIndex` and never directly beside itself.
 */
function buildStrip(pool: InfluencerCandidate[], winner: InfluencerCandidate, winnerIndex: number): InfluencerCandidate[] {
  const source = pool.length > 0 ? pool : [winner];
  const strip: InfluencerCandidate[] = [];
  while (strip.length < winnerIndex + 6) strip.push(...shuffled(source));
  strip.length = winnerIndex + 6;
  strip[winnerIndex] = winner;
  const others = source.filter((c) => c.email !== winner.email);
  if (others.length > 0) {
    for (const i of [winnerIndex - 1, winnerIndex + 1]) {
      if (strip[i].email === winner.email) strip[i] = others[randomInt(others.length)];
    }
  }
  return strip;
}

interface Spin {
  strip: InfluencerCandidate[];
  winner: InfluencerCandidate;
  winnerIndex: number;
  startPos: number;
  landPos: number;
}

function planSpin(reelPool: InfluencerCandidate[], drawPool: InfluencerCandidate[]): Spin {
  const winner = drawPool[randomInt(drawPool.length)];
  const startPos = 2 + Math.random();
  const winnerIndex = Math.round(startPos + TRAVEL_CARDS);
  const jitter = (Math.random() * 2 - 1) * LANDING_JITTER;
  return { strip: buildStrip(reelPool, winner, winnerIndex), winner, winnerIndex, startPos, landPos: winnerIndex + jitter };
}

interface InfluencerSpinnerProps {
  /** Everyone shown flying past - the whole eligible group, for spectacle. */
  reelPool: InfluencerCandidate[];
  /** Who can actually win - with fair rotation on, only those who haven't had a turn this round. */
  drawPool: InfluencerCandidate[];
  meetingDateText: string;
  onAccept: (winner: InfluencerCandidate) => void;
  onClose: () => void;
}

/**
 * Full-screen "prize reel" for the influencer lottery: photo cards race past a centre pointer,
 * click like a wheel's flapper as each one passes, decelerate into a long crawl and finally land -
 * followed by a spotlight reveal with confetti. "Slumpa om" spins again without the person just
 * drawn (they were away, say); "Lägg till" hands the winner back to the panel.
 */
export function InfluencerSpinner({ reelPool, drawPool, meetingDateText, onAccept, onClose }: InfluencerSpinnerProps) {
  const reducedMotion = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);
  // People skipped with "Slumpa om" during this session of the spinner - not drawable again until it closes.
  const [skipped, setSkipped] = useState<string[]>([]);
  const effectiveDrawPool = useMemo(() => {
    const remaining = drawPool.filter((c) => !skipped.includes(c.email));
    return remaining.length > 0 ? remaining : drawPool;
  }, [drawPool, skipped]);

  const [spin, setSpin] = useState<Spin>(() => planSpin(reelPool, drawPool));
  const [phase, setPhase] = useState<Phase>("spinning");
  const [centerIndex, setCenterIndex] = useState(() => Math.round(spin.startPos));
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const placeStrip = useCallback((pos: number, blurPx: number) => {
    const viewport = viewportRef.current;
    const strip = stripRef.current;
    if (!viewport || !strip) return;
    const x = viewport.clientWidth / 2 - (pos * CARD_PITCH + CARD_WIDTH / 2);
    strip.style.transform = `translate3d(${x}px, 0, 0)`;
    strip.style.filter = blurPx > 0.3 ? `blur(${blurPx.toFixed(2)}px)` : "none";
  }, []);

  useEffect(() => {
    ensureAudio();
    let raf = 0;
    let lastTick = Math.round(spin.startPos);
    const spinMs = reducedMotion ? REDUCED_SPIN_MS : SPIN_MS;
    const distance = spin.landPos - spin.startPos;
    const t0 = performance.now();
    let prevPos = spin.startPos;
    let prevTime = t0;

    const frame = (now: number) => {
      const elapsed = now - t0;
      let pos: number;
      if (elapsed < spinMs) {
        pos = spin.startPos + distance * easeOutCubic(elapsed / spinMs);
      } else if (elapsed < spinMs + SETTLE_MS) {
        pos = spin.landPos + (spin.winnerIndex - spin.landPos) * easeInOutSine((elapsed - spinMs) / SETTLE_MS);
      } else {
        pos = spin.winnerIndex;
      }

      const velocity = (pos - prevPos) / Math.max(1, now - prevTime) * 1000; // cards per second
      prevPos = pos;
      prevTime = now;
      placeStrip(pos, reducedMotion ? 0 : Math.min(5, Math.abs(velocity) / 7));

      const nearest = Math.round(pos);
      if (nearest !== lastTick) {
        lastTick = nearest;
        setCenterIndex(nearest);
        // Pitch climbs a little as the reel slows, so the crawl sounds tenser rather than duller.
        playTick(1250 + Math.max(0, 600 - Math.abs(velocity) * 25));
      }

      if (elapsed < spinMs + SETTLE_MS) {
        raf = requestAnimationFrame(frame);
      } else {
        setCenterIndex(spin.winnerIndex);
        setPhase("landed");
        playFanfare();
      }
    };

    placeStrip(spin.startPos, 0);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spin, placeStrip, reducedMotion]);

  // Keep the strip centred if the window is resized mid-spin or after landing.
  useEffect(() => {
    function onResize() {
      if (phase === "landed") placeStrip(spin.winnerIndex, 0);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, spin, placeStrip]);

  const reroll = useCallback(() => {
    const nextSkipped = [...skipped, spin.winner.email];
    setSkipped(nextSkipped);
    const remaining = drawPool.filter((c) => !nextSkipped.includes(c.email));
    const pool = remaining.length > 0 ? remaining : drawPool;
    setPhase("spinning");
    setSpin(planSpin(reelPool, pool));
  }, [skipped, spin.winner.email, drawPool, reelPool]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (phase !== "landed") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter") onAccept(spin.winner);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, spin.winner, onAccept, onClose]);

  const confetti = useMemo(() => {
    if (reducedMotion) return [];
    return Array.from({ length: 90 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 140 + Math.random() * 320;
      return {
        key: i,
        style: {
          "--dx": `${Math.cos(angle) * dist}px`,
          "--dy": `${Math.sin(angle) * dist * 0.7 - 80}px`,
          "--rot": `${Math.random() * 900 - 450}deg`,
          "--delay": `${Math.random() * 0.15}s`,
          "--dur": `${1.6 + Math.random() * 1.1}s`,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          width: `${6 + Math.random() * 6}px`,
          height: `${10 + Math.random() * 8}px`,
        } as CSSProperties,
      };
    });
    // A fresh burst per landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin, reducedMotion]);

  const canReroll = effectiveDrawPool.filter((c) => c.email !== spin.winner.email).length > 0;

  return createPortal(
    <div className={"tci-spin-overlay" + (phase === "landed" ? " tci-spin-overlay--landed" : "")} role="dialog" aria-modal="true" aria-label="Lottning av nästa veckas influencer">
      <div className="tci-spin-stage">
        <div className="tci-spin-heading">
          <div className="tci-spin-eyebrow">Teamavstämning {meetingDateText}</div>
          <div className="tci-spin-title">{phase === "spinning" ? "Vem blir nästa veckas influencer?" : "Nästa veckas influencer är…"}</div>
        </div>

        <div className="tci-spin-reel">
          <div className="tci-spin-viewport" ref={viewportRef}>
            <div className="tci-spin-strip" ref={stripRef}>
              {spin.strip.map((c, i) => (
                <div
                  key={i}
                  className={
                    "tci-spin-card" +
                    (i === centerIndex ? " tci-spin-card--center" : "") +
                    (phase === "landed" && i === spin.winnerIndex ? " tci-spin-card--winner" : "")
                  }
                  style={{ width: CARD_WIDTH, marginRight: CARD_GAP }}
                >
                  <PersonAvatar name={c.displayName} size={108} />
                  <div className="tci-spin-card__name">{c.displayName}</div>
                  <div className="tci-spin-card__team">{c.teams.join(" + ")}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="tci-spin-pointer tci-spin-pointer--top" aria-hidden="true" />
          <div className="tci-spin-pointer tci-spin-pointer--bottom" aria-hidden="true" />
          <div className="tci-spin-frame" aria-hidden="true" />
        </div>

        {phase === "landed" && (
          <div className="tci-spin-reveal" key={spin.winnerIndex + spin.winner.email}>
            <div className="tci-spin-confetti" aria-hidden="true">
              {confetti.map((p) => (
                <span key={p.key} className="tci-spin-confetti__piece" style={p.style} />
              ))}
            </div>
            <div className="tci-spin-reveal__halo" aria-hidden="true" />
            <div className="tci-spin-reveal__photo">
              <PersonAvatar name={spin.winner.displayName} size={200} />
            </div>
            <div className="tci-spin-reveal__name">{spin.winner.displayName}</div>
            <div className="tci-spin-reveal__team">Team {spin.winner.teams.join(" + ")}</div>
            <div className="tci-spin-actions">
              <button type="button" className="daily-flow__btn daily-flow__btn--primary tci-spin-actions__accept" onClick={() => onAccept(spin.winner)} autoFocus>
                ✓ Lägg till i panelen
              </button>
              <button
                type="button"
                className="daily-flow__btn"
                onClick={reroll}
                disabled={!canReroll}
                title={canReroll ? "Snurra igen utan den här personen (t.ex. borta nästa vecka)" : "Ingen annan kvar att dra"}
              >
                ↻ Slumpa om
              </button>
              <button type="button" className="daily-flow__btn tci-spin-actions__cancel" onClick={onClose}>
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
