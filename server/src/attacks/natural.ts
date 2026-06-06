/**
 * Common creature NATURAL attacks (Bite, Claw, Slam…). These are the
 * monster-side counterpart to the 2024 weapon book (`weapons/srd.ts`): a small
 * library the creature attack editor can pick from. Like the weapon book, the
 * `damage` here is DICE ONLY — the editor bakes in the creature's ability
 * modifier (and a CR-derived to-hit) when picked (`bakeMonsterAttack`).
 *
 * Shaped to overlap `WeaponData` so the client picker can list weapons and
 * natural attacks together uniformly; `natural: true` marks the source.
 */
export type NaturalAttackData = {
  name: string;
  kind: 'melee' | 'ranged';
  /** Damage dice only, e.g. "1d6" (no ability modifier). */
  damage: string;
  damageType: string;
  /** Reach/range text where relevant. */
  range?: string;
  /** Kept for shape-parity with WeaponData (natural attacks have no props). */
  properties: string[];
  natural: true;
};

const NATURAL: NaturalAttackData[] = [
  { name: 'Bite', kind: 'melee', damage: '1d6', damageType: 'piercing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Claw', kind: 'melee', damage: '1d4', damageType: 'slashing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Claws', kind: 'melee', damage: '2d4', damageType: 'slashing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Slam', kind: 'melee', damage: '1d8', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Gore', kind: 'melee', damage: '1d8', damageType: 'piercing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Tail', kind: 'melee', damage: '1d8', damageType: 'bludgeoning', range: 'reach 10 ft', properties: [], natural: true },
  { name: 'Sting', kind: 'melee', damage: '1d6', damageType: 'piercing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Tentacle', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', range: 'reach 10 ft', properties: [], natural: true },
  { name: 'Talon', kind: 'melee', damage: '1d6', damageType: 'slashing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Beak', kind: 'melee', damage: '1d8', damageType: 'piercing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Hooves', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Horns', kind: 'melee', damage: '1d8', damageType: 'piercing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Pincer', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', range: 'reach 10 ft', properties: [], natural: true },
  { name: 'Constrict', kind: 'melee', damage: '1d8', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Unarmed Strike', kind: 'melee', damage: '1', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Ram', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
];

/** Search natural attacks by name (prefix-first), then damage type. */
export function searchNaturalAttacks(query: string, limit = 12): NaturalAttackData[] {
  const q = query.trim().toLowerCase();
  if (!q) return NATURAL.slice(0, limit);
  const matches = NATURAL.filter(
    (a) => a.name.toLowerCase().includes(q) || a.damageType.includes(q),
  );
  matches.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
}
