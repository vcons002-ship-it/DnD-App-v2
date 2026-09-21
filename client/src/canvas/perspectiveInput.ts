import type Konva from 'konva';
import { unprojectGround } from './miniatureProjection';

/** Adapt Konva's public pointer registration before its hit testing and drag math.
 * Canvas elements are projected; the Stage event surface stays viewport-sized.
 * Native events remain untouched, so screen-space menus retain normal coordinates.
 */
export function installPerspectiveInput(stage: Konva.Stage, width: number, height: number, tilt: number) {
  const original = stage.setPointersPositions;
  stage.setPointersPositions = function (event) {
    const content = stage.getContent();
    const rect = content.getBoundingClientRect();
    const sx = rect.width / content.clientWidth || 1, sy = rect.height / content.clientHeight || 1;
    const point = (p: { clientX: number; clientY: number; identifier?: number }) => {
      const v = unprojectGround((p.clientX - rect.left) / sx, (p.clientY - rect.top) / sy, width, height, tilt);
      return { clientX: rect.left + v.x * sx, clientY: rect.top + v.y * sy, identifier: p.identifier };
    };
    const adjusted = new Proxy(event, { get(target, key) {
      if (key === 'clientX' || key === 'clientY') return point(target)[key];
      if ((key === 'touches' || key === 'changedTouches') && target[key]) return Array.from(target[key] as TouchList, point);
      return Reflect.get(target, key, target);
    } });
    original.call(stage, adjusted);
  };
  return () => { stage.setPointersPositions = original; };
}
