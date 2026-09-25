import { describe, expect, it } from 'vitest';
import { starterCreatures } from './starterLibrary.js';
import { MONSTER_MODEL_TYPES, creatureSize, monsterTint, resolveMonsterModelType } from '../../../shared/monsterAppearance.js';
import { db } from '../db.js';
import { getLibraryCreature, saveLibraryCreature, seedLibraryCreatures, deleteLibraryCreature } from '../library.js';
import { createSession, createMonsterTemplate, instantiateMonster } from '../sessions.js';

describe('curated 3D starter library', () => {
  it('has complete creature stats, usable attacks, real model families and sensible sizes', () => {
    const entries = starterCreatures();
    expect(entries).toHaveLength(38);
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
    db.prepare('INSERT OR REPLACE INTO app_meta (key,value) VALUES (?,?)').run('starter-common-creatures-v2', '1');
    db.prepare('INSERT OR REPLACE INTO app_meta (key,value) VALUES (?,?)').run('starter-common-creatures-v1', '1');
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
  it('adds the common batch once and repairs blank stats without replacing edited fields', () => {
    db.prepare('DELETE FROM app_meta WHERE key IN (?,?)').run('starter-common-creatures-v1', 'library-stat-completeness-v1');
    deleteLibraryCreature('Bugbear');
    saveLibraryCreature({ name: 'Cultist', maxHp: 55, armorClass: 9, stats: { STR: 17 }, icon: '/custom.png' }, true);
    seedLibraryCreatures();
    expect(getLibraryCreature('Bugbear')?.modelType).toBe('bugbear');
    expect(getLibraryCreature('Cultist')).toMatchObject({ maxHp: 55, armorClass: 9, stats: { STR: 17, DEX: 12 }, icon: '/custom.png' });
    expect(getLibraryCreature('Cultist')?.weapons?.[0].name).toBe('Scimitar');
    deleteLibraryCreature('Bugbear'); seedLibraryCreatures();
    expect(getLibraryCreature('Bugbear')).toBeNull();
  });
  it('adds the second batch once, restores missing appearance and preserves edits and deletions', () => {
    db.prepare('DELETE FROM app_meta WHERE key = ?').run('starter-common-creatures-v2');
    saveLibraryCreature({ name: 'Black Bear', maxHp: 77 }, true);
    saveLibraryCreature({ name: 'Veteran', maxHp: 80, modelType: 'none', modelColor: 'red' }, true);
    deleteLibraryCreature('Ogre'); deleteLibraryCreature('Giant Rat');
    seedLibraryCreatures();
    expect(getLibraryCreature('Ogre')?.modelType).toBe('ogre');
    expect(getLibraryCreature('Black Bear')).toMatchObject({ maxHp: 77, modelType: 'brown-bear', modelColor: '', visualTags: ['beast', 'black'] });
    expect(getLibraryCreature('Veteran')).toMatchObject({ maxHp: 80, modelType: 'none', modelColor: 'red' });
    expect(getLibraryCreature('Giant Rat')).toBeNull();
    deleteLibraryCreature('Ogre'); seedLibraryCreatures();
    expect(getLibraryCreature('Ogre')).toBeNull();
  });
  it('reuses the bear and spider models at their rule sizes with tag-driven black tint', () => {
    const entries = starterCreatures();
    const bear = entries.find(c => c.name === 'Black Bear')!;
    expect(monsterTint(bear)).toBe('#333333');
    expect(monsterTint({ ...bear, modelColor: 'natural' })).toBe('#ffffff');
    expect(creatureSize(bear)).toBe('medium');
    expect(creatureSize(entries.find(c => c.name === 'Giant Wolf Spider')!)).toBe('medium');
    expect(creatureSize(entries.find(c => c.name === 'Giant Bat')!)).toBe('large');
    expect(resolveMonsterModelType({ name: 'Giant Bat 2' })).toBe('giant-bat');
    expect(resolveMonsterModelType({ name: 'Black Bear 1' })).toBe('brown-bear');
    expect(resolveMonsterModelType({ name: 'Giant Wolf Spider' })).toBe('spider');
  });
  it('repairs legacy imports after old seed markers while preserving custom appearances and stats', () => {
    for (const marker of ['starter-creatures-3d-v1', 'starter-creature-imp-v1', 'starter-common-creatures-v1', 'starter-common-creatures-v2', 'library-stat-completeness-v1']) {
      db.prepare('INSERT OR REPLACE INTO app_meta (key,value) VALUES (?,?)').run(marker, '1');
    }
    db.prepare('DELETE FROM app_meta WHERE key=?').run('library-specific-families-v1');
    saveLibraryCreature({name: 'Cultist', maxHp: 91, armorClass: 22, modelType: 'human-mage', icon: '/custom-cultist.png', visualTags: ['ice']}, true);
    saveLibraryCreature({name: 'Commoner', maxHp: 19}, true);
    saveLibraryCreature({name: 'Black Bear', maxHp: 88}, true);
    saveLibraryCreature({name: 'Brown Bear', maxHp: 50, visualTags: ['fire']}, true);
    saveLibraryCreature({name: 'Scout', maxHp: 32, modelType: 'none'}, true);
    saveLibraryCreature({name: 'Veteran', maxHp: 99, modelType: 'dwarf-warrior', modelColor: 'red'}, true);
    deleteLibraryCreature('Bugbear');
    expect(seedLibraryCreatures()).toBe(0);
    expect(getLibraryCreature('Cultist')).toMatchObject({maxHp: 91, armorClass: 22, modelType: 'cultist', icon: '/custom-cultist.png', visualTags: ['ice']});
    expect(getLibraryCreature('Commoner')).toMatchObject({maxHp: 19, modelType: 'human-commoner'});
    expect(getLibraryCreature('Black Bear')).toMatchObject({maxHp: 88, modelType: 'brown-bear', visualTags: ['beast', 'black']});
    expect(getLibraryCreature('Brown Bear')).toMatchObject({modelType: 'brown-bear', modelColor: '', visualTags: ['fire']});
    expect(getLibraryCreature('Scout')?.modelType).toBe('none');
    expect(getLibraryCreature('Veteran')).toMatchObject({modelType: 'dwarf-warrior', modelColor: 'red'});
    expect(getLibraryCreature('Bugbear')).toBeNull();
    saveLibraryCreature({name: 'Cultist', modelType: 'human-mage'}, true);
    seedLibraryCreatures();
    expect(getLibraryCreature('Cultist')?.modelType).toBe('human-mage');
  });
  it('resolves role-specific imports even when their saved family is blank', () => {
    for (const [name, family] of [['Cultist', 'cultist'], ['Scout', 'scout'], ['Veteran', 'veteran'], ['Commoner', 'human-commoner'], ['Mage', 'human-mage'], ['Bandit Captain', 'bandit-captain'], ['Sailor Marine', 'sailor-marine'], ['Elite Castle Guard', 'elite-castle-guard'], ['Pirate First Mate', 'pirate-first-mate'], ['Guard Captain', 'veteran']]) {
      expect(resolveMonsterModelType({name: name + ' 2', creatureType: 'Medium humanoid', modelType: ''})).toBe(family);
    }
    expect(resolveMonsterModelType({name: 'Cultist', modelType: 'none'})).toBe('none');
    expect(resolveMonsterModelType({name: 'Cultist', modelType: 'dwarf-warrior'})).toBe('dwarf-warrior');
    expect(resolveMonsterModelType({name: 'Cultist', objectKind: 'other'})).toBe('none');
    expect(resolveMonsterModelType({name: 'Cultist', creatureType: 'human-mage'})).toBe('cultist');
    expect(resolveMonsterModelType({name: 'Archmage', creatureType: 'dragon'})).toBe('dragon');
    expect(resolveMonsterModelType({name: 'constructor'})).toBe('');
  });

});

