import { describe, it, expect } from 'vitest';
import { parseConsumable } from '../../shared/consumables.js';
import { useConsumable } from './combat.js';
import {
  createSession,
  createCharacter,
  setItem,
  getCharacter,
  listRollLog,
  applyDamage,
  updateCharacter,
} from './sessions.js';
import { SRD_ITEMS } from './items/srd.js';

const item = (name: string, note = '', extra: Record<string, unknown> = {}) => ({
  id: 'it1',
  name,
  qty: 1,
  note,
  ...extra,
});

describe('parseConsumable', () => {
  it('reads the dice out of a potion description', () => {
    expect(parseConsumable(item('Potion of Healing', 'Drinking it (a bonus action) restores 2d4 + 2 hit points')))
      .toEqual({ kind: 'heal', dice: '2d4+2' });
    expect(parseConsumable(item('Potion of Supreme Healing', 'Restores 10d4 + 20 hit points.')))
      .toEqual({ kind: 'heal', dice: '10d4+20' });
  });

  it('reads temporary hit points as temp HP, not healing', () => {
    expect(
      parseConsumable(item('Potion of Heroism', 'For 1 hour you gain 10 temporary hit points and the benefit of bless.')),
    ).toEqual({ kind: 'tempHp', dice: '10' });
  });

  it('falls back to the standard-potion name table with no description', () => {
    expect(parseConsumable(item('Potion of Greater Healing'))).toEqual({ kind: 'heal', dice: '4d4+4' });
    expect(parseConsumable(item('Potion of Superior Healing'))).toEqual({ kind: 'heal', dice: '8d4+8' });
  });

  it('an explicit `use` wins over the description', () => {
    const e = parseConsumable(item('Weird Draught', 'Restores 1d4 hit points', { use: { kind: 'heal', dice: '3d6' } }));
    expect(e).toEqual({ kind: 'heal', dice: '3d6' });
  });

  it('is not fooled by objects that merely HAVE hit points', () => {
    // A healing verb must sit right before the amount, and "hit points" right
    // after — otherwise a rope would read as a potion.
    expect(parseConsumable(item('Rope, Hempen (50 ft)', 'Has 2 hit points and can be burst with a DC 17 Strength check.'))).toBeNull();
    expect(parseConsumable(item('Rope of Climbing', 'It has 20 hit points and regains 1 per 5 minutes.'))).toBeNull();
    expect(parseConsumable(item('Potion of Climbing', 'For 1 hour you have a climbing speed equal to your walking speed.'))).toBeNull();
    expect(parseConsumable(item('Longsword', 'A versatile blade.'))).toBeNull();
  });

  it('every seeded healing potion in the item library is usable', () => {
    const healing = SRD_ITEMS.filter((i) => /potion of (greater |superior |supreme )?healing/i.test(i.name));
    expect(healing.length).toBeGreaterThanOrEqual(4);
    for (const i of healing) {
      const e = parseConsumable({ name: i.name, note: i.description });
      expect(e, i.name).not.toBeNull();
      expect(e!.kind).toBe('heal');
    }
  });
});

describe('useConsumable', () => {
  const drinker = (note: string, qty = 2) => {
    const s = createSession('Potions');
    const ch = createCharacter(s.id, { name: 'Quaffer', maxHp: 30 });
    updateCharacter(ch.id, { curHp: 5 });
    setItem(ch.id, { id: 'p1', name: 'Potion of Healing', qty, note });
    return { sid: s.id, chId: ch.id };
  };

  it('rolls, heals, logs, and spends one from the stack', () => {
    const { sid, chId } = drinker('Restores 2d4 + 2 hit points.');
    expect(useConsumable(sid, 'Quaffer', chId, 'p1')).toBe(true);
    const c = getCharacter(chId)!;
    expect(c.curHp).toBeGreaterThan(5);
    expect(c.curHp).toBeLessThanOrEqual(15); // 5 + max(2d4+2)
    expect(c.items.find((i) => i.id === 'p1')!.qty).toBe(1);
    const log = listRollLog(sid).at(-1)!;
    expect(log.label).toBe('Potion of Healing');
    expect(log.detail).toMatch(/regains \d+ HP/);
    expect(log.reveal?.kind).toBe('dice'); // it animates like any other roll
    expect(log.hpNote?.refId).toBe(chId);
  });

  it('removes the item when the last one is drunk', () => {
    const { sid, chId } = drinker('Restores 2d4 + 2 hit points.', 1);
    expect(useConsumable(sid, 'Quaffer', chId, 'p1')).toBe(true);
    expect(getCharacter(chId)!.items).toHaveLength(0);
    expect(useConsumable(sid, 'Quaffer', chId, 'p1')).toBe(false);
  });

  it('grants temp HP without stacking (5e: the bigger pool wins)', () => {
    const s = createSession('Heroism');
    const ch = createCharacter(s.id, { name: 'Brave', maxHp: 20 });
    setItem(ch.id, {
      id: 'h1',
      name: 'Potion of Heroism',
      qty: 2,
      note: 'For 1 hour you gain 10 temporary hit points.',
    });
    expect(useConsumable(s.id, 'Brave', ch.id, 'h1')).toBe(true);
    expect(getCharacter(ch.id)!.tempHp).toBe(10);
    applyDamage('pc', ch.id, 4); // eats temp HP first → 6 left
    expect(getCharacter(ch.id)!.tempHp).toBe(6);
    expect(useConsumable(s.id, 'Brave', ch.id, 'h1')).toBe(true);
    expect(getCharacter(ch.id)!.tempHp).toBe(10); // replaced, not 16
  });

  it('refuses an item that does nothing when used', () => {
    const s = createSession('Rope');
    const ch = createCharacter(s.id, { name: 'Climber' });
    setItem(ch.id, { id: 'r1', name: 'Rope, Hempen (50 ft)', qty: 1, note: 'Has 2 hit points.' });
    expect(useConsumable(s.id, 'Climber', ch.id, 'r1')).toBe(false);
    expect(getCharacter(ch.id)!.items).toHaveLength(1);
    expect(listRollLog(s.id)).toHaveLength(0);
  });
});
