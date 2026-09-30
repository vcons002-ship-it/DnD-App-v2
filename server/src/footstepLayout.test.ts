import {describe, it, expect} from 'vitest';
import {footstepLayout} from '../../client/src/canvas/footstepLayout.js';

describe('physical footstep layout', () => {
  it('keeps the same physical stride at different map resolutions', () => {
    expect(footstepLayout(300, 5, 10)).toEqual(footstepLayout(600, 5, 20));
  });
  it('leaves alternating steps inside the path and ignores stationary jitter', () => {
    expect(footstepLayout(0, 5, 10)).toEqual([]);
    expect(footstepLayout(2, 5, 10)).toEqual([]);
    const steps = footstepLayout(100, 5, 10);
    expect(steps.map(s => s.side)).toEqual([1, -1, 1, -1]);
    for (const step of steps) {
      expect(step.fraction).toBeGreaterThan(0);
      expect(step.fraction).toBeLessThan(1);
    }
  });
  it('bounds long trails without stretching the stride', () => {
    const steps = footstepLayout(10000, 5, 10);
    expect(steps).toHaveLength(48);
    expect((steps[1].fraction - steps[0].fraction) * 10000).toBeCloseTo(22);
    expect(steps[0].fraction).toBeGreaterThan(.8);
  });
});
