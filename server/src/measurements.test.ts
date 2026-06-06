import { describe, it, expect } from 'vitest';
import {
  createSession,
  createMap,
  setActiveMap,
  addMeasurement,
  listMeasurements,
  clearMeasurements,
  removeMeasurement,
  updateMapGrid,
  getMap,
} from './sessions.js';
import { buildSnapshot } from './visibility.js';

describe('measurements', () => {
  it('adds/lists/removes per map and clears by drawer', () => {
    const s = createSession('Measure');
    const map = createMap(s.id, { name: 'Field' });
    setActiveMap(s.id, map.id);

    const a = addMeasurement(s.id, {
      mapId: map.id,
      kind: 'cone',
      origin: { x: 0, y: 0 },
      target: { x: 30, y: 0 },
      createdBy: 'DM',
    });
    addMeasurement(s.id, {
      mapId: map.id,
      kind: 'circle',
      origin: { x: 50, y: 50 },
      target: { x: 70, y: 50 },
      createdBy: 'Aria',
    });
    expect(listMeasurements(map.id)).toHaveLength(2);

    // A player snapshot includes the active map's measurements.
    const snap = buildSnapshot(s.id, 'player')!;
    expect(snap.measurements).toHaveLength(2);
    expect(snap.measurements[0]).toMatchObject({ kind: 'cone', createdBy: 'DM' });

    // Ownership-gated remove: wrong creator is a no-op; matching creator deletes.
    removeMeasurement(a.id, 'Aria');
    expect(listMeasurements(map.id)).toHaveLength(2);
    removeMeasurement(a.id, 'DM');
    expect(listMeasurements(map.id)).toHaveLength(1);

    // Clear only one drawer's.
    addMeasurement(s.id, {
      mapId: map.id,
      kind: 'line',
      origin: { x: 0, y: 0 },
      target: { x: 10, y: 0 },
      createdBy: 'DM',
    });
    clearMeasurements(map.id, 'Aria');
    expect(listMeasurements(map.id).every((m) => m.createdBy !== 'Aria')).toBe(true);

    // Clear all.
    clearMeasurements(map.id);
    expect(listMeasurements(map.id)).toHaveLength(0);
  });

  it('round-trips an emanation anchored to a token', () => {
    const s = createSession('Emanate');
    const map = createMap(s.id, { name: 'Hall' });
    setActiveMap(s.id, map.id);
    const m = addMeasurement(s.id, {
      mapId: map.id,
      kind: 'emanation',
      origin: { x: 100, y: 100 },
      target: { x: 130, y: 100 },
      tokenId: 'tok-1',
      createdBy: 'Aria',
    });
    expect(m.tokenId).toBe('tok-1');
    expect(listMeasurements(map.id)[0]).toMatchObject({ kind: 'emanation', tokenId: 'tok-1' });
  });
});

describe('map grid resize', () => {
  it('persists a new cell size + feet-per-square', () => {
    const s = createSession('Grid');
    const map = createMap(s.id, { name: 'Tac' });
    updateMapGrid(map.id, 64, 10);
    const m = getMap(map.id)!;
    expect(m.gridSizePx).toBe(64);
    expect(m.feetPerSquare).toBe(10);
  });
});
