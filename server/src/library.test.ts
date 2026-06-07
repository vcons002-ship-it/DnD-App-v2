import { describe, it, expect } from 'vitest';
import {
  saveLibraryCreature,
  getLibraryCreature,
  searchLibraryCreatures,
  deleteLibraryCreature,
  saveLibraryItem,
  listLibraryItems,
  deleteLibraryItem,
  seedLibraryItems,
  saveLibraryCharacter,
  getLibraryCharacter,
  searchLibraryCharacters,
  deleteLibraryCharacter,
} from './library.js';
import { createSession, createCharacterFromLibrary, getCharacter } from './sessions.js';

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

  it('seeds the SRD item catalogue once (idempotent)', () => {
    const added = seedLibraryItems();
    expect(added).toBeGreaterThan(50); // a sizeable catalogue lands
    // Recognizable seeded entries across categories.
    expect(listLibraryItems('bag of holding')).toHaveLength(1);
    expect(listLibraryItems('plate armor').length).toBeGreaterThanOrEqual(1);
    // Re-running is a no-op (the one-time marker is set).
    expect(seedLibraryItems()).toBe(0);
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
