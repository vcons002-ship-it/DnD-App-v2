import type Konva from 'konva';
import { SceneCanvas, type Canvas } from 'konva/lib/Canvas';
import { groundCanvasPadding, groundPerspectiveCss } from './miniatureProjection';

/** Overscan the raster and hit buffer without changing map or pointer coordinates. */
export function installPerspectiveCanvas(layer: Konva.Layer, width: number, height: number, tilt: number, rotation = 0) {
  // Reserve the orbit envelope once. Angle updates only change the CSS matrix;
  // they must not resize/clear three sets of scene and hit canvases every frame.
  // In overhead view (tilt=0, rotation=0), defer allocating the 4.43x oversized
  // scene/hit/buffer canvases until the user first tilts or rotates the camera.
  const pads=Array.from({length:24},(_,i)=>groundCanvasPadding(width,height,45,i*15));
  const pad={x:Math.max(...pads.map(p=>p.x)),y:Math.max(...pads.map(p=>p.y))};
  const w = width + 2 * pad.x, h = height + 2 * pad.y;
  const scene = layer.getCanvas(), hit = layer.getHitCanvas();
  const element = layer.getNativeCanvasElement();
  const drawScene = layer.drawScene, intersection = layer.getIntersection;
  let active = false;
  let buffer: (SceneCanvas & {x:number; y:number}) | undefined;
  let restore: (() => void)[] = [];
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
  const activate = (nextTilt: number, nextRotation: number) => {
    if (active) return;
    active = true;
    layer.setAttr('retainedCanvasOrigin', pad);
    buffer = new SceneCanvas({ width: w, height: h, pixelRatio: scene.getPixelRatio() }) as SceneCanvas & {x:number; y:number};
    buffer.x = -pad.x; buffer.y = -pad.y;
    layer.setAttr('retainedPerspectiveBuffer', buffer);
    restore = [prepare(scene), prepare(hit), prepare(buffer)];
    element.style.left = `${-pad.x}px`; element.style.top = `${-pad.y}px`;
    element.style.transformOrigin = `${pad.x + width/2}px ${pad.y + height/2}px`;
    element.style.transform = groundPerspectiveCss(width, height, nextTilt, nextRotation);
    layer.draw();
  };
  layer.drawScene = function(canvas, top, suppliedBuffer) {
    return drawScene.call(this, canvas, top, suppliedBuffer ?? buffer);
  };
  layer.getIntersection = function(point) {
    return intersection.call(this, active ? {x:point.x + pad.x, y:point.y + pad.y} : point);
  };
  if (Math.abs(tilt) >= 0.001 || Math.abs(rotation % 360) >= 0.001) {
    activate(tilt, rotation);
  }
  const dispose = () => {
    layer.drawScene = drawScene; layer.getIntersection = intersection;
    if (active) {
      restore.forEach(fn => fn());
      scene.setSize(width, height); hit.setSize(width, height); buffer?.setSize(0,0);
      element.style.left = '0px'; element.style.top = '0px';
      element.style.transformOrigin = '50% 50%'; element.style.transform = 'none';
      layer.setAttr('retainedCanvasOrigin', undefined);
      layer.setAttr('retainedPerspectiveBuffer', undefined);
    }
  };
  return Object.assign(dispose, {
    get buffer() { return buffer; },
    update: (nextTilt: number, nextRotation: number) => {
      if (!active) {
        if (Math.abs(nextTilt) < 0.001 && Math.abs(nextRotation % 360) < 0.001) return;
        activate(nextTilt, nextRotation);
        return;
      }
      element.style.transform = groundPerspectiveCss(width, height, nextTilt, nextRotation);
    },
  });
}
