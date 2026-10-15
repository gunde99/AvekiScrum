// Tones via the Web Audio API rather than shipped sound files - same approach as DailyFlow.tsx's
// own timer. Shared by TeamCheckInBoard's meeting countdown and the influencer lottery's reel.
let audioCtx: AudioContext | null = null;

/** Creates (or resumes) the shared context - call it from a click so the browser allows sound. */
export function ensureAudio(): AudioContext | null {
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

export function playTone(freq: number, durMs: number, delayMs = 0, type: OscillatorType = "sine", volume = 0.16) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const start = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.02, durMs / 4000));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durMs / 1000 + 0.05);
}

/** The reel's click as a card passes the pointer - short and dry, like a prize wheel's flapper. */
export function playTick(pitch = 1400) {
  playTone(pitch, 28, 0, "triangle", 0.09);
}

/** Rising arpeggio for the moment the reel lands on someone. */
export function playFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => playTone(f, i === notes.length - 1 ? 520 : 160, i * 110, "triangle", 0.14));
  playTone(1318.5, 600, notes.length * 110, "sine", 0.08);
}
