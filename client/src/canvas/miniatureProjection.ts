/** Ground coordinates stay unchanged; perspective is a per-viewer projection. */
export const BATTLEFIELD_TILT_DEGREES = 45;
export const groundYScale = (tiltDegrees: number) => Math.cos(tiltDegrees * Math.PI / 180);

export type BattlefieldView = { x: number; y: number; scale: number };

export const perspectiveDistance = (width: number, height: number) => Math.max(width * 0.85, height * 1.35, 1);
export const perspectiveSlope = (width: number, height: number, tilt: number) =>
  Math.tan(tilt * Math.PI / 180) / perspectiveDistance(width, height);

/** Project the existing affine ground canvas into the perspective camera's plane. */
export function projectGround(x: number, y: number, width: number, height: number, tilt: number) {
  const denominator = 1 - (y - height / 2) * perspectiveSlope(width, height, tilt);
  return { x: width / 2 + (x - width / 2) / denominator, y: height / 2 + (y - height / 2) / denominator };
}

export function unprojectGround(x: number, y: number, width: number, height: number, tilt: number) {
  const denominator = 1 + (y - height / 2) * perspectiveSlope(width, height, tilt);
  return { x: width / 2 + (x - width / 2) / denominator, y: height / 2 + (y - height / 2) / denominator };
}

export function groundPerspectiveCss(width: number, height: number, tilt: number) {
  return tilt ? `matrix3d(1,0,0,0,0,1,0,${-perspectiveSlope(width, height, tilt)},0,0,1,0,0,0,0,1)` : 'none';
}

/** Affine canvas coordinates, before projectGround is applied. */
export function mapToScreen(x: number, y: number, view: BattlefieldView, tiltDegrees: number) {
  return { x: view.x + x * view.scale, y: view.y + y * view.scale * groundYScale(tiltDegrees) };
}

/** Input is the unprojected canvas position registered by perspectiveInput. */
export function screenToMap(x: number, y: number, view: BattlefieldView, tiltDegrees: number) {
  return { x: (x - view.x) / view.scale, y: (y - view.y) / (view.scale * groundYScale(tiltDegrees)) };
}

/** Source glTF Y is height; map Y runs along world Z. */
export function miniatureCameraTarget(width: number, height: number, view: BattlefieldView, tiltDegrees: number) {
  const center = screenToMap(width / 2, height / 2, view, tiltDegrees);
  return { x: center.x, z: center.y };
}
