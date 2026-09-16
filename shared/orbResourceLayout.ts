/** Presentation geometry only. Art/frame dimensions are independent of rules,
 * slot totals and saved counters. All values are unscaled CSS pixels. */
export type OrbGeometry = { size: number; cx: number; cy: number; radius: number; rim: number };
export type OrbArc = { radius: number; baselineOffset: number; count: number };
export const RESOURCE_SYMBOL_BASELINE_INSET = 42;
export const MAX_RESOURCE_RINGS = 10;

export function resourceArc(orb: OrbGeometry, index: number, count: number): OrbArc | null {
  if (!Number.isInteger(count) || count < 1 || count > 8 || !Number.isInteger(index) || index < 0 || index >= MAX_RESOURCE_RINGS) return null;
  // The larger 26px medallions share a bottom baseline, with a little space
  // between them. Neither the baseline nor the radius depends on spent uses.
  const baseline = orb.size - RESOURCE_SYMBOL_BASELINE_INSET;
  const offset = baseline - orb.cy;
  // With the utility footer moved away, symbols rest just above the branch
  // art. Temporary HP is a globe overlay and never changes this baseline.
  const radius = orb.rim + 14 + index * 27;
  if (Math.abs(offset) >= radius) return null;
  const arc = { radius, baselineOffset: offset, count };
  // Match each ordinal jewel to the same horizontal rung across rings. This
  // keeps the visual rows parallel while x follows the orb-centred circle.
  // Do not project jewels past the top of a circle or into the nameplate;
  // large pools retain their full-size controls in the resource overflow.
  const finalY = offset - (24 + (count - 1) * 20);
  if (Math.abs(finalY) > radius) return null;
  for (let point = 0; point <= count; point++) {
    const { x, y } = arcPoint(arc, point);
    if (y + orb.cy < 16 && x + orb.cx < orb.size + 18) return null;
    // The extra outer rings extend only the resource wing. Retain the original
    // five-ring envelope and spacing; don't push the orb or symbols upward.
    const rightLimit = orb.size + 137 + Math.max(0, index - 4) * 27;
    if (y + orb.cy > baseline + .001 || x + orb.cx > rightLimit) return null;
  }
  return arc;
}

export function arcPoint(arc: OrbArc, index: number) {
  const distance = index === 0 ? 0 : 24 + (index - 1) * 20;
  const y = arc.baselineOffset - distance;
  return { x: Math.sqrt(Math.max(0, arc.radius * arc.radius - y * y)), y };
}
