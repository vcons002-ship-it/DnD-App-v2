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
const VOLUME_KEY = 'dnd.sfxVolume';
const DICE_KEY = 'dnd.diceSfxOff';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let gestureArmed = false;

// Storage can throw (private windows, blocked site data): fall back to defaults.
const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null): void => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* per-device nicety only */ }
};

/** Per-user mute flag — default OFF (sound on). */
export function isSfxMuted(): boolean {
  return read(MUTE_KEY) === '1';
}

export function setSfxMuted(muted: boolean): void {
  write(MUTE_KEY, muted ? '1' : null);
}

/** Master volume 0–1 for every cue on this device (default 0.8). */
export function getSfxVolume(): number {
  const v = Number(read(VOLUME_KEY));
  return read(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
}

export function setSfxVolume(volume: number): void {
  const v = Math.max(0, Math.min(1, volume));
  write(VOLUME_KEY, String(v));
  if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}

/** The saved "Dice sounds" choice on its own (on by default) — what the setting
 *  shows. Independent of the master mute, so muting never rewrites it. */
export function isDiceSfxPreferred(): boolean {
  return read(DICE_KEY) !== '1';
}

/** Whether dice sounds actually play: the saved choice AND master sound on. */
export function isDiceSfxOn(): boolean {
  return isDiceSfxPreferred() && !isSfxMuted();
}

export function setDiceSfxOn(on: boolean): void {
  write(DICE_KEY, on ? null : '1');
}

/** Lazily build the AudioContext and arm a one-time gesture to resume it. */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = getSfxVolume();
    master.connect(ctx.destination);
  }
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

/** The running context + master bus for other synths (the dice). Null while
 *  muted, before a user gesture, or without Web Audio. */
export function sfxOutput(): { ac: AudioContext; out: AudioNode } | null {
  if (isSfxMuted()) return null;
  const ac = audio();
  if (!ac || ac.state !== 'running' || !master) return null;
  return { ac, out: master };
}

/** Play one short tone with an attack/decay envelope. */
function blip(opts: {
  type: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  gain?: number;
  delay?: number;
}): void {
  if (isSfxMuted()) return;
  const ac = audio();
  if (!ac || ac.state !== 'running') return;
  const now = ac.currentTime + (opts.delay ?? 0);
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
  osc.connect(g).connect(master ?? ac.destination);
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

/** Layered, short cues share the existing per-user mute and gesture gate. */
export function playCritical(): void {
  blip({type: 'triangle', from: 220, to: 880, dur: .42, gain: .10});
  blip({type: 'sine', from: 660, to: 1320, dur: .6, gain: .07});
}
export function playInitiative(): void {
  blip({type: 'triangle', from: 220, dur: .2, gain: .08});
  blip({type: 'triangle', from: 330, dur: .24, gain: .08, delay: .15});
  blip({type: 'triangle', from: 440, dur: .6, gain: .09, delay: .3});
  blip({type: 'sine', from: 660, dur: .65, gain: .045, delay: .3});
}
export function playYourTurn(): void {
  blip({type: 'sine', from: 660, dur: .25, gain: .08});
  blip({type: 'sine', from: 880, dur: .55, gain: .08, delay: .18});
  blip({type: 'triangle', from: 440, dur: .5, gain: .04, delay: .18});
}
/** The party rested — a soft, low settling chord. */
export function playRest(): void {
  blip({type: 'sine', from: 196, dur: .9, gain: .06});
  blip({type: 'sine', from: 247, dur: .9, gain: .045, delay: .12});
  blip({type: 'triangle', from: 294, dur: 1.1, gain: .04, delay: .24});
}
