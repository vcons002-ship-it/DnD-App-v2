import { describe, it, expect } from 'vitest';
import {
  saveLibraryCreature,
  getLibraryCreature,
  searchLibraryCreatures,
  deleteLibraryCreature,
  saveLibraryItem,
  listLibraryItems,
  deleteLibraryItem,
} from './library.js';

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

  it('stores library items', () => {
    const it1 = saveLibraryItem({ name: 'Potion of Healing', description: '2d4+2', qtyDefault: 1 });
    expect(it1.name).toBe('Potion of Healing');
    expect(listLibraryItems('potion').some((i) => i.id === it1.id)).toBe(true);
    deleteLibraryItem(it1.id);
    expect(listLibraryItems('potion').some((i) => i.id === it1.id)).toBe(false);
  });
});
