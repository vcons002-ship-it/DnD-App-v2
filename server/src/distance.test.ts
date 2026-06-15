import { describe, it, expect } from 'vitest';
import { tokenDistanceFt, tokensWithin5ft } from '../../shared/distance.js';

// A standard map: a 50-px grid cell = 5 ft (0.1 ft/px).
const map = { feetPerSquare: 5, gridSizePx: 50 } as const;
const tok = (x: number, y: number, widthFt = 5) => ({ x, y, widthFt });

describe('tokenDistanceFt / tokensWithin5ft', () => {
  it('orthogonally adjacent tokens are 5 ft apart (within reach)', () => {
    expect(tokenDistanceFt(tok(0, 0), tok(50, 0), map)).toBeCloseTo(5);
    expect(tokensWithin5ft(tok(0, 0), tok(50, 0), map)).toBe(true);
  });

  it('a diagonal counts as one square (5 ft), still within reach', () => {
    expect(tokenDistanceFt(tok(0, 0), tok(50, 50), map)).toBeCloseTo(5);
    expect(tokensWithin5ft(tok(0, 0), tok(50, 50), map)).toBe(true);
  });

  it('one empty square between (10 ft) is NOT within 5 ft', () => {
    expect(tokenDistanceFt(tok(0, 0), tok(100, 0), map)).toBeCloseTo(10);
    expect(tokensWithin5ft(tok(0, 0), tok(100, 0), map)).toBe(false);
  });

  it('a Large creature (10-ft footprint) reaches one square further', () => {
    // Large at origin, target 1.5 cells away → 7.5 ft center, minus 2.5 ft reach = 5.
    expect(tokensWithin5ft(tok(0, 0, 10), tok(75, 0, 5), map)).toBe(true);
  });

  it('overlapping tokens are 0 ft apart', () => {
    expect(tokenDistanceFt(tok(20, 20), tok(20, 20), map)).toBe(0);
  });
});
