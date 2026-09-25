import { describe, expect, it } from 'vitest';
import { starterCreatures } from './starterLibrary.js';
import { MONSTER_MODEL_TYPES, creatureSize } from '../../../shared/monsterAppearance.js';
import { db } from '../db.js';
import { getLibraryCreature, saveLibraryCreature, seedLibraryCreatures, deleteLibraryCreature } from '../library.js';
import { createSession, createMonsterTemplate, instantiateMonster } from '../sessions.js';

describe('curated 3D starter library', () => {
  it('has complete creature stats, usable attacks, real model families and sensible sizes', () => {
    const entries = starterCreatures();
    expect(entries).toHaveLength(23);
    expect(new Set(entries.map(c => c.name)).size).toBe(entries.length);
    for (const c of entries) {
      expect(MONSTER_MODEL_TYPES).toContain(c.modelType);
      if (c.name === 'Mage Hand') continue;
      expect(c.maxHp).toBeGreaterThan(0);
      expect(c.armorClass).toBeGreaterThan(0);
      expect(Object.keys(c.stats).sort()).toEqual(['CHA', 'CON', 'DEX', 'INT', 'STR', 'WIS']);
      expect(c.weapons!.length).toBeGreaterThan(0);
      expect(c.actions.length).toBeGreaterThan(0);
    }
    expect(creatureSize(entries.find(c => c.name === 'Mage Hand')!)).toBe('tiny');
    const imp = entries.find(c => c.name === 'Imp')!;
    expect(creatureSize(imp)).toBe('tiny');
    expect(imp.weapons?.some(w => w.name === 'Sting' && w.damage === '1d4+3')).toBe(true);
    expect(imp.actions.some(a => a.name === 'Invisibility')).toBe(true);
    expect(imp.modelColor).toBe('natural');
    expect(creatureSize(entries.find(c => c.name === 'Giant Rat')!)).toBe('small');
    expect(creatureSize(entries.find(c => c.name === 'Dire Wolf')!)).toBe('large');
  });
  it('adds Imp to an already seeded library without restoring deleted older entries', () => {
    db.prepare('INSERT OR REPLACE INTO app_meta (key,value) VALUES (?,?)').run('starter-creatures-3d-v1', '1');
    db.prepare('DELETE FROM app_meta WHERE key = ?').run('starter-creature-imp-v1');
    deleteLibraryCreature('Imp'); deleteLibraryCreature('Giant Rat');
    expect(seedLibraryCreatures()).toBe(1);
    expect(getLibraryCreature('Giant Rat')).toBeNull();
    const imp = getLibraryCreature('Imp')!;
    const session = createSession('Imp library regression');
    const template = createMonsterTemplate(session.id, { ...imp, source: 'manual' });
    expect(instantiateMonster(template.id)).toMatchObject({ modelType: 'imp', modelColor: 'natural', creatureType: 'Tiny fiend (devil)', maxHp: 10, armorClass: 13 });
    deleteLibraryCreature('Imp');
    expect(seedLibraryCreatures()).toBe(0);
    expect(getLibraryCreature('Imp')).toBeNull();
  });
  it('upgrades an older Imp appearance without replacing its edited stats', () => {
    db.prepare('DELETE FROM app_meta WHERE key = ?').run('starter-creature-imp-v1');
    saveLibraryCreature({ name: 'Imp', maxHp: 77 }, true);
    seedLibraryCreatures();
    expect(getLibraryCreature('Imp')).toMatchObject({ modelType: 'imp', modelColor: 'natural', maxHp: 77 });
  });

  it('seeds once, preserves custom copies, and does not restore deleted entries on restart', () => {
    db.prepare('DELETE FROM app_meta WHERE key = ?').run('starter-creatures-3d-v1');
    saveLibraryCreature({ name: 'Guard', maxHp: 123, modelType: 'dwarf-warrior' }, true);
    expect(seedLibraryCreatures()).toBeGreaterThan(0);
    expect(getLibraryCreature('Guard')?.maxHp).toBe(123);
    expect(getLibraryCreature('Guard')?.modelType).toBe('dwarf-warrior');
    const rat = getLibraryCreature('Giant Rat')!;
    const session = createSession('Starter library test');
    const template = createMonsterTemplate(session.id, { ...rat, source: 'manual' });
    const spawned = instantiateMonster(template.id)!;
    expect(spawned.modelType).toBe('giant-rat');
    expect(spawned.weapons.some(w => w.name === 'Bite' && w.damage === '1d4+2')).toBe(true);
    const hand = getLibraryCreature('Mage Hand')!;
    expect(hand.weapons).toEqual([]);
    expect(hand.abilities.some(a => a.description.includes('Cannot attack'))).toBe(true);
    deleteLibraryCreature('Giant Rat');
    expect(seedLibraryCreatures()).toBe(0);
    expect(getLibraryCreature('Giant Rat')).toBeNull();
  });
});

