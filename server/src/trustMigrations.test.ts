import { describe, it, expect } from 'vitest';
import {
  createSession,
  createMonsterTemplate,
  getMonster,
  setSheetAbility,
  updateMonster,
} from './sessions.js';
import { seedLibraryCreatures, getLibraryCreature, saveLibraryCreature } from './library.js';
import { getSrd } from './creatures/srd.js';
import { migrateDuplicateAttackAbilities, migrateSrdImmunities } from './trustMigrations.js';
import type { SheetAbility } from '../../shared/types.js';
import { weaponsFromActions } from '../../shared/monsterAttacks.js';

/** Group D of the 25 Sep review: the duplicate-attack bug, and the two data
 *  repairs. Every migration is run TWICE — the second run must change nothing —
 *  and customised data must survive untouched. */

const names = (id: string) => getMonster(id)!.sheetAbilities.map((a) => a.name);

describe('inserting a creature no longer duplicates its attacks', () => {
  it('a library Goblin arrives with its weapons once — not again as abilities', () => {
    seedLibraryCreatures();
    const lib = getLibraryCreature('Goblin')!;
    expect(lib.weapons?.length).toBeGreaterThan(0); // the library copy carries both…
    expect(lib.actions?.length).toBeGreaterThan(0);
    const s = createSession('Dup');
    const g = getMonster(createMonsterTemplate(s.id, { ...lib, source: 'srd' }).id)!;
    for (const w of g.weapons) expect(names(g.id)).not.toContain(w.name); // …the creature doesn't
  });

  it('an attack line with extra mechanics is KEPT as its own ability', () => {
    const s = createSession('Rider');
    const m = createMonsterTemplate(s.id, {
      name: 'Wolf-ish', maxHp: 11,
      weapons: [{ name: 'Bite', kind: 'melee', damage: '2d4+2', damageType: 'piercing', attackBonus: 4 }],
      actions: [{ name: 'Bite', description: '+4 to hit, 2d4+2 piercing; target makes a DC 11 STR save or is knocked prone.' }],
    });
    expect(names(m.id)).toContain('Bite'); // the prone rider isn't lost
  });

  it('an attack that differs from the stored weapon is kept', () => {
    const s = createSession('Differs');
    const m = createMonsterTemplate(s.id, {
      name: 'Brute', maxHp: 20,
      weapons: [{ name: 'Club', kind: 'melee', damage: '1d6+2', damageType: 'bludgeoning', attackBonus: 4 }],
      actions: [{ name: 'Club', description: '+5 to hit, 1d6+3 bludgeoning.' }],
    });
    expect(names(m.id)).toContain('Club');
  });
});

describe('migration: duplicate attack abilities', () => {
  /** A creature carrying exactly what the old insert produced. */
  const legacyDup = (extra: Partial<SheetAbility> = {}, description = '+4 to hit, reach 5 ft., 1d6+2 slashing.') => {
    const s = createSession('Legacy');
    const m = createMonsterTemplate(s.id, {
      name: 'Old Goblin', maxHp: 7,
      // As insert produced it: the weapon parsed from the very same attack text.
      weapons: weaponsFromActions([{ name: 'Scimitar', description: '+4 to hit, reach 5 ft., 1d6+2 slashing.' }]).weapons,
    });
    setSheetAbility('monster', m.id, {
      id: 'dup', name: 'Scimitar', type: 'ability', description, source: 'srd', ...extra,
    } as SheetAbility);
    return m.id;
  };

  it('removes an untouched duplicate — and a second run changes nothing', () => {
    const id = legacyDup();
    expect(migrateDuplicateAttackAbilities()).toBeGreaterThanOrEqual(1);
    expect(names(id)).not.toContain('Scimitar');
    const after = JSON.stringify(getMonster(id));
    expect(migrateDuplicateAttackAbilities()).toBe(0);
    expect(JSON.stringify(getMonster(id))).toBe(after);
  });

  it('keeps one the DM made rollable', () => {
    const id = legacyDup({ roll: { kind: 'damage', dice: '1d6+2' } });
    migrateDuplicateAttackAbilities();
    expect(names(id)).toContain('Scimitar');
  });

  it('keeps one the DM edited or that carries a rider', () => {
    const edited = legacyDup({}, '+4 to hit, 1d6+2 slashing. Favours the left flank.');
    const rider = legacyDup({}, '+4 to hit, 1d6+2 slashing; DC 10 CON save or poisoned.');
    migrateDuplicateAttackAbilities();
    expect(names(edited)).toContain('Scimitar');
    expect(names(rider)).toContain('Scimitar');
  });
});

describe('migration: SRD immunities', () => {
  /** A creature saved before immunities existed: SRD fields, none recorded. */
  const oldSrd = (name: string, patch: Record<string, unknown> = {}) => {
    const s = createSession('Old SRD');
    const t = getSrd(name)!;
    const m = createMonsterTemplate(s.id, { ...t, source: 'srd', immunities: [], ...patch });
    return m.id;
  };

  it('restores the Fire Elemental — and a second run changes nothing', () => {
    const id = oldSrd('Fire Elemental');
    expect(getMonster(id)!.immunities).toEqual([]);
    expect(migrateSrdImmunities()).toBeGreaterThanOrEqual(1);
    expect(getMonster(id)!.immunities).toEqual(['fire', 'poison']);
    const after = JSON.stringify(getMonster(id));
    expect(migrateSrdImmunities()).toBe(0);
    expect(JSON.stringify(getMonster(id))).toBe(after);
  });

  it('moves the Young Red Dragon\'s fire from resistance to immunity', () => {
    const id = oldSrd('Young Red Dragon', { resistances: ['fire'] });
    migrateSrdImmunities();
    expect(getMonster(id)!.immunities).toEqual(['fire']);
    expect(getMonster(id)!.resistances).toEqual([]);
  });

  it('a numbered instance of an unedited creature counts', () => {
    const id = oldSrd('Skeleton', { name: 'Skeleton 3' });
    migrateSrdImmunities();
    expect(getMonster(id)!.immunities).toEqual(['poison']);
  });

  it('leaves an edited or CR-scaled creature alone', () => {
    const buffed = oldSrd('Fire Elemental', { maxHp: 150 });
    const reskinned = oldSrd('Imp', { resistances: ['cold'] });
    const retyped = oldSrd('Ghoul', { creatureType: 'aberration' });
    migrateSrdImmunities();
    expect(getMonster(buffed)!.immunities).toEqual([]);
    expect(getMonster(reskinned)!.immunities).toEqual([]);
    expect(getMonster(retyped)!.immunities).toEqual([]);
  });

  it('repairs an unedited library copy too, and leaves an edited one', () => {
    const t = getSrd('Specter')!;
    saveLibraryCreature({ ...t, name: 'Specter', immunities: [] }, true);
    saveLibraryCreature({ ...getSrd('Wight')!, name: 'Wight', immunities: [], maxHp: 99 }, true);
    migrateSrdImmunities();
    expect(getLibraryCreature('Specter')!.immunities).toEqual(['necrotic', 'poison']);
    expect(getLibraryCreature('Wight')!.immunities).toEqual([]);
    expect(migrateSrdImmunities()).toBe(0);
  });

  it('never touches a creature that already has immunities', () => {
    const id = oldSrd('Zombie');
    updateMonster(id, { immunities: ['cold'] }); // the DM's own call
    migrateSrdImmunities();
    expect(getMonster(id)!.immunities).toEqual(['cold']);
  });
});
