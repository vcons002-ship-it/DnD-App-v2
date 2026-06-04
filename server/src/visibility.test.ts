import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './visibility.js';
import {
  createMonsterTemplate,
  instantiateMonster,
  copyMonster,
  deleteMonster,
  duplicateToken,
  applyDamage,
  getMonster,
  listTokens,
  createSession,
  createMap,
  createToken,
  listMonsters,
  listMonsterTemplates,
  setActiveMap,
  setFogMode,
  setTokenHidden,
  coverFog,
  paintFog,
} from './sessions.js';

/** Helper: make a template and place one numbered instance of it. */
const spawnInstance = (
  sessionId: string,
  name: string,
  maxHp: number,
  creatureType = '',
) => {
  const tmpl = createMonsterTemplate(sessionId, { name, maxHp, creatureType });
  return instantiateMonster(tmpl.id)!;
};
import type { Monster } from '../../shared/types.js';

describe('visibility role-shaping', () => {
  it('hides monster stats and hidden tokens from players', () => {
    const session = createSession('Test');
    const map = createMap(session.id, { name: 'Arena' });
    setActiveMap(session.id, map.id);

    const goblin = spawnInstance(session.id, 'Goblin', 7, 'humanoid');
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
    expect(player.monsters[0].name).toContain('Goblin');
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
    const orc = spawnInstance(session.id, 'Orc', 15);
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
    const orc = spawnInstance(session.id, 'Orc', 15);
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
    const orc = spawnInstance(session.id, 'Orc', 9);
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
  it('keeps one template and numbers instances on placement', () => {
    const s = createSession('Spawn');
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7 });
    expect(tmpl.name).toBe('Goblin');
    expect(tmpl.icon).toBeTruthy(); // emoji auto-assigned
    expect(listMonsterTemplates(s.id)).toHaveLength(1);

    const i1 = instantiateMonster(tmpl.id)!;
    const i2 = instantiateMonster(tmpl.id)!;
    const i3 = instantiateMonster(tmpl.id)!;
    expect([i1.name, i2.name, i3.name]).toEqual([
      'Goblin 1',
      'Goblin 2',
      'Goblin 3',
    ]);
    // Independent instance records; the template list still has just one entry.
    expect(new Set([i1.id, i2.id, i3.id]).size).toBe(3);
    expect(listMonsters(s.id)).toHaveLength(3);
    expect(listMonsterTemplates(s.id)).toHaveLength(1);
  });

  it('copies a template to a unique name and deletes templates', () => {
    const s = createSession('Copy');
    const tmpl = createMonsterTemplate(s.id, { name: 'Orc', maxHp: 15 });
    const dup = copyMonster(tmpl.id)!;
    expect(dup.name).toBe('Orc (2)');
    expect(listMonsterTemplates(s.id)).toHaveLength(2);

    deleteMonster(dup.id);
    expect(listMonsterTemplates(s.id)).toHaveLength(1);
  });

  it('duplicates a placed token into a uniquely-tracked copy', () => {
    const s = createSession('Dup');
    const map = createMap(s.id, { name: 'Arena' });
    setActiveMap(s.id, map.id);
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7 });
    const g1 = instantiateMonster(tmpl.id)!; // "Goblin 1"
    const tok = createToken({
      mapId: map.id,
      kind: 'monster',
      refId: g1.id,
      x: 10,
      y: 10,
    });
    // Wound the source so we can prove current state is carried, not reset.
    applyDamage('monster', g1.id, 3);

    const copyTok = duplicateToken(tok.id)!;
    // A second, distinct token + monster instance now exist.
    expect(listTokens(map.id)).toHaveLength(2);
    expect(copyTok.id).not.toBe(tok.id);
    expect(copyTok.refId).not.toBe(g1.id);

    const copyMon = getMonster(copyTok.refId)!;
    expect(copyMon.name).toBe('Goblin 2'); // next sequential name
    expect(copyMon.curHp).toBe(4); // identical current HP (7 - 3)

    // Editing the copy must not affect the original (independent tracking).
    applyDamage('monster', copyMon.id, 4);
    expect(getMonster(g1.id)!.curHp).toBe(4);
    expect(getMonster(copyMon.id)!.curHp).toBe(0);
  });
});
