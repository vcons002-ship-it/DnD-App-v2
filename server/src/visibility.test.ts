import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './visibility.js';
import {
  createMonsters,
  copyMonster,
  createSession,
  createMap,
  createToken,
  listMonsters,
  setActiveMap,
  setFogMode,
  setTokenHidden,
  coverFog,
  paintFog,
} from './sessions.js';
import type { Monster } from '../../shared/types.js';

describe('visibility role-shaping', () => {
  it('hides monster stats and hidden tokens from players', () => {
    const session = createSession('Test');
    const map = createMap(session.id, { name: 'Arena' });
    setActiveMap(session.id, map.id);

    const goblin = createMonsters(session.id, {
      name: 'Goblin',
      maxHp: 7,
      creatureType: 'humanoid',
    })[0];
    createToken({ mapId: map.id, kind: 'monster', refId: goblin.id, x: 1, y: 1 });
    createToken({
      mapId: map.id,
      kind: 'monster',
      refId: goblin.id,
      x: 2,
      y: 2,
      isHidden: true,
    });

    const dm = buildSnapshot(session.id, 'dm', map.id)!;
    const player = buildSnapshot(session.id, 'player')!;

    // DM sees both tokens and full monster stats.
    expect(dm.tokens).toHaveLength(2);
    expect((dm.monsters[0] as Monster).maxHp).toBe(7);

    // Player sees only the visible token and no monster HP.
    expect(player.tokens).toHaveLength(1);
    expect(player.tokens[0].isHidden).toBe(false);
    expect('maxHp' in player.monsters[0]).toBe(false);
    expect(player.monsters[0].name).toBe('Goblin');
  });

  it('locks players to the active map regardless of requested map', () => {
    const session = createSession('Test2');
    const active = createMap(session.id, { name: 'Town' });
    const staging = createMap(session.id, { name: 'Dungeon' });
    setActiveMap(session.id, active.id);

    createToken({
      mapId: staging.id,
      kind: 'monster',
      refId: 'x',
      x: 0,
      y: 0,
    });

    // Even though the DM is prepping the staging map, the player snapshot
    // reflects the active map and never the staging tokens.
    const player = buildSnapshot(session.id, 'player')!;
    expect(player.map?.id).toBe(active.id);
    expect(player.tokens).toHaveLength(0);

    const dmStaging = buildSnapshot(session.id, 'dm', staging.id)!;
    expect(dmStaging.map?.id).toBe(staging.id);
    expect(dmStaging.tokens).toHaveLength(1);
  });

  it('hides fog-covered tokens from players but not the DM', () => {
    const session = createSession('FogTest');
    const map = createMap(session.id, { name: 'Cavern', imagePath: '/u/x.png' });
    setActiveMap(session.id, map.id);
    const orc = createMonsters(session.id, { name: 'Orc', maxHp: 15 })[0];
    // grid default 50 -> (10,10) is cell "0,0"
    createToken({ mapId: map.id, kind: 'monster', refId: orc.id, x: 10, y: 10 });

    // Fog off: player sees the token.
    expect(buildSnapshot(session.id, 'player')!.tokens).toHaveLength(1);

    // Fog on + fully covered: player blind, DM still sees it.
    setFogMode(map.id, 'map');
    coverFog(map.id);
    expect(buildSnapshot(session.id, 'player')!.tokens).toHaveLength(0);
    expect(buildSnapshot(session.id, 'dm', map.id)!.tokens).toHaveLength(1);

    // Reveal the token's cell: player sees it again.
    paintFog(map.id, ['0,0'], true);
    expect(buildSnapshot(session.id, 'player')!.tokens).toHaveLength(1);
  });

  it("'tokens' fog mode hides covered tokens but keeps the map visible", () => {
    const session = createSession('TokenFog');
    const map = createMap(session.id, { name: 'Field', imagePath: '/u/x.png' });
    setActiveMap(session.id, map.id);
    const orc = createMonsters(session.id, { name: 'Orc', maxHp: 15 })[0];
    createToken({ mapId: map.id, kind: 'monster', refId: orc.id, x: 10, y: 10 });

    setFogMode(map.id, 'tokens');
    coverFog(map.id);
    const player = buildSnapshot(session.id, 'player')!;
    // Token hidden, but the player still receives the map itself.
    expect(player.tokens).toHaveLength(0);
    expect(player.map?.id).toBe(map.id);
    expect(player.map?.fogMode).toBe('tokens');
  });

  it('per-token hide keeps a token from players regardless of fog', () => {
    const session = createSession('HideOne');
    const map = createMap(session.id, { name: 'Room', imagePath: '/u/x.png' });
    setActiveMap(session.id, map.id);
    const orc = createMonsters(session.id, { name: 'Orc', maxHp: 9 })[0];
    const tok = createToken({
      mapId: map.id,
      kind: 'monster',
      refId: orc.id,
      x: 10,
      y: 10,
    });
    expect(buildSnapshot(session.id, 'player')!.tokens).toHaveLength(1);
    setTokenHidden(tok.id, true);
    expect(buildSnapshot(session.id, 'player')!.tokens).toHaveLength(0);
    expect(buildSnapshot(session.id, 'dm', map.id)!.tokens).toHaveLength(1);
  });
});

describe('creature creation', () => {
  it('numbers multi-spawn sequentially and de-duplicates names', () => {
    const s = createSession('Spawn');
    // Single create with no clash -> bare name.
    expect(createMonsters(s.id, { name: 'Goblin', maxHp: 7 })[0].name).toBe(
      'Goblin',
    );
    // Adding more continues the numbering (dedupe past the bare "Goblin"=1).
    const more = createMonsters(s.id, { name: 'Goblin', maxHp: 7, count: 2 });
    expect(more.map((m) => m.name)).toEqual(['Goblin 2', 'Goblin 3']);
    // Each is an independent record.
    expect(new Set(more.map((m) => m.id)).size).toBe(2);

    // Fresh base numbers from 1 when count > 1.
    const orcs = createMonsters(s.id, { name: 'Orc', maxHp: 15, count: 3 });
    expect(orcs.map((m) => m.name)).toEqual(['Orc 1', 'Orc 2', 'Orc 3']);
  });

  it('auto-assigns an icon and copies a creature independently', () => {
    const s = createSession('Copy');
    const [gob] = createMonsters(s.id, { name: 'Goblin', maxHp: 7, count: 2 });
    expect(gob.icon).toBeTruthy(); // emoji auto-assigned
    const copy = copyMonster(gob.id)!;
    expect(copy.name).toBe('Goblin 3'); // base "Goblin", next number
    expect(copy.id).not.toBe(gob.id);
    expect(listMonsters(s.id)).toHaveLength(3);
  });
});
