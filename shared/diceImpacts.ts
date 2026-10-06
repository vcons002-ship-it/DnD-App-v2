// Real dice impacts, recorded from the rigid-body simulation itself, so the
// client's clatter matches what actually happened: which die hit, what it hit,
// how hard, and where. Shared by the precomputed tray (client worker) and the
// live server world. Framework-free; cannon-es is only touched through the
// minimal shapes below.

export type DiceImpactSurface = 'die' | 'wall' | 'floor';
export type DiceImpact = {
  /** Simulation seconds at the collision. */
  t: number;
  /** Index of the die that struck (a die–die contact is recorded ONCE). */
  die: number;
  with: DiceImpactSurface;
  /** Impact speed along the contact normal, metres per second. */
  speed: number;
  /** Where it happened across the tray, −1 (left) … 1 (right) — stereo pan. */
  x: number;
};

/** Below this an impact is a resting jitter, not a sound (m/s). */
export const MIN_IMPACT_SPEED = 0.025;
/** Physical size behind the simulation units (a 16 mm d6; see the worlds). */
export const metresPerUnitFor = (radius: number) => (0.016 * Math.sqrt(3) / 2) / radius;
/** Half-width of the tray bed in simulation units (both worlds use ±7.2). */
const TRAY_HALF_WIDTH = 7.2;

type ContactLike = { getImpactVelocityAlongNormal(): number };
type BodyLike = {
  position: { x: number };
  addEventListener(type: 'collide', listener: (event: { body: unknown; contact: ContactLike }) => void): void;
};

/**
 * Attach recorders to each die body. cannon-es fires `collide` only when a pair
 * FIRST touches (bounces, new knocks), never per step of a resting contact, so
 * every entry is a genuine strike. `clock` returns the current simulation time.
 */
export function recordDiceImpacts(
  dice: BodyLike[],
  walls: Set<unknown>,
  metresPerUnit: number,
  clock: () => number,
  sink: DiceImpact[],
  trayHalfWidth=TRAY_HALF_WIDTH,
): void {
  const index = new Map<unknown, number>(dice.map((b, i) => [b, i]));
  dice.forEach((body, i) => {
    body.addEventListener('collide', (event) => {
      const other = index.get(event.body);
      // Two dice each receive the event — keep the lower index's copy only.
      if (other !== undefined && other < i) return;
      const speed = Math.abs(event.contact.getImpactVelocityAlongNormal()) * metresPerUnit;
      if (!Number.isFinite(speed) || speed < MIN_IMPACT_SPEED) return;
      sink.push({
        t: Math.round(clock() * 10000) / 10000,
        die: i,
        with: other !== undefined ? 'die' : walls.has(event.body) ? 'wall' : 'floor',
        speed: Math.round(speed * 1000) / 1000,
        x: Math.round(Math.max(-1, Math.min(1, body.position.x / trayHalfWidth)) * 100) / 100,
      });
    });
  });
}
