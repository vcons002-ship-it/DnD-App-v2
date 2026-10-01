import type { Character } from './types.js';

export type SpellSlotPool = 'spellcasting' | 'pact';
type Caster = Pick<Character, 'className' | 'spellSlots'> & Partial<Pick<Character, 'leveling'>>;

/** Legacy single-class Warlock slots use L keys. Explicit multiclass Pact pools
 * use P keys so a Short Rest never replenishes ordinary Spellcasting slots. */
export function isLegacyPactPool(c: Caster): boolean {
  return c.className.trim().toLowerCase() === 'warlock' &&
    !c.leveling?.classes?.some(entry => entry.className !== 'warlock') &&
    !Object.keys(c.spellSlots).some(key => /^P[1-5]$/.test(key));
}

export function spellSlotOptions(c: Caster, minimumLevel = 1) {
  const legacy = isLegacyPactPool(c);
  return Object.entries(c.spellSlots).flatMap(([key, slot]) => {
    const match = /^([LP])([1-9])$/.exec(key);
    if (!match || Number(match[2]) < minimumLevel || slot.max < 1) return [];
    const level = Number(match[2]);
    const pool: SpellSlotPool = match[1] === 'P' || legacy ? 'pact' : 'spellcasting';
    return [{ key, level, pool, remaining: Math.max(0, slot.max - slot.used),
      label: `${pool === 'pact' ? 'Pact ' : ''}L${level}` }];
  }).sort((a, b) => a.level - b.level || a.pool.localeCompare(b.pool));
}

/** Select before rolling so Pact upcasting and resource spending agree. */
export function selectSpellSlot(c: Caster, requestedLevel: number, pool?: SpellSlotPool) {
  const options = spellSlotOptions(c, requestedLevel).filter(option =>
    option.pool === 'pact' || option.level === requestedLevel);
  const allowed = pool ? options.filter(option => option.pool === pool) : options;
  const ordinary = allowed.find(option => option.pool === 'spellcasting' && option.remaining > 0);
  return ordinary ?? allowed.find(option => option.remaining > 0) ??
    allowed.find(option => option.pool === 'spellcasting') ?? allowed[0];
}
