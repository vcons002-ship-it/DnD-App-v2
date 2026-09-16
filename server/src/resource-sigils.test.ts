import { describe, expect, it } from 'vitest';
import { prioritizeResourceRows, resourceSigilPresentation } from '../../shared/resourceSigils.js';

describe('resource sigil presentation', () => {
  it('shows all nine Roman spell levels without renaming stored keys', () => {
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
    numerals.forEach((numeral, i) => {
      expect(resourceSigilPresentation('spellSlots', `L${i + 1}`)).toEqual({
        kind: 'spell', name: `Level ${i + 1}`, caption: '', numeral,
      });
    });
  });
  it('recognizes class resource art without changing original names', () => {
    expect(resourceSigilPresentation('resources', 'Sorcery Points')).toMatchObject({ kind: 'sorcery', name: 'Sorcery Points' });
    expect(resourceSigilPresentation('resources', 'Superiority Dice')).toMatchObject({ kind: 'superiority' });
    expect(resourceSigilPresentation('resources', 'Second Wind')).toMatchObject({ kind: 'wind' });
    expect(resourceSigilPresentation('resources', ' action SURGE ')).toMatchObject({ kind: 'surge', name: ' action SURGE ' });
    expect(resourceSigilPresentation('resources', 'Focus Points')).toMatchObject({ kind: 'focus' });
  });
  it('keeps custom counters and unusual slot keys literal and distinct', () => {
    expect(resourceSigilPresentation('resources', 'Rune charges')).toEqual({ kind: 'custom', name: 'Rune charges', caption: 'Rune charges', initial: 'R' });
    expect(resourceSigilPresentation('resources', 'L1')).toMatchObject({ kind: 'custom', name: 'L1' });
    expect(resourceSigilPresentation('spellSlots', 'Pact Magic')).toMatchObject({ kind: 'custom', name: 'Pact Magic' });
    expect(resourceSigilPresentation('spellSlots', 'L10')).toMatchObject({ kind: 'custom', name: 'L10' });
    expect(resourceSigilPresentation('resources', '')).toMatchObject({ kind: 'custom', initial: '◇' });
    expect(resourceSigilPresentation('resources', '__proto__')).toMatchObject({ kind: 'custom', name: '__proto__' });
    expect(resourceSigilPresentation('resources', 'constructor')).toMatchObject({ kind: 'custom', name: 'constructor' });
  });
});

describe('resource display priority', () => {
  const row = (group: 'spellSlots' | 'resources', name: string) => ({ group, name, counter: { max: 3, used: 1 } });

  it('orders slots numerically then class pools then custom trackers, regardless of insertion order', () => {
    const rows = [row('resources', 'Cloak Spell Slot'), row('spellSlots', 'L3'), row('resources', "AZUTH'S Knowledge"),
      row('resources', 'Sorcery Points'), row('spellSlots', 'L1'), row('resources', 'Action Surge'), row('spellSlots', 'L2')];
    const before = structuredClone(rows);
    const ordered = prioritizeResourceRows(rows);
    expect(ordered.map(({ name }) => name)).toEqual(['L1', 'L2', 'L3', 'Sorcery Points', 'Action Surge', 'Cloak Spell Slot', "AZUTH'S Knowledge"]);
    expect(rows).toEqual(before);
    expect(ordered).not.toBe(rows);
    for (const item of ordered) expect(rows).toContain(item);
  });

  it('fills ten positions with custom trackers and pushes only the final custom rows out as core rows arrive', () => {
    const custom = Array.from({ length: 10 }, (_, i) => row('resources', `Custom ${i + 1}`));
    expect(prioritizeResourceRows(custom)).toEqual(custom);
    const withCore = prioritizeResourceRows([...custom, row('resources', 'Second Wind'), row('spellSlots', 'L1')]);
    expect(withCore.slice(0, 10).map(({ name }) => name)).toEqual(['L1', 'Second Wind', ...custom.slice(0, 8).map(({ name }) => name)]);
    expect(withCore.slice(10).map(({ name }) => name)).toEqual(['Custom 9', 'Custom 10']);
    const restored = prioritizeResourceRows(withCore.filter(({ name }) => name !== 'L1' && name !== 'Second Wind'));
    expect(restored).toEqual(custom);
  });

  it('prioritizes unusual spell-slot keys without treating a custom resource named L1 as a slot', () => {
    const rows = [row('resources', 'L1'), row('resources', 'Focus Points'), row('spellSlots', 'Pact Magic'),
      row('spellSlots', 'L10'), row('spellSlots', 'L2')];
    expect(prioritizeResourceRows(rows).map(({ group, name }) => `${group}:${name}`)).toEqual([
      'spellSlots:L2', 'spellSlots:L10', 'spellSlots:Pact Magic', 'resources:Focus Points', 'resources:L1',
    ]);
  });
});
