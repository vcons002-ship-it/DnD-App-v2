import { describe, it, expect } from 'vitest';
import { deriveClassResources } from './data/classTables.js';
import {
  createSession,
  createCharacter,
  getCharacter,
  setResource,
  setItem,
  removeItem,
} from './sessions.js';

describe('class resources', () => {
  it('derives 5e spell slots + class resources', () => {
    const wiz = deriveClassResources('Wizard', 5);
    expect(wiz.spellSlots.L1.max).toBe(4);
    expect(wiz.spellSlots.L3.max).toBe(2);
    expect(wiz.spellSlots.L4).toBeUndefined();

    const barb = deriveClassResources('Barbarian', 6);
    expect(barb.resources.Rage.max).toBe(4);
    expect(Object.keys(barb.spellSlots)).toHaveLength(0);

    const pal = deriveClassResources('Paladin', 1);
    expect(pal.resources['Lay on Hands'].max).toBe(5);
    expect(Object.keys(pal.spellSlots)).toHaveLength(0); // half-caster: no slots at 1
  });

  it('auto-fills slots on create and tracks usage + items', () => {
    const s = createSession('Res');
    const c = createCharacter(s.id, { name: 'Mage', className: 'Sorcerer', level: 3 });
    expect(c.spellSlots.L2.max).toBe(2);
    expect(c.resources['Sorcery Points'].max).toBe(3);

    setResource(c.id, 'spellSlots', 'L1', { used: 2 });
    expect(getCharacter(c.id)!.spellSlots.L1.used).toBe(2);

    // Custom counter + clamp.
    setResource(c.id, 'resources', 'Luck', { max: 3, used: 5 });
    expect(getCharacter(c.id)!.resources.Luck).toEqual({ max: 3, used: 3 });
    setResource(c.id, 'resources', 'Luck', { remove: true });
    expect(getCharacter(c.id)!.resources.Luck).toBeUndefined();

    setItem(c.id, { id: 'i1', name: 'Rope', qty: 1, note: '50ft' });
    expect(getCharacter(c.id)!.items[0].name).toBe('Rope');
    removeItem(c.id, 'i1');
    expect(getCharacter(c.id)!.items).toHaveLength(0);
  });
});

import { addRollLog, clearRollLog, listRollLog } from './sessions.js';

describe('roll log', () => {
  it('stores rolls and returns them oldest-first', () => {
    const s = createSession('Rolls');
    addRollLog(s.id, { roller: 'DM', label: 'a', expr: 'd20', total: 5, detail: 'd20=5' });
    addRollLog(s.id, { roller: 'Mage', label: 'b', expr: 'd6', total: 4, detail: 'd6=4' });
    const log = listRollLog(s.id);
    expect(log).toHaveLength(2);
    expect(log[0].label).toBe('a'); // oldest first
    expect(log[1].roller).toBe('Mage');
  });

  it('clears the log for a session without touching others', () => {
    const a = createSession('A');
    const b = createSession('B');
    addRollLog(a.id, { roller: 'DM', label: 'x', expr: 'd20', total: 9, detail: 'd20=9' });
    addRollLog(b.id, { roller: 'DM', label: 'y', expr: 'd20', total: 3, detail: 'd20=3' });
    clearRollLog(a.id);
    expect(listRollLog(a.id)).toHaveLength(0);
    expect(listRollLog(b.id)).toHaveLength(1); // other sessions are unaffected
  });
});

import {
  createMap, setActiveMap, createToken, instantiateMonster,
  createMonsterTemplate, rollAllInitiative, rollMissingInitiative,
  firstInInitiative, setTokenInitiative, getToken,
} from './sessions.js';

describe('initiative rolls', () => {
  it('Add rolls only rolls un-rolled tokens; Roll all resets everyone', () => {
    const s = createSession('Init');
    const map = createMap(s.id, { name: 'Arena' });
    setActiveMap(s.id, map.id);
    const tmpl = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 7 });
    const a = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 0, y: 0 });
    const b = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(tmpl.id)!.id, x: 1, y: 1 });

    setTokenInitiative(a.id, 17); // a already rolled
    rollMissingInitiative(map.id);
    expect(getToken(a.id)!.initiative).toBe(17); // unchanged
    expect(getToken(b.id)!.initiative).not.toBeNull(); // b got a roll

    // firstInInitiative returns the highest.
    setTokenInitiative(b.id, 5);
    expect(firstInInitiative(map.id)).toBe(a.id);

    // Roll all overwrites both.
    rollAllInitiative(map.id);
    expect(getToken(a.id)!.initiative).not.toBe(17);
  });
});

import { renameMap, renameSession, getMap, getSessionById } from './sessions.js';

describe('rename', () => {
  it('renames maps and sessions; ignores blank names', () => {
    const s = createSession('Old Campaign');
    const map = createMap(s.id, { name: 'Map 1' });
    renameMap(map.id, 'The Sunken Keep');
    expect(getMap(map.id)!.name).toBe('The Sunken Keep');
    renameMap(map.id, '   '); // blank ignored
    expect(getMap(map.id)!.name).toBe('The Sunken Keep');
    renameSession(s.id, 'Curse of Strahd');
    expect(getSessionById(s.id)!.name).toBe('Curse of Strahd');
  });
});
