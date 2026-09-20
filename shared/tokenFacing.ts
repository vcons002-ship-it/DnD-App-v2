/** Radians around glTF Y: source models face +Z (south/map +Y). */
export function facingAfterMove(fromX: number, fromY: number, x: number, y: number, previous = 0): number {
  const dx = x - fromX;
  const dy = y - fromY;
  return dx === 0 && dy === 0 ? previous : Math.atan2(dx, dy);
}
