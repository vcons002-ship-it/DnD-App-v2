import { describe, expect, it } from 'vitest';
import { arcPoint, resourceArc, type OrbArc, type OrbGeometry } from '../../shared/orbResourceLayout.js';

describe('orb-hugging resource presentation', () => {
  for (const size of [184, 204, 224]) {
    for (const [name, cx, cy, radius, rim] of [
      ['fighter', .62, .489, .31, .374],
      ['sorcerer', .62, .488, .31, .356],
      ['ranger', .567, .55, .295, .411],
    ] as const) {
      it(`${name} ${size}px aligns symbols below upward rings with safe spacing`, () => {
        const orb: OrbGeometry = { size, cx: cx * size, cy: cy * size, radius: radius * size, rim: rim * size };
        const fitted: OrbArc[] = [];
        let index = 0;
        for (const count of [5, 3, 3, 6]) {
          const arc = resourceArc(orb, index, count);
          if (!arc) continue;
          const baseline = size - 42;
          expect(arc.radius).toBe(orb.rim + 14 + index * 27);
          const label = arcPoint(arc, 0);
          expect(label.y + orb.cy).toBeCloseTo(baseline);
          // The 26px symbol sits above the branch's lower decorative band.
          // Temporary HP overlays the globe and consumes no resource space.
          expect(label.y + orb.cy + 13).toBeLessThanOrEqual(size - 29);
          // It also stays outside the sculpture's right-hand frame.
          expect(Math.hypot(label.x, label.y) - 13).toBeGreaterThan(orb.rim);
          if (fitted.length) {
            const previousLabel = arcPoint(fitted[fitted.length - 1], 0);
            expect(label.y).toBeCloseTo(previousLabel.y);
            expect(label.x - previousLabel.x).toBeGreaterThanOrEqual(26);
          }
          for (let pip = 1; pip <= count; pip++) {
            const a = arcPoint(arc, pip - 1), b = arcPoint(arc, pip);
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(pip === 1 ? 23 : 19);
            expect(b.y).toBeLessThan(a.y);
            expect(a.y - b.y).toBeCloseTo(pip === 1 ? 24 : 20);
            expect(b.y + orb.cy).toBeCloseTo(baseline - 24 - (pip - 1) * 20);
            expect(Math.hypot(b.x, b.y)).toBeCloseTo(arc.radius);
            expect(b.y + orb.cy >= 15.99 || b.x + orb.cx >= size + 17.99).toBe(true);
            expect(b.y + orb.cy).toBeLessThanOrEqual(baseline);
            expect(b.x + orb.cx).toBeLessThanOrEqual(size + 137);
            expect(Math.hypot(b.x, b.y) - 8.5).toBeGreaterThan(orb.rim);
          }
          fitted.push(arc);
          index++;
        }
        expect(index).toBe(4);
        // All jewels remain separated even when neighbouring rings have
        // different pool sizes; their radius alone guarantees this clearance.
        for (let outer = 1; outer < fitted.length; outer++) {
          const inner = fitted[outer - 1];
          for (let pip = 0; pip <= Math.min(inner.count, fitted[outer].count); pip++) {
            expect(arcPoint(inner, pip).y).toBeCloseTo(arcPoint(fitted[outer], pip).y);
          }
          for (let a = 0; a <= inner.count; a++) {
            for (let b = 0; b <= fitted[outer].count; b++) {
              const p = arcPoint(inner, a), q = arcPoint(fitted[outer], b);
              const clearance = (a === 0 ? 13 : 8.5) + (b === 0 ? 13 : 8.5);
              expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(clearance);
            }
          }
        }
      });
      it(`${name} ${size}px fits nine spell levels and an outer class ring without moving the original four rings`, () => {
        const orb: OrbGeometry = { size, cx: cx * size, cy: cy * size, radius: radius * size, rim: rim * size };
        const maxima = [4, 3, 3, 3, 3, 2, 2, 1, 1, 6];
        const arcs = maxima.map((count, index) => resourceArc(orb, index, count));
        expect(arcs.every(Boolean)).toBe(true);
        for (let index = 0; index < arcs.length; index++) {
          const arc = arcs[index]!;
          const originalRadius = orb.rim + 14 + index * 27;
          const baseline = size - 42 - orb.cy;
          expect(arc.radius).toBe(originalRadius);
          if (index > 0) expect(arc.radius - arcs[index - 1]!.radius).toBeCloseTo(27);
          for (let ordinal = 0; ordinal <= maxima[index]; ordinal++) {
            const point = arcPoint(arc, ordinal);
            const y = baseline - (ordinal === 0 ? 0 : 24 + (ordinal - 1) * 20);
            expect(point.y).toBeCloseTo(y);
            expect(Math.hypot(point.x, point.y)).toBeCloseTo(originalRadius);
            // This is the pre-expansion point equation, not an expected result
            // read back from another implementation helper. Expansion only
            // appends outward rails; it cannot stretch/move existing controls.
            if (index < 4) expect(point.x).toBeCloseTo(Math.sqrt(originalRadius ** 2 - y ** 2));
            expect(point.y + orb.cy).toBeGreaterThanOrEqual(16);
          }
          if (index > 0) {
            const previous = arcs[index - 1]!;
            for (let a = 0; a <= previous.count; a++) for (let b = 0; b <= arc.count; b++) {
              const p = arcPoint(previous, a), q = arcPoint(arc, b);
              const clearance = (a === 0 ? 13 : 8.5) + (b === 0 ? 13 : 8.5);
              expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(clearance);
            }
          }
        }
        // An eleventh class pool and oversized spell pools remain available in
        // the additional-resource drawer; geometry creates no new rule limits.
        expect(resourceArc(orb, 10, 6)).toBeNull();
        expect(resourceArc(orb, 8, 25)).toBeNull();
      });
    }
  }
  it('routes expanded pools to a full-size continuation rather than shrinking or losing them', () => {
    const orb = { size: 204, cx: 126, cy: 100, radius: 63, rim: 73 };
    for (const count of [0, 9, 25, 100, -1, 2.5]) expect(resourceArc(orb, 0, count)).toBeNull();
    expect(resourceArc(orb, 10, 1)).toBeNull();
    expect(resourceArc(orb, -1, 1)).toBeNull();
    expect(resourceArc(orb, .5, 1)).toBeNull();
    expect(resourceArc({ size: 184, cx: 114, cy: 90, radius: 57, rim: 65.5 }, 0, 8)).toBeNull();
  });
  it('keeps medallion anchors unchanged when a fitting pool maximum changes', () => {
    const orb = { size: 204, cx: 126, cy: 100, radius: 63, rim: 73 };
    const anchor = arcPoint(resourceArc(orb, 0, 1)!, 0);
    for (const count of [2, 3, 4, 5]) {
      const arc = resourceArc(orb, 0, count);
      expect(arc).not.toBeNull();
      expect(arcPoint(arc!, 0)).toEqual(anchor);
    }
  });
  it('keeps a seven-use pool curved only when the current ring clears the header', () => {
    const orb = { size: 184, cx: 114, cy: 90, radius: 57, rim: 65.5 };
    expect(resourceArc(orb, 0, 7)).toBeNull();
    const outer = resourceArc(orb, 3, 7);
    expect(outer).not.toBeNull();
    const last = arcPoint(outer!, 7);
    expect(last.y + orb.cy).toBe(-2);
    expect(last.x + orb.cx).toBeGreaterThanOrEqual(orb.size + 18);
  });
});
