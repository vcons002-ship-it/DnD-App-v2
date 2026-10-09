import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AssetQueue } from './assets/queue.js';
import { broadcastSnapshots, broadcastTokenDrag, dropConn, setConn, type IOServer } from './connections.js';
import { editMapWalls, setWallDoor } from './mapWalls.js';
import {
  addAnnotation,
  claimCharacter,
  createCharacter,
  createMap,
  createSession,
  createToken,
  getMap,
  getToken,
  setActiveMap,
  setTokenHidden,
  listAnnotations,
  pruneAnnotations,
} from './sessions.js';
import type { MapWall } from '../../shared/mapWalls.js';

describe('map door states (one query per map)', () => {
  it('reports each door on a wall as open or closed independently', () => {
    const session = createSession('Two doors');
    const map = createMap(session.id, { name: 'Hall' });
    const west: MapWall = { id: 'west', ax: 300, ay: -1000, bx: 300, by: 2000 };
    const east: MapWall = { id: 'east', ax: 700, ay: -1000, bx: 700, by: 2000 };
    editMapWalls(session.id, map.id, { add: west });
    editMapWalls(session.id, map.id, { add: east });
    expect(editMapWalls(session.id, map.id, { door: { wallId: 'west', id: 'north', ax: 300, ay: 0, bx: 300, by: 200 } })).toBeNull();
    expect(editMapWalls(session.id, map.id, { door: { wallId: 'east', id: 'south', ax: 700, ay: 800, bx: 700, by: 1000 } })).toBeNull();
    expect(setWallDoor(session.id, map.id, 'south', true)).toBeNull();
    const doors = getMap(map.id)!.walls!.filter((w) => w.door);
    expect(Object.fromEntries(doors.map((d) => [d.id, d.open]))).toEqual({ north: false, south: true });
  });
});

describe('player annotation cap', () => {
  it('keeps one author’s newest annotations and leaves everyone else’s alone', () => {
    const session = createSession('Doodles');
    const map = createMap(session.id, { name: 'Sketchpad' });
    const add = (createdBy: string, text: string) =>
      addAnnotation(session.id, { mapId: map.id, kind: 'text', text, color: '#fff', createdBy });
    for (let i = 0; i < 5; i++) add('Alice', `a${i}`);
    add('Bob', 'b0');
    add('DM', 'scenery');
    pruneAnnotations(map.id, 'Alice', 3);
    const texts = listAnnotations(map.id).map((a) => a.text);
    expect(texts).toEqual(['a2', 'a3', 'a4', 'b0', 'scenery']);
  });
});

describe('asset catalog push', () => {
  let directory: string | undefined;
  afterEach(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

  it('notifies once when a produced model is published', async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-catalog-push-'));
    const producer = vi.fn(async (job: { family: string }) => ({
      id: job.family, url: `/uploads/miniatures/${job.family}.glb`, baseDiameter: 1,
      baseCenter: [0, 0, 0] as [number, number, number], bytes: 2000, triangles: 2000, sha256: 'x',
    }));
    const queue = new AssetQueue(path.join(directory, 'queue.json'), producer);
    const changed = vi.fn();
    queue.onCatalogChange = changed;
    queue.enqueue({ id: 'c1', name: 'Owlbear Prime', modelType: '' }, { newModel: true });
    queue.start();
    await vi.waitFor(() => expect(queue.snapshot().models).toHaveLength(1));
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe('drag previews reuse the last snapshot each viewer was sent', () => {
  afterEach(() => ['drag-owner', 'drag-watch'].forEach(dropConn));

  it('follows state changes once they are broadcast', () => {
    const session = createSession('Cached drag');
    const map = createMap(session.id, { name: 'Yard' });
    setActiveMap(session.id, map.id);
    const hero = createCharacter(session.id, { name: 'Runner' });
    claimCharacter(hero.id, 'drag-owner');
    const token = createToken({ mapId: map.id, kind: 'pc', refId: hero.id, x: 100, y: 100 });
    setConn('drag-owner', { sessionId: session.id, role: 'player', viewMapId: null, playerId: 'owner-browser' });
    setConn('drag-watch', { sessionId: session.id, role: 'player', viewMapId: null, playerId: 'watch-browser' });
    const sent: { to: string; event: string }[] = [];
    const io = { to: (to: string) => ({ emit: (event: string) => { sent.push({ to, event }); } }) } as unknown as IOServer;
    const watcherSawDrag = () => {
      const seen = sent.some((e) => e.to === 'drag-watch' && e.event === 'fx:tokenDrag');
      sent.length = 0;
      return seen;
    };

    broadcastSnapshots(io, session.id); // caches each viewer's snapshot
    broadcastTokenDrag(io, session.id, 'drag-owner', getToken(token.id)!, 150, 100);
    expect(watcherSawDrag()).toBe(true);

    setTokenHidden(token.id, true);
    broadcastSnapshots(io, session.id); // the watcher's view no longer has the token
    broadcastTokenDrag(io, session.id, 'drag-owner', getToken(token.id)!, 160, 100);
    expect(watcherSawDrag()).toBe(false);
  });
});
