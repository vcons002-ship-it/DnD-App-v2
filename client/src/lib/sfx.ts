/**
 * Tiny procedural sound-effect synth for combat cues — NO binary assets, NO
 * licensing. Built on the Web Audio API: each cue is a short oscillator blip with
 * a quick volume envelope. Cues:
 *   - playHit   — a hit landed / damage dealt (a sharp downward thunk)
 *   - playMiss  — an attack missed (a soft, low "whiff")
 *   - playHeal  — healing applied (a gentle rising chime)
 *   - playSkill — a skill/save check resolved (a short neutral tick)
 *
 * Muting is per-user (localStorage, DEFAULT ON / unmuted). Browsers block audio
 * until a user gesture, so the context is created lazily and resumed on the first
 * pointer/key interaction.
 */

const MUTE_KEY = 'dnd.sfxMuted';

let ctx: AudioContext | null = null;
let gestureArmed = false;

/** Per-user mute flag — default OFF (sound on). */
export function isSfxMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setSfxMuted(muted: boolean): void {
  if (muted) localStorage.setItem(MUTE_KEY, '1');
  else localStorage.removeItem(MUTE_KEY);
}

/** Lazily build the AudioContext and arm a one-time gesture to resume it. */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (!gestureArmed) {
    gestureArmed = true;
    const resume = () => ctx?.resume().catch(() => {});
    window.addEventListener('pointerdown', resume, { once: false, passive: true });
    window.addEventListener('keydown', resume, { once: false, passive: true });
  }
  // Best-effort resume (no-op if already running or still gesture-blocked).
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Play one short tone with an attack/decay envelope. */
function blip(opts: {
  type: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  gain?: number;
}): void {
  if (isSfxMuted()) return;
  const ac = audio();
  if (!ac || ac.state !== 'running') return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const peak = opts.gain ?? 0.08;
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, now);
  if (opts.to && opts.to !== opts.from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), now + opts.dur);
  }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + opts.dur);
  osc.connect(g).connect(ac.destination);
  osc.start(now);
  osc.stop(now + opts.dur + 0.02);
}

/** A hit landed — a sharp downward thunk. */
export function playHit(): void {
  blip({ type: 'square', from: 320, to: 120, dur: 0.14, gain: 0.09 });
}

/** An attack missed — a soft low whiff. */
export function playMiss(): void {
  blip({ type: 'sine', from: 200, to: 90, dur: 0.18, gain: 0.05 });
}

/** Healing applied — a gentle rising chime. */
export function playHeal(): void {
  blip({ type: 'triangle', from: 440, to: 660, dur: 0.22, gain: 0.06 });
}

/** A skill/save check resolved — a short neutral tick. */
export function playSkill(): void {
  blip({ type: 'triangle', from: 520, dur: 0.1, gain: 0.05 });
}
