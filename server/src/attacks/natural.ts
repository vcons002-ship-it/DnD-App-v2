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
  // Bigger bodies (large+ creatures' versions of the basics).
  { name: 'Bite (large)', kind: 'melee', damage: '2d6', damageType: 'piercing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Bite (huge)', kind: 'melee', damage: '2d10', damageType: 'piercing', range: 'reach 10 ft', properties: [], natural: true },
  { name: 'Claw (large)', kind: 'melee', damage: '2d6', damageType: 'slashing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Slam (large)', kind: 'melee', damage: '2d8', damageType: 'bludgeoning', range: 'reach 10 ft', properties: [], natural: true },
  { name: 'Tail (huge)', kind: 'melee', damage: '2d8', damageType: 'bludgeoning', range: 'reach 15 ft', properties: [], natural: true },
  // More body parts & monster staples.
  { name: 'Fist', kind: 'melee', damage: '1d8', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Stomp', kind: 'melee', damage: '2d8', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Trample', kind: 'melee', damage: '2d10', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Wing', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', range: 'reach 10 ft', properties: [], natural: true },
  { name: 'Trunk', kind: 'melee', damage: '1d8', damageType: 'bludgeoning', range: 'reach 10 ft', properties: [], natural: true },
  { name: 'Tusk', kind: 'melee', damage: '1d10', damageType: 'slashing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Antler', kind: 'melee', damage: '1d6', damageType: 'piercing', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Tail Spike', kind: 'melee', damage: '1d10', damageType: 'piercing', range: 'reach 10 ft', properties: [], natural: true },
  { name: 'Tongue', kind: 'melee', damage: '1d4', damageType: 'bludgeoning', range: 'reach 15 ft', properties: [], natural: true },
  { name: 'Pseudopod', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Crush', kind: 'melee', damage: '2d6', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Headbutt', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', range: 'reach 5 ft', properties: [], natural: true },
  // Touch / drain attacks for undead & spirits (typed for resist/vuln math).
  { name: 'Chilling Touch', kind: 'melee', damage: '1d8', damageType: 'cold', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Life Drain', kind: 'melee', damage: '1d6', damageType: 'necrotic', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Corrosive Touch', kind: 'melee', damage: '1d8', damageType: 'acid', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Fiery Touch', kind: 'melee', damage: '1d8', damageType: 'fire', range: 'reach 5 ft', properties: [], natural: true },
  { name: 'Shocking Touch', kind: 'melee', damage: '1d8', damageType: 'lightning', range: 'reach 5 ft', properties: [], natural: true },
  // Ranged natural attacks.
  { name: 'Spit', kind: 'ranged', damage: '1d6', damageType: 'acid', range: 'range 30/60 ft', properties: [], natural: true },
  { name: 'Quill', kind: 'ranged', damage: '1d4', damageType: 'piercing', range: 'range 30/60 ft', properties: [], natural: true },
  { name: 'Rock', kind: 'ranged', damage: '3d10', damageType: 'bludgeoning', range: 'range 60/240 ft', properties: [], natural: true },
  { name: 'Web', kind: 'ranged', damage: '1d4', damageType: 'bludgeoning', range: 'range 30/60 ft', properties: [], natural: true },
];

/** Search natural attacks by name (prefix-first), then damage type. */
export function searchNaturalAttacks(query: string, limit = 16): NaturalAttackData[] {
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
