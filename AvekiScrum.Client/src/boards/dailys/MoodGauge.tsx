import "./MoodGauge.css";

const EMOJIS = ["😞", "🙁", "😐", "🙂", "😄"];

const CX = 100;
const CY = 96;
const R = 80;
const NEEDLE_LEN = 68;

function polar(r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

const LEFT = polar(R, 180);
const RIGHT = polar(R, 0);
// large-arc-flag=1 forces the major (180 degree) arc; sweep-flag=1 sweeps it through the top
// rather than the bottom. sweep-flag=0 (tried first) put the arc on the wrong side of the
// chord, which rendered as two nearly-straight lines meeting in a point instead of a dome.
const TRACK_PATH = `M ${LEFT.x} ${LEFT.y} A ${R} ${R} 0 1 1 ${RIGHT.x} ${RIGHT.y}`;

function valueToAngle(value: number): number {
  const clamped = Math.min(5, Math.max(1, value));
  return 180 - ((clamped - 1) / 4) * 180;
}

interface MoodGaugeProps {
  value: number | null;
}

/** A single smooth half-circle track (red -> green gradient) with a needle pointing at the
    chosen value, and a matching emoji - the classic daily-standup "how are you feeling" check-in. */
export function MoodGauge({ value }: MoodGaugeProps) {
  const angle = value ? valueToAngle(value) : null;
  const needleTip = angle !== null ? polar(NEEDLE_LEN, angle) : null;

  return (
    <div className="mood-gauge">
      <svg viewBox="0 0 200 108" className="mood-gauge__svg">
        <defs>
          <linearGradient id="moodGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e5484d" />
            <stop offset="25%" stopColor="#f2994a" />
            <stop offset="50%" stopColor="#f2c94c" />
            <stop offset="75%" stopColor="#a3d977" />
            <stop offset="100%" stopColor="#4caf50" />
          </linearGradient>
        </defs>
        <path d={TRACK_PATH} stroke="url(#moodGaugeGrad)" strokeWidth={18} strokeLinecap="round" fill="none" />
        {needleTip && (
          <>
            <line x1={CX} y1={CY} x2={needleTip.x} y2={needleTip.y} stroke="var(--color-text)" strokeWidth={4} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={8} fill="var(--color-text)" />
          </>
        )}
      </svg>
      <div className="mood-gauge__emoji">{value ? EMOJIS[Math.min(5, Math.max(1, Math.round(value))) - 1] : "❓"}</div>
    </div>
  );
}
