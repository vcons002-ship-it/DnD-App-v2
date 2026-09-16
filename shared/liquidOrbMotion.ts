/** Cosmetic interpolation only. Never feeds character HP or rules back to the
 * server; numeric readouts always use the authoritative saved values. */
export function liquidImpact(before: number, after: number, maximum: number) {
  if (![before, after, maximum].every(Number.isFinite)) return { strength: 0, priorFill: 0 };
  const scale = maximum > 0 ? maximum : Math.max(1, before, after);
  const strength = Math.sign(after - before) * Math.min(1, Math.abs(after - before) / scale * 2.4);
  return { strength, priorFill: Math.max(0, Math.min(1, before / scale)) };
}

export function stepLiquidFill(shown: number, target: number, seconds: number, reducedMotion = false) {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(target) ? target : 0));
  if (reducedMotion || !Number.isFinite(shown)) return bounded;
  const start = Math.max(0, Math.min(1, shown));
  const elapsed = Math.max(0, Math.min(.1, Number.isFinite(seconds) ? seconds : 0));
  // Drain promptly, refill deliberately. Neither direction overshoots the HP
  // level; small residual surface ripples are a separate shader effect.
  const rate = bounded < start ? 9 : 3.8;
  const next = start + (bounded - start) * (1 - Math.exp(-elapsed * rate));
  return Math.abs(next - bounded) < .0001 ? bounded : next;
}
