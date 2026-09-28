import { describe, expect, it } from 'vitest';
import { CULTIST_DEMON_BATCH, cultistDemonCreatures } from './cultistDemonLibrary.js';
import { creatureSize, defaultMonsterWidthFt, monsterTint, resolveMonsterModelType } from '../../../shared/monsterAppearance.js';
import { creatureGaps } from './completeness.js';
import { db } from '../db.js';
import { deleteLibraryCreature, getLibraryCreature, saveLibraryCreature, seedLibraryCreatures } from '../library.js';
import { createMonsterTemplate, createSession, instantiateMonster } from '../sessions.js';

describe('cultist and demon library expansion', () => {
  it('adds missing entries once while preserving edited copies, existing Cultist and deletions', () => {
    seedLibraryCreatures();
    for (const name of CULTIST_DEMON_BATCH) deleteLibraryCreature(name);
    db.prepare('DELETE FROM app_meta WHERE key=?').run('starter-cultists-demons-v1');
    saveLibraryCreature({ name: 'Cultist', maxHp: 55, armorClass: 9, modelType: 'human-mage' }, true);
    saveLibraryCreature({ name: 'Vrock', maxHp: 321, modelType: 'none', modelColor: 'blue' }, true);
    expect(seedLibraryCreatures()).toBe(4);
    expect(getLibraryCreature('Cultist')).toMatchObject({ maxHp: 55, armorClass: 9, modelType: 'human-mage' });
    expect(getLibraryCreature('Vrock')).toMatchObject({ maxHp: 321, modelType: 'none', modelColor: 'blue' });
    expect(getLibraryCreature('Cultist Fanatic')).toMatchObject({ maxHp: 44, armorClass: 13, level: 2, modelType: 'cultist-fanatic' });
    deleteLibraryCreature('Hezrou');
    expect(seedLibraryCreatures()).toBe(0);
    expect(getLibraryCreature('Hezrou')).toBeNull();
  });

  it('resolves all names before generic humanoid/fiend types and respects explicit DM choices', () => {
    for (const entry of cultistDemonCreatures()) {
      expect(creatureGaps(entry), entry.name).toEqual([]);
      expect(resolveMonsterModelType({ name: entry.name + ' 4', creatureType: entry.creatureType })).toBe(entry.modelType);
      const demon = entry.creatureType.includes('demon');
      expect(creatureSize({ name: entry.name })).toBe(demon ? 'large' : 'medium');
      expect(defaultMonsterWidthFt(entry)).toBe(demon ? 10 : 5);
      expect(monsterTint(entry)).toBe('#ffffff');
    }
    expect(resolveMonsterModelType({ name: 'Cultist Fanatic', modelType: 'none' })).toBe('none');
    expect(resolveMonsterModelType({ name: 'Cultist Fanatic', creatureType: 'human-mage' })).toBe('cultist-fanatic');
    expect(resolveMonsterModelType({ name: 'Vrock', modelType: 'dragon' })).toBe('dragon');
  });

  it('spawns complete attacks and explicit spell/save rolls without duplicate or accidental damage buttons', () => {
    const session = createSession('Cultists and demons');
    const expectedRolls: Record<string, string[]> = {
      'Cultist Swordsman': [], 'Cultist Fanatic': ['Spiritual Weapon (2/day)'],
      Vrock: ['Spore damage', 'Stunning Screech (1/day)'], Hezrou: [], Glabrezu: ['Pummel'],
    };
    for (const entry of cultistDemonCreatures()) {
      const template = createMonsterTemplate(session.id, { ...entry, source: entry.source === 'srd' ? 'srd' : 'manual' });
      const monster = instantiateMonster(template.id)!;
      expect(monster.weapons).toEqual(entry.weapons);
      expect(monster.sheetAbilities.some(a => a.name === entry.weapons![0].name)).toBe(false);
      expect(monster.sheetAbilities.filter(a => a.roll).map(a => a.name)).toEqual(expectedRolls[entry.name]);
      if (entry.name === 'Cultist Fanatic') {
        expect(monster.weapons[0]).toMatchObject({ damage: '1d8+2', extraDamage: '2d6', extraDamageType: 'necrotic' });
        expect(monster.sheetAbilities.find(a => a.name === 'Spiritual Weapon (2/day)')?.roll).toMatchObject({ kind: 'attack', attackBonus: 4, dice: '1d8+2', damageType: 'force' });
      }
      if (entry.name === 'Vrock') {
        expect(monster.weapons[0]).toMatchObject({ damage: '2d6+3', extraDamage: '3d6', extraDamageType: 'poison' });
        expect(monster.sheetAbilities.find(a => a.name === 'Stunning Screech (1/day)')?.roll).toMatchObject({ save: 'CON', dc: 15, saveDamage: 'none', targetMode: 'multiple' });
      }
      if (entry.name === 'Hezrou') expect(monster.weapons[0]).toMatchObject({ damage: '1d4+4', extraDamage: '2d8', extraDamageType: 'poison' });
      if (entry.name === 'Glabrezu') expect(monster.sheetAbilities.find(a => a.name === 'Pummel')?.roll).toMatchObject({ dc: 17, save: 'DEX', dice: '3d6+5', saveDamage: 'half' });
    }
  });
});
