/** The map is an orthographic ground plane: its stored coordinates never change. */
export const BATTLEFIELD_TILT_DEGREES = 45;
export const groundYScale = (tiltDegrees: number) => Math.cos(tiltDegrees * Math.PI / 180);

export type BattlefieldView = { x: number; y: number; scale: number };

export function mapToScreen(x: number, y: number, view: BattlefieldView, tiltDegrees: number) {
  return { x: view.x + x * view.scale, y: view.y + y * view.scale * groundYScale(tiltDegrees) };
}

export function screenToMap(x: number, y: number, view: BattlefieldView, tiltDegrees: number) {
  return { x: (x - view.x) / view.scale, y: (y - view.y) / (view.scale * groundYScale(tiltDegrees)) };
}

/** Source glTF Y is height; map Y runs along world Z. */
export function miniatureCameraTarget(width: number, height: number, view: BattlefieldView, tiltDegrees: number) {
  const center = screenToMap(width / 2, height / 2, view, tiltDegrees);
  return { x: center.x, z: center.y };
}
