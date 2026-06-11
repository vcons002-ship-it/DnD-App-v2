import { describe, it, expect } from 'vitest';
import {
  saveLibraryCreature,
  getLibraryCreature,
  searchLibraryCreatures,
  deleteLibraryCreature,
  saveLibraryItem,
  listLibraryItems,
  getLibraryItemByName,
  deleteLibraryItem,
  seedLibraryItems,
  saveLibraryCharacter,
  getLibraryCharacter,
  searchLibraryCharacters,
  deleteLibraryCharacter,
} from './library.js';
import { createSession, createCharacterFromLibrary, getCharacter } from './sessions.js';
import { setMeta } from './db.js';

describe('creature library', () => {
  it('saves, finds, and conflict-prompts by name', () => {
    deleteLibraryCreature('Bandit Captain');
    const first = saveLibraryCreature(
      { name: 'Bandit Captain', maxHp: 65, armorClass: 15, creatureType: 'humanoid' },
      false,
    );
    expect('saved' in first).toBe(true);

    // Same name without overwrite -> conflict carrying the existing entry.
    const again = saveLibraryCreature({ name: 'Bandit Captain', maxHp: 1 }, false);
    expect('conflict' in again).toBe(true);
    if ('conflict' in again) expect(again.conflict.maxHp).toBe(65);

    // Overwrite replaces it.
    const over = saveLibraryCreature({ name: 'Bandit Captain', maxHp: 70 }, true);
    expect('saved' in over).toBe(true);
    expect(getLibraryCreature('bandit captain')!.maxHp).toBe(70);

    // Search finds it; results are tagged source 'library' (no AI needed).
    const hits = searchLibraryCreatures('bandit');
    expect(hits.some((c) => c.name === 'Bandit Captain')).toBe(true);
    expect(hits[0].source).toBe('library');

    deleteLibraryCreature('Bandit Captain');
    expect(getLibraryCreature('Bandit Captain')).toBeNull();
  });

  it('flags a name that exists only in the SRD as a conflict (shadowing)', () => {
    deleteLibraryCreature('Hobgoblin');
    // Hobgoblin is a built-in SRD creature, not yet in the library.
    const res = saveLibraryCreature({ name: 'Hobgoblin', maxHp: 99 }, false);
    expect('conflict' in res).toBe(true);
    if ('conflict' in res) expect(res.conflict.source).toBe('srd');
    // Overwriting creates the shadowing library copy.
    expect('saved' in saveLibraryCreature({ name: 'Hobgoblin', maxHp: 99 }, true)).toBe(true);
    expect(getLibraryCreature('Hobgoblin')!.maxHp).toBe(99);
    deleteLibraryCreature('Hobgoblin');
  });

  it('stores library items', () => {
    const it1 = saveLibraryItem({ name: 'Zzphtest Trinket', description: 'x', qtyDefault: 1 });
    expect(it1.name).toBe('Zzphtest Trinket');
    expect(listLibraryItems('zzphtest').some((i) => i.id === it1.id)).toBe(true);
    deleteLibraryItem(it1.id);
    expect(listLibraryItems('zzphtest').some((i) => i.id === it1.id)).toBe(false);
  });

  it('getLibraryItemByName backs the manual-save conflict prompt (exact, case-insensitive)', () => {
    const it1 = saveLibraryItem({ name: 'Zzphtest Saver', description: 'd' });
    expect(getLibraryItemByName('zzphtest saver')!.id).toBe(it1.id);
    expect(getLibraryItemByName('  ZZPHTEST SAVER ')!.id).toBe(it1.id);
    expect(getLibraryItemByName('zzphtest')).toBeNull(); // exact match only
    deleteLibraryItem(it1.id);
    expect(getLibraryItemByName('zzphtest saver')).toBeNull();
  });

  it('round-trips MULTIPLE magic-effect modifiers on one item (validated)', () => {
    const it1 = saveLibraryItem({
      name: 'Zzphtest Warded Cloak',
      description: 'x',
      modifiers: [
        { target: { kind: 'ac' }, value: 1 },
        { target: { kind: 'save' }, value: 1 },
        { target: { kind: 'ability', ability: 'str' }, value: 19, set: true }, // case-fixed
        { target: { kind: 'bogus' }, value: 3 }, // dropped
        { target: { kind: 'attack' }, value: 'NaN' }, // dropped
      ],
    });
    const got = listLibraryItems('zzphtest warded')[0];
    expect(got.modifiers).toHaveLength(3);
    expect(got.modifiers![0].target).toEqual({ kind: 'ac' });
    expect(got.modifiers![2]).toMatchObject({
      target: { kind: 'ability', ability: 'STR' },
      value: 19,
      set: true,
    });
    expect(got.modifiers!.every((m) => m.id)).toBe(true);
    deleteLibraryItem(it1.id);
  });

  it('seeds the SRD item catalogue (idempotent, present after seeding)', () => {
    // Force a seed attempt even if a prior run already set the one-time marker.
    setMeta('items_seeded_v1', '');
    seedLibraryItems();
    // The catalogue is present across categories (regardless of how many were
    // freshly inserted vs. already saved by an earlier run).
    expect(listLibraryItems('bag of holding')).toHaveLength(1);
    expect(listLibraryItems('plate armor').length).toBeGreaterThanOrEqual(1);
    expect(listLibraryItems('potion of healing').length).toBeGreaterThanOrEqual(1);
    // Re-running is a no-op once the one-time marker is set.
    expect(seedLibraryItems()).toBe(0);
  });

  it('seeded magic items carry preset modifiers (and the backfill upgrades old rows)', () => {
    // Simulate a library seeded BEFORE presets existed: a plain Cloak row.
    const cloak = listLibraryItems('cloak of protection')[0];
    if (cloak) deleteLibraryItem(cloak.id);
    const plain = saveLibraryItem({ name: 'Cloak of Protection', description: 'old row' });
    expect(plain.modifiers).toBeUndefined();
    setMeta('items_modifiers_v1', '');
    seedLibraryItems();
    const upgraded = listLibraryItems('cloak of protection')[0];
    expect(upgraded.description).toBe('old row'); // backfill never rewrites text
    expect(upgraded.modifiers).toHaveLength(2); // +1 AC and +1 all saves
    expect(upgraded.modifiers!.map((m) => m.target.kind).sort()).toEqual(['ac', 'save']);

    // A set-score preset: Gauntlets of Ogre Power floor STR at 19.
    const gauntlets = listLibraryItems('gauntlets of ogre power')[0];
    expect(gauntlets.modifiers).toMatchObject([
      { target: { kind: 'ability', ability: 'STR' }, value: 19, set: true },
    ]);

    // The backfill respects a DM's own effects (only fills where there are none).
    const luck = listLibraryItems('stone of good luck')[0];
    saveLibraryItem({
      name: luck.name,
      description: luck.description,
      modifiers: [{ target: { kind: 'initiative' }, value: 2 }],
    });
    setMeta('items_modifiers_v1', '');
    seedLibraryItems();
    const kept = listLibraryItems('stone of good luck')[0];
    expect(kept.modifiers).toHaveLength(1);
    expect(kept.modifiers![0].target.kind).toBe('initiative');
    // Restore the catalogue presets for other tests.
    saveLibraryItem({ name: luck.name, description: luck.description, modifiers: [] });
    setMeta('items_modifiers_v1', '');
    seedLibraryItems();
  });
});

describe('character library', () => {
  it('round-trips a full sheet (incl. spells/items/resources) + conflict prompt', () => {
    deleteLibraryCharacter('Lirael');
    const sheet = {
      name: 'Lirael',
      race: 'Elf',
      className: 'Wizard',
      level: 5,
      maxHp: 27,
      curHp: 20,
      stats: { INT: 18, DEX: 14 },
      spellSlots: { '1': { max: 4, used: 1 } },
      resources: { 'Arcane Recovery': { max: 1, used: 0 } },
      items: [{ id: 'i1', name: 'Spellbook', qty: 1, note: '' }],
      sheetAbilities: [
        { id: 'a1', name: 'Fire Bolt', type: 'spell' as const, description: 'Hurl fire.' },
      ],
      proficientSkills: ['Arcana'],
    };
    expect('saved' in saveLibraryCharacter(sheet, false)).toBe(true);

    const got = getLibraryCharacter('lirael')!;
    expect(got.className).toBe('Wizard');
    expect(got.spellSlots['1']).toEqual({ max: 4, used: 1 });
    expect(got.items[0].name).toBe('Spellbook');
    expect(got.sheetAbilities[0].name).toBe('Fire Bolt');

    // Duplicate name without overwrite -> conflict.
    expect('conflict' in saveLibraryCharacter({ name: 'Lirael' }, false)).toBe(true);
    expect(searchLibraryCharacters('lir').some((c) => c.name === 'Lirael')).toBe(true);

    // Loading into a session preserves the saved fields (used counts kept).
    const s = createSession('Camp');
    const created = createCharacterFromLibrary(s.id, 'Lirael')!;
    const inSession = getCharacter(created.id)!;
    expect(inSession.level).toBe(5);
    expect(inSession.curHp).toBe(20);
    expect(inSession.spellSlots['1']).toEqual({ max: 4, used: 1 });
    expect(inSession.sheetAbilities[0].name).toBe('Fire Bolt');
    expect(inSession.claimedBy).toBeNull();

    deleteLibraryCharacter('Lirael');
    expect(getLibraryCharacter('Lirael')).toBeNull();
  });
});
