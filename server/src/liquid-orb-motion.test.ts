import { describe, expect, it } from 'vitest';
import { liquidImpact, stepLiquidFill } from '../../shared/liquidOrbMotion.js';

describe('cosmetic life-fluid motion', () => {
  it('scales impact against maximum HP with no minimum wobble', () => {
    expect(liquidImpact(80, 79, 100).strength).toBeCloseTo(-.024);
    expect(liquidImpact(3, 2, 100).strength).toBeCloseTo(-.024);
    expect(liquidImpact(79, 80, 100).strength).toBeCloseTo(.024);
    expect(liquidImpact(80, 80, 100).strength).toBe(0);
  });
  it('retains the old liquid height for a bounded transient wet trail', () => {
    expect(liquidImpact(75, 50, 100)).toEqual({ strength: -.6, priorFill: .75 });
    expect(liquidImpact(200, 0, 100)).toEqual({ strength: -1, priorFill: 1 });
    expect(liquidImpact(0, 100, 100)).toEqual({ strength: 1, priorFill: 0 });
  });
  it('handles missing or invalid capacity without introducing NaN', () => {
    expect(liquidImpact(0, 0, 0)).toEqual({ strength: 0, priorFill: 0 });
    expect(liquidImpact(10, 5, 0)).toEqual({ strength: -1, priorFill: 1 });
    expect(liquidImpact(NaN, 5, 10)).toEqual({ strength: 0, priorFill: 0 });
  });
  it('drains faster than refilling without an elastic overshoot', () => {
    expect(.5 - stepLiquidFill(.5, .2, .03)).toBeGreaterThan(stepLiquidFill(.5, .8, .03) - .5);
    for (const [from, to] of [[.9, .1], [.1, .9], [1, 0], [0, 1]]) {
      let shown = from;
      for (let i = 0; i < 150; i++) {
        const next = stepLiquidFill(shown, to, 1 / 30);
        expect(next).toBeGreaterThanOrEqual(Math.min(shown, to));
        expect(next).toBeLessThanOrEqual(Math.max(shown, to));
        shown = next;
      }
      expect(shown).toBe(to);
    }
  });
  it('is timestep independent for ordinary frames and direct for reduced motion', () => {
    let shown = .8;
    for (let i = 0; i < 3; i++) shown = stepLiquidFill(shown, .2, .03);
    expect(shown).toBeCloseTo(stepLiquidFill(.8, .2, .09), 10);
    expect(stepLiquidFill(.8, .2, .03, true)).toBe(.2);
    expect(stepLiquidFill(.2, 1.5, .03, true)).toBe(1);
    expect(stepLiquidFill(.2, NaN, .03, true)).toBe(0);
    expect(stepLiquidFill(.5, .2, -1)).toBe(.5);
  });
});
