/**
 * Physical dice sounds, synthesised (no audio files) from what the simulation
 * actually did:
 *  - every recorded IMPACT (shared/diceImpacts.ts) is a short filtered-noise
 *    transient: a bright acrylic clack die-on-die, a hollow wooden knock on a
 *    wall, a duller thud on the tray floor — louder the harder it hit, pitched
 *    by die size, panned to where it happened;
 *  - every MOVING die has its own soft rolling rumble whose level follows its
 *    speed along the floor and fades out as that die settles.
 * Built on the shared sfx master bus, so the mute, volume and "Dice sounds"
 * toggle all apply. Noise sources only (no oscillators): the cue timing tests
 * count oscillator starts as the hit/miss cues.
 */
import type { DiceImpact } from '../../../shared/diceImpacts';
import { isDiceSfxOn, sfxOutput } from './sfx';

let noise: { ac: AudioContext; buffer: AudioBuffer } | null = null;
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise?.ac === ac) return noise.buffer;
  const buffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = { ac, buffer };
  return buffer;
}

/** Smaller dice ring higher; a d20 is a little lower than a d6. */
const SIZE_PITCH: Record<number, number> = { 4: 1.25, 6: 1.08, 8: 1.12, 10: 1.0, 12: 0.94, 20: 0.88 };
const SURFACE = {
  die: { freq: 3400, q: 7, decay: 0.035, gain: 0.55 },
  wall: { freq: 950, q: 3.5, decay: 0.07, gain: 0.5 },
  floor: { freq: 620, q: 2.2, decay: 0.045, gain: 0.32 },
} as const;
/** Impact speed (m/s) that counts as a full-strength strike. */
const LOUD = 0.9;

// A dense pile can produce dozens of contacts at once; cap simultaneous voices.
let recent: number[] = [];
const MAX_VOICES_PER_50MS = 6;

function strike(ac: AudioContext, out: AudioNode, impact: Pick<DiceImpact, 'with' | 'speed' | 'x'>, sides: number, at: number): void {
  const now = ac.currentTime;
  recent = recent.filter((t) => t > now - 0.05);
  if (recent.length >= MAX_VOICES_PER_50MS) return;
  recent.push(at);
  const shape = SURFACE[impact.with];
  const strength = Math.min(1, impact.speed / LOUD) ** 1.3;
  const pitch = (SIZE_PITCH[sides] ?? 1) * (0.92 + Math.random() * 0.16);
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = shape.freq * pitch * (0.85 + strength * 0.3);
  band.Q.value = shape.q;
  const env = ac.createGain();
  const peak = Math.max(0.0002, shape.gain * strength);
  const decay = shape.decay * (0.7 + strength * 0.6);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + 0.0015);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  let chain: AudioNode = src.connect(band).connect(env);
  if (typeof ac.createStereoPanner === 'function') {
    const pan = ac.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, impact.x * 0.7));
    chain = chain.connect(pan);
  }
  chain.connect(out);
  src.start(at, Math.random() * 0.8);
  src.stop(at + decay + 0.02);
}

/** One sample clack for the settings toggle. */
export function previewDiceClack(): void {
  const o = sfxOutput();
  if (!o) return;
  const t = o.ac.currentTime + 0.01;
  strike(o.ac, o.out, { with: 'floor', speed: 0.6, x: -0.2 }, 20, t);
  strike(o.ac, o.out, { with: 'die', speed: 0.5, x: 0.1 }, 6, t + 0.09);
  strike(o.ac, o.out, { with: 'wall', speed: 0.4, x: 0.5 }, 8, t + 0.21);
}

type Voice = { src: AudioBufferSourceNode; gain: GainNode };

/**
 * A player for ONE roll: schedule its impacts and drive each die's rolling
 * level. `sides[i]` is die i's size. Safe to call when sound is off — every
 * method is then a no-op.
 */
export function createDiceSound(sides: number[]) {
  const voices = new Map<number, Voice>();
  let stopped = false;
  const output = () => (stopped || !isDiceSfxOn() ? null : sfxOutput());

  /** Play impacts `delay` seconds from now (0 = immediately). */
  function impacts(list: DiceImpact[], delayFor: (impact: DiceImpact) => number): void {
    const o = output();
    if (!o) return;
    for (const impact of list) {
      const delay = delayFor(impact);
      if (delay < -0.05) continue; // already past; never replay a burst late
      strike(o.ac, o.out, impact, sides[impact.die] ?? 6, o.ac.currentTime + Math.max(0, delay));
    }
  }

  /** Per-die floor speed (m/s; 0 = settled / airborne): sets each rumble. */
  function rolling(speeds: number[]): void {
    const o = output();
    if (!o) { voices.forEach((v) => v.gain.gain.setTargetAtTime(0, v.gain.context.currentTime, 0.03)); return; }
    // Only the six fastest dice rumble — a fistful of d6 shouldn't roar.
    const loudest = new Set(speeds.map((s, i) => [s, i] as const).filter(([s]) => s > 0.02)
      .sort((a, b) => b[0] - a[0]).slice(0, 6).map(([, i]) => i));
    speeds.forEach((speed, i) => {
      let voice = voices.get(i);
      const level = loudest.has(i) ? Math.min(1, speed / 0.7) * 0.07 : 0;
      if (!voice && level <= 0) return;
      if (!voice) {
        const src = o.ac.createBufferSource();
        src.buffer = noiseBuffer(o.ac);
        src.loop = true;
        src.playbackRate.value = 0.7 + Math.random() * 0.3;
        const low = o.ac.createBiquadFilter();
        low.type = 'bandpass';
        low.frequency.value = 900 * (SIZE_PITCH[sides[i]] ?? 1);
        low.Q.value = 0.9;
        const gain = o.ac.createGain();
        gain.gain.value = 0;
        src.connect(low).connect(gain).connect(o.out);
        src.start(o.ac.currentTime, Math.random());
        voice = { src, gain };
        voices.set(i, voice);
      }
      voice.gain.gain.setTargetAtTime(level, o.ac.currentTime, 0.04);
    });
  }

  /** Fade every rumble out and release the nodes. */
  function stop(): void {
    stopped = true;
    voices.forEach((v) => {
      const t = v.gain.context.currentTime;
      v.gain.gain.setTargetAtTime(0, t, 0.05);
      try { v.src.stop(t + 0.3); } catch { /* already stopped */ }
    });
    voices.clear();
  }

  return { impacts, rolling, stop };
}

/**
 * Floor speed of each die from two pose snapshots (7 numbers per die: x y z
 * qx qy qz qw), in metres per second. A die well off the floor (mid-bounce)
 * isn't rolling, so it's 0 — its landing is an impact instead.
 */
export function rollingSpeeds(previous: ArrayLike<number>, next: ArrayLike<number>, dt: number, radius: number, metresPerUnit: number): number[] {
  const count = Math.floor(next.length / 7);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * 7;
    const onFloor = next[o + 2] < radius * 1.6;
    const d = Math.hypot(next[o] - previous[o], next[o + 1] - previous[o + 1]);
    out.push(onFloor && dt > 0 ? (d / dt) * metresPerUnit : 0);
  }
  return out;
}
