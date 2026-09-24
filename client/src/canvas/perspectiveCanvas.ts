import type Konva from 'konva';
import { SceneCanvas, type Canvas } from 'konva/lib/Canvas';
import { groundCanvasPadding, groundPerspectiveCss } from './miniatureProjection';

/** Overscan the raster and hit buffer without changing map or pointer coordinates. */
export function installPerspectiveCanvas(layer: Konva.Layer, width: number, height: number, tilt: number) {
  if (!tilt) return () => {};
  const pad = groundCanvasPadding(width, height, tilt);
  const w = width + 2 * pad.x, h = height + 2 * pad.y;
  const scene = layer.getCanvas(), hit = layer.getHitCanvas();
  const buffer = new SceneCanvas({ width: w, height: h, pixelRatio: scene.getPixelRatio() }) as SceneCanvas & {x:number; y:number};
  buffer.x = -pad.x; buffer.y = -pad.y;
  const prepare = (canvas: Canvas) => {
    canvas.setSize(w, h);
    const context = canvas.getContext(), clear = context.clear;
    context.translate(pad.x, pad.y);
    context.clear = function(bounds) {
      if (bounds) return clear.call(this, bounds);
      this.save(); this.reset(); clear.call(this); this.restore();
    };
    return () => { context.clear = clear; };
  };
  const restore = [prepare(scene), prepare(hit), prepare(buffer)];
  const element = layer.getNativeCanvasElement();
  element.style.left = `${-pad.x}px`; element.style.top = `${-pad.y}px`;
  element.style.transformOrigin = `${pad.x + width/2}px ${pad.y + height/2}px`;
  element.style.transform = groundPerspectiveCss(width, height, tilt);
  const drawScene = layer.drawScene, intersection = layer.getIntersection;
  layer.drawScene = function(canvas, top, suppliedBuffer) {
    return drawScene.call(this, canvas, top, suppliedBuffer ?? buffer);
  };
  layer.getIntersection = function(point) {
    return intersection.call(this, {x:point.x + pad.x, y:point.y + pad.y});
  };
  layer.batchDraw();
  return () => {
    layer.drawScene = drawScene; layer.getIntersection = intersection;
    restore.forEach(fn => fn());
    scene.setSize(width, height); hit.setSize(width, height); buffer.setSize(0,0);
    element.style.left = '0px'; element.style.top = '0px';
    element.style.transformOrigin = '50% 50%'; element.style.transform = 'none';
  };
}
