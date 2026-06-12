import { describe, it, expect } from 'vitest';
import { buildSnapshot, createSnapshotBuilder, coveredByFog } from './visibility.js';
import {
  createMonsterTemplate,
  instantiateMonster,
  copyMonster,
  deleteMonster,
  duplicateToken,
  deleteMap,
  applyDamage,
  getMap,
  getMonster,
  listMaps,
  listTokens,
  createSession,
  createMap,
  createToken,
  getActiveMapId,
  listMonsters,
  listMonsterTemplates,
  updateMonster,
  setMonsterPlayerNotes,
  setTokensHideCombatRole,
  setTokensCombatRole,
  setLastAttackRole,
  createCharacter,
  claimCharacter,
  updateCharacter,
  getCharacter,
  listCharacters,
  damageTokens,
  setTokensCondition,
  clearTokensConditions,
  setActiveMap,
  setFogLayer,
  setTokenHidden,
  coverFog,
  paintFog,
  addRollLog,
  setLoot,
  takeLoot,
  setCondition,
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

  it('shapes monsters for players by disposition tier', () => {
    const session = createSession('Disp');
    const map = createMap(session.id, { name: 'Field' });
    setActiveMap(session.id, map.id);

    const friend = spawnInstance(session.id, 'Knight', 20, 'humanoid');
    const neutral = spawnInstance(session.id, 'Merchant', 9, 'humanoid');
    const enemy = spawnInstance(session.id, 'Orc', 15, 'humanoid');
    for (const m of [friend, neutral, enemy]) {
      createToken({ mapId: map.id, kind: 'monster', refId: m.id, x: 1, y: 1 });
    }
    updateMonster(friend.id, { disposition: 'friendly' });
    updateMonster(neutral.id, { disposition: 'neutral' });
    // enemy stays default 'enemy'

    // Shared party notes reach players on every disposition tier.
    setMonsterPlayerNotes(enemy.id, 'vulnerable to fire');

    const p = buildSnapshot(session.id, 'player')!;
    const byId = (id: string) => p.monsters.find((m) => m.id === id)!;

    // Friendly: full stat block (stats present).
    const f = byId(friend.id) as Monster;
    expect(f.maxHp).toBe(20);
    expect(f.stats).toBeDefined();
    expect(f.actions).toBeDefined();

    // Neutral now shows players nothing more than an enemy (only the dot colour
    // differs): name + conditions, no HP/type/AC/stats.
    const n = byId(neutral.id) as Record<string, unknown>;
    expect('maxHp' in n).toBe(false);
    expect('creatureType' in n).toBe(false);
    expect('armorClass' in n).toBe(false);
    expect('stats' in n).toBe(false);
    expect(n.disposition).toBe('neutral'); // dot colour preserved

    // Enemy: name + conditions only, no HP.
    const e = byId(enemy.id) as Record<string, unknown>;
    expect('maxHp' in e).toBe(false);
    expect('armorClass' in e).toBe(false);
    expect(e.name).toContain('Orc');
    expect(e.playerNotes).toBe('vulnerable to fire'); // notes visible even on enemies

    // The DM still sees every creature in full.
    const dm = buildSnapshot(session.id, 'dm', map.id)!;
    expect((dm.monsters.find((m) => m.id === enemy.id) as Monster).maxHp).toBe(15);
  });

  it('computes combat-role badge for players even on enemies, and hides on request', () => {
    const session = createSession('Role');
    const map = createMap(session.id, { name: 'Arena' });
    setActiveMap(session.id, map.id);

    // Enemy archer: players never get its stats, but should still get the role.
    const tmpl = createMonsterTemplate(session.id, {
      name: 'Archer',
      maxHp: 12,
      weapons: [{ name: 'Longbow', kind: 'ranged' }],
    });
    const archer = instantiateMonster(tmpl.id)!;
    const tok = createToken({
      mapId: map.id,
      kind: 'monster',
      refId: archer.id,
      x: 1,
      y: 1,
    });

    const player = buildSnapshot(session.id, 'player')!;
    expect(player.tokens[0].combatRole).toBe('ranged');
    // Enemy stats are still withheld.
    expect('maxHp' in player.monsters[0]).toBe(false);

    // Override to caster, then hide entirely.
    setTokensCombatRole([tok.id], 'caster');
    expect(buildSnapshot(session.id, 'player')!.tokens[0].combatRole).toBe('caster');
    setTokensHideCombatRole([tok.id], true);
    expect(buildSnapshot(session.id, 'player')!.tokens[0].combatRole).toBeNull();
  });

  it('badge follows the most recent attack, overriding the derived role', () => {
    const session = createSession('LastAttack');
    const map = createMap(session.id, { name: 'Arena' });
    setActiveMap(session.id, map.id);

    // A sword-only brute derives 'melee' from its stat block.
    const tmpl = createMonsterTemplate(session.id, {
      name: 'Brute',
      maxHp: 20,
      weapons: [{ name: 'Greatsword', kind: 'melee' }],
    });
    const brute = instantiateMonster(tmpl.id)!;
    createToken({ mapId: map.id, kind: 'monster', refId: brute.id, x: 1, y: 1 });
    expect(buildSnapshot(session.id, 'player')!.tokens[0].combatRole).toBe('melee');

    // After throwing a ranged attack, the badge follows the weapon last used.
    setLastAttackRole('monster', brute.id, 'ranged');
    expect(buildSnapshot(session.id, 'player')!.tokens[0].combatRole).toBe('ranged');

    // A manual override still wins over the recorded last-attack role.
    const tok = buildSnapshot(session.id, 'dm', map.id)!.tokens[0];
    setTokensCombatRole([tok.id], 'caster');
    expect(buildSnapshot(session.id, 'player')!.tokens[0].combatRole).toBe('caster');
  });

  it('patches editable creature fields and clamps curHp to a lowered max', () => {
    const session = createSession('Edit');
    const tmpl = createMonsterTemplate(session.id, { name: 'Ogre', maxHp: 59 });
    const ogre = instantiateMonster(tmpl.id)!;

    updateMonster(ogre.id, {
      armorClass: 11,
      speed: '40 ft',
      stats: { STR: 19, DEX: 8 },
      resistances: ['fire'],
      weapons: [{ name: 'Greatclub', kind: 'melee', damage: '2d8+4' }],
      actions: [{ name: 'Smash', description: 'Hits hard.' }],
    });
    let m = getMonster(ogre.id)!;
    expect(m.armorClass).toBe(11);
    expect(m.speed).toBe('40 ft');
    expect(m.stats.STR).toBe(19);
    expect(m.resistances).toEqual(['fire']);
    expect(m.weapons[0]).toMatchObject({ name: 'Greatclub', kind: 'melee' });
    // Legacy `actions` patches fold into the merged sheet-ability system.
    expect(m.actions).toEqual([]);
    expect(m.sheetAbilities.some((a) => a.name === 'Smash')).toBe(true);

    // Lowering maxHp below curHp clamps curHp down.
    updateMonster(ogre.id, { maxHp: 10 });
    m = getMonster(ogre.id)!;
    expect(m.maxHp).toBe(10);
    expect(m.curHp).toBe(10);
  });

  it('creates a player character with stats', () => {
    const s = createSession('NewPC');
    const before = listCharacters(s.id).length; // seeded party
    const c = createCharacter(s.id, {
      name: 'Mira',
      race: 'Tiefling',
      className: 'Rogue',
      maxHp: 22,
      stats: { DEX: 16 },
    });
    expect(c.name).toBe('Mira');
    expect(c.maxHp).toBe(22);
    expect(c.curHp).toBe(22);
    expect(c.stats.DEX).toBe(16);
    expect(c.level).toBe(1);
    expect(listCharacters(s.id)).toHaveLength(before + 1);
  });

  it('patches a character with the shared tagged fields + level', () => {
    const s = createSession('EditPC');
    const c = createCharacter(s.id, { name: 'Aria', maxHp: 30 });
    updateCharacter(c.id, {
      level: 5,
      armorClass: 16,
      weapons: [{ name: 'Longbow', kind: 'ranged', damage: '1d8+3' }],
      abilities: [{ name: 'Sneak Attack', description: '+3d6' }],
      resistances: ['poison'],
      proficientSkills: ['Stealth', 'Perception'],
    });
    const after = getCharacter(c.id)!;
    expect(after.level).toBe(5);
    expect(after.armorClass).toBe(16);
    expect(after.weapons[0]).toMatchObject({ name: 'Longbow', kind: 'ranged' });
    expect(after.abilities[0].name).toBe('Sneak Attack');
    expect(after.resistances).toEqual(['poison']);
    expect(after.proficientSkills).toEqual(['Stealth', 'Perception']);
  });

  it('applies bulk AOE damage and conditions across selected tokens', () => {
    const s = createSession('Bulk');
    const map = createMap(s.id, { name: 'Blast' });
    setActiveMap(s.id, map.id);
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 10 });
    const a = instantiateMonster(tmpl.id)!;
    const b = instantiateMonster(tmpl.id)!;
    const ta = createToken({ mapId: map.id, kind: 'monster', refId: a.id, x: 1, y: 1 });
    const tb = createToken({ mapId: map.id, kind: 'monster', refId: b.id, x: 2, y: 2 });

    damageTokens([ta.id, tb.id], 4);
    expect(getMonster(a.id)!.curHp).toBe(6);
    expect(getMonster(b.id)!.curHp).toBe(6);

    setTokensCondition([ta.id, tb.id], {
      label: 'Prone',
      aura: 'red',
      isConcentration: false,
    });
    expect(getMonster(a.id)!.conditions[0].label).toBe('Prone');
    expect(getMonster(b.id)!.conditions[0].label).toBe('Prone');
    // Each creature gets its own condition id.
    expect(getMonster(a.id)!.conditions[0].id).not.toBe(
      getMonster(b.id)!.conditions[0].id,
    );

    clearTokensConditions([ta.id, tb.id]);
    expect(getMonster(a.id)!.conditions).toHaveLength(0);
    expect(getMonster(b.id)!.conditions).toHaveLength(0);
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

    // Map fog on + fully covered: player blind, DM still sees it.
    setFogLayer(map.id, 'map', true);
    coverFog(map.id, 'map');
    expect(buildSnapshot(session.id, 'player')!.tokens).toHaveLength(0);
    expect(buildSnapshot(session.id, 'dm', map.id)!.tokens).toHaveLength(1);

    // Reveal the token's cell: player sees it again.
    paintFog(map.id, 'map', ['0,0'], true);
    expect(buildSnapshot(session.id, 'player')!.tokens).toHaveLength(1);
  });

  it('token fog hides covered tokens but keeps the map visible', () => {
    const session = createSession('TokenFog');
    const map = createMap(session.id, { name: 'Field', imagePath: '/u/x.png' });
    setActiveMap(session.id, map.id);
    const orc = spawnInstance(session.id, 'Orc', 15);
    createToken({ mapId: map.id, kind: 'monster', refId: orc.id, x: 10, y: 10 });

    setFogLayer(map.id, 'tokens', true);
    coverFog(map.id, 'tokens');
    const player = buildSnapshot(session.id, 'player')!;
    // Token hidden, but the player still receives the map itself.
    expect(player.tokens).toHaveLength(0);
    expect(player.map?.id).toBe(map.id);
    expect(player.map?.tokenFogEnabled).toBe(true);
  });

  it('map fog and token fog work independently on one map', () => {
    const session = createSession('TwoLayer');
    const map = createMap(session.id, { name: 'Split', imagePath: '/u/x.png' });
    setActiveMap(session.id, map.id);
    const a = spawnInstance(session.id, 'Goblin A', 7);
    const b = spawnInstance(session.id, 'Goblin B', 7);
    // a in cell 0,0 ; b in cell 2,2 (grid 50)
    createToken({ mapId: map.id, kind: 'monster', refId: a.id, x: 10, y: 10 });
    createToken({ mapId: map.id, kind: 'monster', refId: b.id, x: 110, y: 110 });

    // Map fog blacks out area A; token fog hides creatures in area B.
    setFogLayer(map.id, 'map', true);
    coverFog(map.id, 'map');
    paintFog(map.id, 'map', ['2,2'], true); // reveal B's cell on the map layer
    setFogLayer(map.id, 'tokens', true);
    paintFog(map.id, 'tokens', ['0,0'], true); // token layer hides only 2,2

    const player = buildSnapshot(session.id, 'player')!;
    // A is under map fog; B is under token fog → player sees neither.
    expect(player.tokens).toHaveLength(0);
    // DM sees both regardless.
    expect(buildSnapshot(session.id, 'dm', map.id)!.tokens).toHaveLength(2);
  });

  it("never hides a player's own claimed PC token under fog (but hides it from others)", () => {
    const session = createSession('OwnToken');
    const map = createMap(session.id, { name: 'Cave', imagePath: '/u/x.png' });
    setActiveMap(session.id, map.id);
    const pc = createCharacter(session.id, { name: 'Hero', maxHp: 12 });
    claimCharacter(pc.id, 'socket-A');
    createToken({ mapId: map.id, kind: 'pc', refId: pc.id, x: 10, y: 10 });

    // Cover the whole map with token fog → the PC token sits under cover.
    setFogLayer(map.id, 'tokens', true);
    coverFog(map.id, 'tokens');

    // The owning player still receives their own token...
    const owner = buildSnapshot(session.id, 'player', null, 'socket-A')!;
    expect(owner.tokens).toHaveLength(1);
    // ...but a different player does not see it through the fog.
    const other = buildSnapshot(session.id, 'player', null, 'socket-B')!;
    expect(other.tokens).toHaveLength(0);
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

  it('deletes a map with its tokens + orphaned instances and re-homes active', () => {
    const s = createSession('DelMap');
    const m1 = createMap(s.id, { name: 'One' }); // becomes active
    const m2 = createMap(s.id, { name: 'Two' });
    expect(getActiveMapId(s.id)).toBe(m1.id);

    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7 });
    const onM1 = instantiateMonster(tmpl.id)!;
    const shared = instantiateMonster(tmpl.id)!;
    createToken({ mapId: m1.id, kind: 'monster', refId: onM1.id, x: 1, y: 1 });
    // `shared` is placed on both maps, so it must survive m1's deletion.
    createToken({ mapId: m1.id, kind: 'monster', refId: shared.id, x: 2, y: 2 });
    createToken({ mapId: m2.id, kind: 'monster', refId: shared.id, x: 3, y: 3 });

    deleteMap(m1.id);

    expect(getMap(m1.id)).toBeNull();
    expect(listMaps(s.id)).toHaveLength(1);
    expect(listTokens(m1.id)).toHaveLength(0);
    // Instance only on m1 is gone; the one still placed on m2 remains.
    expect(getMonster(onM1.id)).toBeNull();
    expect(getMonster(shared.id)).not.toBeNull();
    // Template is untouched; active map promoted to the survivor.
    expect(listMonsterTemplates(s.id)).toHaveLength(1);
    expect(getActiveMapId(s.id)).toBe(m2.id);
  });

  it('clears the active map when the last one is deleted', () => {
    const s = createSession('DelLast');
    const only = createMap(s.id, { name: 'Solo' });
    expect(getActiveMapId(s.id)).toBe(only.id);
    deleteMap(only.id);
    expect(listMaps(s.id)).toHaveLength(0);
    expect(getActiveMapId(s.id)).toBeNull();
  });
});

describe('roll-log "Apply damage" payload visibility', () => {
  it('keeps apply for the DM but strips it for players', () => {
    const session = createSession('Vis');
    const map = createMap(session.id, { name: 'M' });
    setActiveMap(session.id, map.id);
    addRollLog(session.id, {
      roller: 'Wizard',
      label: 'Fireball',
      expr: 'Fireball',
      total: 28,
      detail: 'Fireball: 28 fire — DC 15 DEX save for half',
      apply: { amount: 28, dc: 15, save: 'DEX', damageType: 'fire' },
    });
    expect(buildSnapshot(session.id, 'dm', map.id)!.rollLog.at(-1)!.apply).toBeTruthy();
    expect(buildSnapshot(session.id, 'player')!.rollLog.at(-1)!.apply).toBeUndefined();
  });
});

describe('non-combat objects', () => {
  it('round-trips objectKind, exposes it to players, and nulls the combat badge', () => {
    const s = createSession('Obj');
    const map = createMap(s.id, { name: 'Vault' });
    setActiveMap(s.id, map.id);
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Locked Chest',
      maxHp: 10,
      objectKind: 'chest',
      disposition: 'neutral',
    });
    expect(tmpl.objectKind).toBe('chest');
    const inst = instantiateMonster(tmpl.id)!;
    expect(inst.objectKind).toBe('chest'); // copied onto the instance
    expect(getMonster(inst.id)!.objectKind).toBe('chest'); // persisted via rowToMonster
    createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 1, y: 1 });

    const player = buildSnapshot(s.id, 'player')!;
    const pm = player.monsters.find((m) => m.id === inst.id)!;
    expect(pm.objectKind).toBe('chest'); // players know it's an object
    const tok = player.tokens.find((t) => t.refId === inst.id)!;
    expect(tok.combatRole).toBeNull(); // objects get no combat-role badge
  });

  it('fills a chest with loot, hides it until opened, and hands it to a PC', () => {
    const s = createSession('Loot');
    const map = createMap(s.id, { name: 'Vault' });
    setActiveMap(s.id, map.id);
    const chest = createMonsterTemplate(s.id, {
      name: 'Iron Chest',
      maxHp: 10,
      objectKind: 'chest',
      disposition: 'neutral',
    });
    const inst = instantiateMonster(chest.id)!;
    createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 1, y: 1 });
    setLoot(inst.id, {
      gold: 50,
      items: [{ id: 'i1', name: 'Healing Potion', qty: 2, note: 'Restores HP' }],
    });
    expect(getMonster(inst.id)!.loot!.gold).toBe(50);

    // A closed chest hides its contents from players…
    let pm = buildSnapshot(s.id, 'player')!.monsters.find((m) => m.id === inst.id)!;
    expect(pm.loot).toBeUndefined();
    // …but the DM always sees them.
    const dm = buildSnapshot(s.id, 'dm')!.monsters.find((m) => m.id === inst.id)!;
    expect(dm.loot!.items).toHaveLength(1);

    // Opening the chest reveals the loot to players.
    setCondition('monster', inst.id, {
      id: 'open',
      label: 'Open',
      aura: 'green',
      isConcentration: false,
    });
    pm = buildSnapshot(s.id, 'player')!.monsters.find((m) => m.id === inst.id)!;
    expect(pm.loot!.gold).toBe(50);

    // A character takes everything: gold to the purse, items to the inventory.
    const hero = createCharacter(s.id, { name: 'Aria' });
    expect(hero.gold).toBe(0);
    takeLoot(inst.id, hero.id, { all: true });
    const after = getCharacter(hero.id)!;
    expect(after.gold).toBe(50);
    expect(after.items.find((i) => i.name === 'Healing Potion')!.qty).toBe(2);
    // The emptied chest clears its loot and flags itself Looted.
    const drained = getMonster(inst.id)!;
    expect(drained.loot).toBeUndefined();
    expect(drained.conditions.some((c) => c.label === 'Looted')).toBe(true);
  });

  it("keeps a FRIENDLY creature's loot behind the same reveal gate", () => {
    const s = createSession('FriendlyLoot');
    const map = createMap(s.id, { name: 'Camp' });
    setActiveMap(s.id, map.id);
    const ally = spawnInstance(s.id, 'Caravan Guard', 11);
    updateMonster(ally.id, { disposition: 'friendly' });
    createToken({ mapId: map.id, kind: 'monster', refId: ally.id, x: 1, y: 1 });
    setLoot(ally.id, { gold: 25, items: [] });

    // Friendly = full stat block, but the pockets stay private until the DM
    // reveals them (dead + "Loot revealed", like every other creature).
    let pm = buildSnapshot(s.id, 'player')!.monsters.find((m) => m.id === ally.id)!;
    expect('maxHp' in pm).toBe(true); // stats ARE visible (friendly tier)
    expect((pm as Monster).loot).toBeUndefined();

    applyDamage('monster', ally.id, 999);
    setCondition('monster', ally.id, {
      id: 'lr',
      label: 'Loot revealed',
      aura: 'blue',
      isConcentration: false,
    });
    pm = buildSnapshot(s.id, 'player')!.monsters.find((m) => m.id === ally.id)!;
    expect((pm as Monster).loot!.gold).toBe(25);
  });
});

describe('coveredByFog (shared by snapshots + the drag-preview gate)', () => {
  it('treats a cell as covered when an enabled layer has NOT revealed it', () => {
    const grid = 50;
    const revealed = new Set(['0,0']); // only cell (0,0) is revealed
    // No fog layers → nothing is ever covered.
    expect(coveredByFog(null, null, grid, 9999, 9999)).toBe(false);
    // Map fog on: a point in the revealed cell is clear, elsewhere covered.
    expect(coveredByFog(revealed, null, grid, 10, 10)).toBe(false); // cell 0,0
    expect(coveredByFog(revealed, null, grid, 80, 10)).toBe(true); // cell 1,0
    // Token fog independently hides: revealed by map but not token → covered.
    expect(coveredByFog(revealed, new Set(), grid, 10, 10)).toBe(true);
    // Negative coords floor correctly (cell -1,-1 not revealed → covered).
    expect(coveredByFog(revealed, null, grid, -10, -10)).toBe(true);
  });
});

describe('createSnapshotBuilder (fan-out path)', () => {
  it('produces snapshots identical to buildSnapshot for every role', () => {
    const s = createSession('Builder');
    const map = createMap(s.id, { name: 'Arena' });
    setActiveMap(s.id, map.id);
    const tmpl = createMonsterTemplate(s.id, {
      name: 'Goblin',
      maxHp: 7,
      stats: { DEX: 14 },
      weapons: [{ name: 'Scimitar', kind: 'melee', damage: '1d6+2' }],
    });
    const inst = instantiateMonster(tmpl.id)!;
    createToken({ mapId: map.id, kind: 'monster', refId: inst.id, x: 0, y: 0 });

    const build = createSnapshotBuilder(s.id)!;
    expect(build('dm', map.id)).toEqual(buildSnapshot(s.id, 'dm', map.id));
    expect(build('player')).toEqual(buildSnapshot(s.id, 'player'));
  });

  it('shares the player-shaped monsters/roll log across player builds (computed once)', () => {
    const s = createSession('Builder2');
    const map = createMap(s.id, { name: 'Arena' });
    setActiveMap(s.id, map.id);
    const build = createSnapshotBuilder(s.id)!;
    const a = build('player', null, 'sock-a');
    const b = build('player', null, 'sock-b');
    // Same array identity proves the shaping ran once for the whole fan-out.
    expect(a.monsters).toBe(b.monsters);
    expect(a.rollLog).toBe(b.rollLog);
  });

  it('returns null for a missing session', () => {
    expect(createSnapshotBuilder('nope')).toBeNull();
  });
});
