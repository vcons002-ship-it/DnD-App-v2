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
