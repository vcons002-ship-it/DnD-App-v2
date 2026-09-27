/** Presentation only: the server still decides placement and facing. */
export function tokenMoveDuration(distancePx: number, pxPerFoot: number): number {
  return Math.min(460, Math.max(220, 220 + distancePx / Math.max(1, pxPerFoot) * 6));
}

export function tokenMoveProgress(elapsed: number, duration: number): number {
  const t = Math.min(1, Math.max(0, elapsed / duration));
  return t * t * (3 - 2 * t);
}

/** Grid movement counts a diagonal as one square, without reach deductions. */
export function moveDistanceFt(dx: number, dy: number, pxPerFoot: number): number {
  return Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(.0001, pxPerFoot));
}
