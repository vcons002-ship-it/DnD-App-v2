import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { projectGround, unprojectGround, perspectiveDistance, groundCanvasPadding } from '../../client/src/canvas/miniatureProjection.js';

describe('tabletop perspective', () => {
  it('matches a real 3D camera on the ground plane, including off-center positions', () => {
    for (const [width, height] of [[1920, 1032], [430, 884]]) {
      const d = perspectiveDistance(width, height), tilt = Math.PI / 4;
      const camera = new PerspectiveCamera(2 * Math.atan(height / (2 * d)) * 180 / Math.PI, width / height, 0.1, d * 4);
      camera.position.set(0, d * Math.cos(tilt), d * Math.sin(tilt));
      camera.up.set(0, Math.sin(tilt), -Math.cos(tilt)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      for (const [x, z] of [[-150, -200], [100, 0], [160, 220]]) {
        const p = new Vector3(x, 0, z).project(camera);
        const canvas = projectGround(width / 2 + x, height / 2 + z * Math.cos(tilt), width, height, 45);
        expect(canvas.x).toBeCloseTo((p.x + 1) * width / 2, 7);
        expect(canvas.y).toBeCloseTo((1 - p.y) * height / 2, 7);
        const inverse = unprojectGround(canvas.x, canvas.y, width, height, 45);
        expect(inverse.x).toBeCloseTo(width / 2 + x, 7);
        expect(inverse.y).toBeCloseTo(height / 2 + z * Math.cos(tilt), 7);
      }
    }
  });
  it('has a smaller far edge and leaves overhead coordinates untouched', () => {
    const span = (y: number, tilt: number) => projectGround(900, y, 1200, 800, tilt).x - projectGround(300, y, 1200, 800, tilt).x;
    expect(span(600, 45)).toBeGreaterThan(span(200, 45) * 1.4);
    expect(projectGround(111, 732, 1200, 800, 0)).toEqual({ x: 111, y: 732 });
  });
});

it('covers inverse-projected viewport edges with bounded canvas overscan', () => {
  for (const [width,height] of [[1600,1000],[390,844],[2560,1440]]) {
    expect(groundCanvasPadding(width,height,0)).toEqual({x:0,y:0});
    const pad=groundCanvasPadding(width,height,45);
    for(const x of [0,width/2,width]) for(const y of [0,height/2,height]) {
      const p=unprojectGround(x,y,width,height,45);
      expect(p.x+pad.x).toBeGreaterThanOrEqual(0);
      expect(p.y+pad.y).toBeGreaterThanOrEqual(0);
      expect(p.x+pad.x).toBeLessThan(width+2*pad.x);
      expect(p.y+pad.y).toBeLessThan(height+2*pad.y);
    }
    expect(pad.x).toBeLessThan(width/2); expect(pad.y).toBeLessThan(height/2);
  }
});
