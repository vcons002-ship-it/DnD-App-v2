import { describe, it, expect } from 'vitest';
import { createLiveWorld } from '../../shared/liveDicePhysics.js';
import { simulateToss } from '../../client/src/lib/dicePhysics.js';
import { MIN_IMPACT_SPEED, recordDiceImpacts, type DiceImpact } from '../../shared/diceImpacts.js';

/** The dice sounds are driven by impacts the physics world really produced. */
const run = (sides: number[], seed: number) => {
  const world = createLiveWorld(sides.map((s, index) => ({ sides: s, value: 1, index, set: 0 })), seed, 'bottom');
  const all: DiceImpact[] = [];
  const frames: { elapsed: number; impacts: DiceImpact[] }[] = [];
  for (let i = 0; i < 1200 && !world.snapshot().done; i++) {
    world.advance(1 / 120);
    const impacts = world.drainImpacts();
    frames.push({ elapsed: world.snapshot().elapsed, impacts });
    all.push(...impacts);
  }
  return { all, frames, done: world.snapshot().done };
};

describe('recorded dice impacts', () => {
  it('a single d20 lands on the floor and the record is ordered and in range', () => {
    const { all, done } = run([20], 1234);
    expect(done).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((i) => i.with === 'floor')).toBe(true);
    expect(all.every((i) => i.die === 0 && i.with !== 'die')).toBe(true); // nothing to hit but the tray
    expect(all.every((i) => i.speed >= MIN_IMPACT_SPEED && i.x >= -1 && i.x <= 1)).toBe(true);
    for (let k = 1; k < all.length; k++) expect(all[k].t).toBeGreaterThanOrEqual(all[k - 1].t);
  });

  it('a handful of dice knock into each other', () => {
    const hits = [7, 99, 2024, 31337].flatMap((seed) => run([6, 6, 6, 6, 6, 6, 6, 6], seed).all.filter((i) => i.with === 'die'));
    expect(hits.length).toBeGreaterThan(0);
  });

  it('a die–die strike is recorded once, by the lower die; walls and floor are told apart', () => {
    type L = (e: { body: unknown; contact: { getImpactVelocityAlongNormal(): number } }) => void;
    const body = (x: number) => { const ls: L[] = []; return { position: { x }, ls, addEventListener: (_: 'collide', l: L) => { ls.push(l); } }; };
    const a = body(-3.6), b = body(3.6), wall = {}, floor = {};
    const sink: DiceImpact[] = [];
    recordDiceImpacts([a, b], new Set([wall]), 0.01, () => 0.5, sink);
    const contact = (v: number) => ({ getImpactVelocityAlongNormal: () => v });
    // cannon-es dispatches a pair's first contact to BOTH bodies.
    a.ls.forEach((l) => l({ body: b, contact: contact(-40) }));
    b.ls.forEach((l) => l({ body: a, contact: contact(-40) }));
    b.ls.forEach((l) => l({ body: wall, contact: contact(30) }));
    a.ls.forEach((l) => l({ body: floor, contact: contact(20) }));
    a.ls.forEach((l) => l({ body: floor, contact: contact(1) })); // 0.01 m/s: a resting jitter
    expect(sink).toEqual([
      { t: 0.5, die: 0, with: 'die', speed: 0.4, x: -0.5 },
      { t: 0.5, die: 1, with: 'wall', speed: 0.3, x: 0.5 },
      { t: 0.5, die: 0, with: 'floor', speed: 0.2, x: -0.5 },
    ]);
  });

  it('each frame carries only the strikes since the previous one', () => {
    const { frames } = run([20, 8], 42);
    let last = 0;
    for (const f of frames) {
      for (const i of f.impacts) {
        // Times are rounded to 0.1 ms for the wire.
        expect(i.t).toBeGreaterThan(last - 1e-4);
        expect(i.t).toBeLessThanOrEqual(f.elapsed + 1e-4);
      }
      last = f.elapsed;
    }
  });

  it('harder throws are louder: the first landing outweighs the final settling taps', () => {
    const { all } = run([20], 1234);
    const floor = all.filter((i) => i.with === 'floor');
    expect(floor[0].speed).toBeGreaterThan(floor.at(-1)!.speed);
  });

  it('the precomputed tray toss records its strikes too, within the toss', () => {
    const toss = simulateToss([{ sides: 20, value: 7, index: 0, set: 0 }, { sides: 6, value: 3, index: 1, set: 0 }], 77, 'bottom');
    expect(toss.impacts!.length).toBeGreaterThan(0);
    expect(toss.impacts!.every((i) => i.t >= 0 && i.t <= toss.duration + 1e-3 && i.die >= 0 && i.die < 2)).toBe(true);
  });
});
