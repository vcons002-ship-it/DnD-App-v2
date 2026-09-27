/** Ground coordinates stay unchanged; perspective is a per-viewer projection. */
export const BATTLEFIELD_TILT_DEGREES = 45;
export const groundYScale = (tiltDegrees: number) => Math.cos(tiltDegrees * Math.PI / 180);

export type BattlefieldView = { x: number; y: number; scale: number };

export const perspectiveDistance = (width: number, height: number, tilt = 45) =>
  Math.max(width * 0.85, height * 1.35, 1) / Math.max(.001, Math.sin(tilt*Math.PI/180)/Math.SQRT1_2);
export const perspectiveSlope = (width: number, height: number, tilt: number) =>
  Math.tan(tilt * Math.PI / 180) / perspectiveDistance(width, height, tilt);

/** Project the existing affine ground canvas into the perspective camera's plane. */
export function projectGround(x: number, y: number, width: number, height: number, tilt: number, rotation = 0) {
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sy=groundYScale(tilt);
  const dx=x-width/2,dy=y-height/2;
  const rx=c*dx-s*dy/sy,ry=s*dx*sy+c*dy;
  const denominator=1-ry*perspectiveSlope(width,height,tilt);
  return {x:width/2+rx/denominator,y:height/2+ry/denominator};
}

export function unprojectGround(x: number, y: number, width: number, height: number, tilt: number, rotation = 0) {
  const denominator=1+(y-height/2)*perspectiveSlope(width,height,tilt);
  const dx=(x-width/2)/denominator,dy=(y-height/2)/denominator;
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sy=groundYScale(tilt);
  return {x:width/2+c*dx+s*dy/sy,y:height/2-s*dx*sy+c*dy};
}

export function groundPerspectiveCss(width: number, height: number, tilt: number, rotation = 0) {
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sy=groundYScale(tilt),k=perspectiveSlope(width,height,tilt);
  return `matrix3d(${c},${s*sy},0,${-k*s*sy},${-s/sy},${c},0,${-k*c},0,0,1,0,0,0,0,1)`;
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

/** Source pixels needed before perspective; the far corners lie outside the viewport. */
export function groundCanvasPadding(width: number, height: number, tilt: number, rotation = 0) {
  if (!tilt && !rotation) return { x: 0, y: 0 };
  const corners = [[0,0],[width,0],[0,height],[width,height]].map(([x,y]) => unprojectGround(x,y,width,height,tilt,rotation));
  return {
    x: Math.ceil(Math.max(0, ...corners.map(p => Math.max(-p.x, p.x-width)))) + 8,
    y: Math.ceil(Math.max(0, ...corners.map(p => Math.max(-p.y, p.y-height)))) + 8,
  };
}
