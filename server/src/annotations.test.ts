import { describe, it, expect } from 'vitest';
import {
  createSession,
  createMap,
  addAnnotation,
  listAnnotations,
  moveAnnotation,
  removeAnnotation,
  resizeAnnotation,
  clearAnnotations,
  setAnnotationPopup,
} from './sessions.js';

describe('map annotations', () => {
  it('stores freehand + text annotations per map and clears by drawer', () => {
    const s = createSession('Anno');
    const map = createMap(s.id, { name: 'Cave' });
    addAnnotation(s.id, { mapId: map.id, kind: 'freehand', points: [0, 0, 5, 5], color: '#fff', createdBy: 'DM' });
    addAnnotation(s.id, { mapId: map.id, kind: 'text', x: 10, y: 12, text: 'Trap', color: '#f00', createdBy: 'Varis' });

    const list = listAnnotations(map.id);
    expect(list).toHaveLength(2);
    expect(list[0].points).toEqual([0, 0, 5, 5]);
    expect(list[1].text).toBe('Trap');

    // A player clears only their own.
    clearAnnotations(map.id, 'Varis');
    expect(listAnnotations(map.id).map((a) => a.createdBy)).toEqual(['DM']);

    removeAnnotation(listAnnotations(map.id)[0].id);
    expect(listAnnotations(map.id)).toHaveLength(0);
  });

  it('clears by kind (only the scenery decals) and moves a decal', () => {
    const s = createSession('AnnoKind');
    const map = createMap(s.id, { name: 'Keep' });
    addAnnotation(s.id, { mapId: map.id, kind: 'freehand', points: [0, 0, 5, 5], color: '#fff', createdBy: 'DM' });
    addAnnotation(s.id, { mapId: map.id, kind: 'image', x: 10, y: 20, url: '/uploads/a.png', width: 100, height: 80, color: '#fff', createdBy: 'DM' });
    addAnnotation(s.id, { mapId: map.id, kind: 'image', x: 50, y: 60, url: '/uploads/b.png', width: 40, height: 40, color: '#fff', createdBy: 'DM' });

    // Drag a decal to a new spot, then corner-resize it.
    const decal = listAnnotations(map.id).find((a) => a.url === '/uploads/a.png')!;
    moveAnnotation(decal.id, 200, 300);
    resizeAnnotation(decal.id, 250, 200);
    const moved = listAnnotations(map.id).find((a) => a.id === decal.id)!;
    expect([moved.x, moved.y, moved.width, moved.height]).toEqual([200, 300, 250, 200]);

    // Clear ONLY decals: the freehand stroke survives.
    clearAnnotations(map.id, undefined, 'image');
    expect(listAnnotations(map.id).map((a) => a.kind)).toEqual(['freehand']);

    // Drawer + kind combine: nothing matches a different drawer.
    addAnnotation(s.id, { mapId: map.id, kind: 'image', x: 0, y: 0, url: '/uploads/c.png', width: 10, height: 10, color: '#fff', createdBy: 'DM' });
    clearAnnotations(map.id, 'Varis', 'image');
    expect(listAnnotations(map.id)).toHaveLength(2);
    clearAnnotations(map.id, 'DM', 'image');
    expect(listAnnotations(map.id).map((a) => a.kind)).toEqual(['freehand']);
  });

  it('attaches a clickable "shop" popup to a decal and clears it', () => {
    const s = createSession('Shop');
    const map = createMap(s.id, { name: 'Town' });
    addAnnotation(s.id, { mapId: map.id, kind: 'image', x: 0, y: 0, url: '/uploads/shop.png', width: 100, height: 100, color: '#fff', createdBy: 'DM' });
    const decal = listAnnotations(map.id)[0];
    expect(decal.popup).toBeUndefined();

    setAnnotationPopup(decal.id, {
      title: "Greta's Goods",
      note: 'Open dawn to dusk.',
      items: [
        { id: 'i1', name: 'Healing Potion', price: '50 gp', qty: 3 },
        { id: 'i2', name: 'Rope (50 ft)', price: '1 gp' },
      ],
    });
    const withShop = listAnnotations(map.id)[0];
    expect(withShop.popup?.title).toBe("Greta's Goods");
    expect(withShop.popup?.items).toHaveLength(2);
    expect(withShop.popup?.items[0]).toMatchObject({ name: 'Healing Potion', price: '50 gp', qty: 3 });

    // Clearing the popup leaves the decal art intact.
    setAnnotationPopup(decal.id, null);
    const cleared = listAnnotations(map.id)[0];
    expect(cleared.popup).toBeUndefined();
    expect(cleared.url).toBe('/uploads/shop.png');
  });
});
