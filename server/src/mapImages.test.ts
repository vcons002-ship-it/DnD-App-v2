import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './visibility.js';
import {
  createSession,
  createMap,
  setActiveMap,
  addMapImage,
  listMapImages,
  moveMapImage,
  resizeMapImage,
  reorderMapImage,
  deleteMapImage,
  deleteMap,
} from './sessions.js';

describe('map image tiles', () => {
  const setup = () => {
    const s = createSession('Tiles');
    const map = createMap(s.id, { name: 'Composite' });
    setActiveMap(s.id, map.id);
    return { s, map };
  };

  it('adds tiles (stacked on top), moves, resizes, reorders, deletes', () => {
    const { s, map } = setup();
    const a = addMapImage(s.id, { mapId: map.id, imagePath: '/uploads/a.png', x: 0, y: 0, w: 100, h: 80 });
    const b = addMapImage(s.id, { mapId: map.id, imagePath: '/uploads/b.png', x: 100, y: 0, w: 100, h: 80 });
    // Newest sits on top (higher z).
    let imgs = listMapImages(map.id);
    expect(imgs.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(imgs[1].z).toBeGreaterThan(imgs[0].z);

    moveMapImage(a.id, 5, 7);
    resizeMapImage(b.id, 110, 0, 200, 160);
    imgs = listMapImages(map.id);
    expect(imgs.find((i) => i.id === a.id)).toMatchObject({ x: 5, y: 7 });
    expect(imgs.find((i) => i.id === b.id)).toMatchObject({ x: 110, w: 200, h: 160 });

    // Send A to front → it now sorts last (top of the stack).
    reorderMapImage(a.id, 'front');
    expect(listMapImages(map.id).map((i) => i.id)).toEqual([b.id, a.id]);
    // …then to back → first again.
    reorderMapImage(a.id, 'back');
    expect(listMapImages(map.id).map((i) => i.id)).toEqual([a.id, b.id]);

    // Dimensions clamp to a positive minimum.
    resizeMapImage(a.id, 0, 0, -5, 0);
    expect(listMapImages(map.id).find((i) => i.id === a.id)!.w).toBe(1);

    deleteMapImage(a.id);
    expect(listMapImages(map.id).map((i) => i.id)).toEqual([b.id]);
  });

  it('ships the active map tiles to BOTH the DM and players, ordered bottom-up', () => {
    const { s, map } = setup();
    addMapImage(s.id, { mapId: map.id, imagePath: '/uploads/base.png', x: 0, y: 0, w: 200, h: 200 });
    addMapImage(s.id, { mapId: map.id, imagePath: '/uploads/top.png', x: 50, y: 50, w: 100, h: 100 });

    const dm = buildSnapshot(s.id, 'dm')!;
    const player = buildSnapshot(s.id, 'player')!;
    expect(dm.mapImages.map((i) => i.imagePath)).toEqual(['/uploads/base.png', '/uploads/top.png']);
    // Players see the same map tiles (they're scenery, not secret).
    expect(player.mapImages.map((i) => i.imagePath)).toEqual(['/uploads/base.png', '/uploads/top.png']);
  });

  it('deleting a map removes its tiles', () => {
    const { s, map } = setup();
    addMapImage(s.id, { mapId: map.id, imagePath: '/uploads/x.png', x: 0, y: 0, w: 10, h: 10 });
    expect(listMapImages(map.id)).toHaveLength(1);
    deleteMap(map.id);
    expect(listMapImages(map.id)).toHaveLength(0);
  });
});
