import { describe, it, expect } from 'vitest';
import { featSlots, featUsage, isFeatAbility } from '../../shared/feats.js';
import type { SheetAbility, SheetModifier } from '../../shared/types.js';

const feat = (name: string): SheetAbility => ({
  id: name,
  name,
  type: 'ability',
  school: 'Feat',
  description: '',
});
const spell = (name: string): SheetAbility => ({
  id: name,
  name,
  type: 'spell',
  level: 1,
  description: '',
});
const asi = (source: string): SheetModifier => ({
  id: `${source}-1`,
  source,
  target: { kind: 'ability', ability: 'STR' },
  value: 2,
  slot: true,
});

describe('feat/ASI cap', () => {
  it('featSlots: ASI levels every class, plus Fighter (6/14) and Rogue (10)', () => {
    expect(featSlots('Wizard', 1)).toBe(0);
    expect(featSlots('Wizard', 4)).toBe(1);
    expect(featSlots('Wizard', 8)).toBe(2);
    expect(featSlots('Wizard', 19)).toBe(5);
    expect(featSlots('Fighter', 6)).toBe(2); // ASI@4 + Fighter@6
    expect(featSlots('Fighter', 14)).toBe(5); // 4,8,12 + 6,14
    expect(featSlots('Rogue', 10)).toBe(3); // 4,8 + 10
  });

  it('featUsage counts feat-tagged abilities + distinct slot-modifier sources', () => {
    const c = {
      className: 'Fighter',
      level: 6, // cap 2
      sheetAbilities: [feat('Great Weapon Master'), spell('Shield')],
      modifiers: [asi('ASI (level 4)'), asi('ASI (level 4)')], // +1/+1 share a source
    };
    const u = featUsage(c);
    expect(u.feats).toBe(1); // only the feat, not the spell
    expect(u.asis).toBe(1); // one distinct source
    expect(u.used).toBe(2);
    expect(u.cap).toBe(2);
  });

  it('isFeatAbility recognizes the school OR a feat tag', () => {
    expect(isFeatAbility({ school: 'Feat' })).toBe(true);
    expect(isFeatAbility({ tags: ['feat', 'fire'] })).toBe(true);
    expect(isFeatAbility({ school: 'Evocation', tags: ['fire'] })).toBe(false);
  });
});
