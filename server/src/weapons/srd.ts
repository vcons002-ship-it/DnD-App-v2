/**
 * Canonical 2024 D&D weapons (Player's Handbook). Each entry carries its dice,
 * damage type, properties, mastery property, and range so the weapon editor can
 * fill a sheet weapon from the book. The `damage`/`versatileDamage` here are the
 * DICE ONLY — the editor bakes in the wielder's ability modifier when picked.
 *
 * `weaponTags()` derives the sheet tags: the weapon's type name plus its
 * properties (e.g. ["longbow","heavy","two-handed","ammunition"]), which drive
 * finesse/versatile mechanics and weapon‑mastery triggering.
 */
export type WeaponData = {
  name: string;
  category: 'simple' | 'martial';
  kind: 'melee' | 'ranged';
  /** Damage dice only, e.g. "1d8" (no ability modifier). */
  damage: string;
  damageType: 'slashing' | 'piercing' | 'bludgeoning';
  /** Two‑handed dice for versatile weapons, e.g. "1d10". */
  versatileDamage?: string;
  /** Range/reach text where relevant (ranged, thrown, or reach). */
  range?: string;
  /** Lowercase property tags (finesse, light, heavy, two-handed, versatile, …). */
  properties: string[];
  /** The 2024 mastery property this weapon grants. */
  mastery: string;
};

const WEAPONS: WeaponData[] = [
  // ---- Simple Melee ----
  { name: 'Club', category: 'simple', kind: 'melee', damage: '1d4', damageType: 'bludgeoning', properties: ['light'], mastery: 'Slow' },
  { name: 'Dagger', category: 'simple', kind: 'melee', damage: '1d4', damageType: 'piercing', range: 'thrown 20/60 ft', properties: ['finesse', 'light', 'thrown'], mastery: 'Nick' },
  { name: 'Greatclub', category: 'simple', kind: 'melee', damage: '1d8', damageType: 'bludgeoning', properties: ['two-handed'], mastery: 'Push' },
  { name: 'Handaxe', category: 'simple', kind: 'melee', damage: '1d6', damageType: 'slashing', range: 'thrown 20/60 ft', properties: ['light', 'thrown'], mastery: 'Vex' },
  { name: 'Javelin', category: 'simple', kind: 'melee', damage: '1d6', damageType: 'piercing', range: 'thrown 30/120 ft', properties: ['thrown'], mastery: 'Slow' },
  { name: 'Light Hammer', category: 'simple', kind: 'melee', damage: '1d4', damageType: 'bludgeoning', range: 'thrown 20/60 ft', properties: ['light', 'thrown'], mastery: 'Nick' },
  { name: 'Mace', category: 'simple', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', properties: [], mastery: 'Sap' },
  { name: 'Quarterstaff', category: 'simple', kind: 'melee', damage: '1d6', damageType: 'bludgeoning', versatileDamage: '1d8', properties: ['versatile'], mastery: 'Topple' },
  { name: 'Sickle', category: 'simple', kind: 'melee', damage: '1d4', damageType: 'slashing', properties: ['light'], mastery: 'Nick' },
  { name: 'Spear', category: 'simple', kind: 'melee', damage: '1d6', damageType: 'piercing', versatileDamage: '1d8', range: 'thrown 20/60 ft', properties: ['thrown', 'versatile'], mastery: 'Sap' },
  // ---- Simple Ranged ----
  { name: 'Dart', category: 'simple', kind: 'ranged', damage: '1d4', damageType: 'piercing', range: 'thrown 20/60 ft', properties: ['finesse', 'thrown'], mastery: 'Vex' },
  { name: 'Light Crossbow', category: 'simple', kind: 'ranged', damage: '1d8', damageType: 'piercing', range: '80/320 ft', properties: ['ammunition', 'loading', 'two-handed'], mastery: 'Slow' },
  { name: 'Shortbow', category: 'simple', kind: 'ranged', damage: '1d6', damageType: 'piercing', range: '80/320 ft', properties: ['ammunition', 'two-handed'], mastery: 'Vex' },
  { name: 'Sling', category: 'simple', kind: 'ranged', damage: '1d4', damageType: 'bludgeoning', range: '30/120 ft', properties: ['ammunition'], mastery: 'Slow' },
  // ---- Martial Melee ----
  { name: 'Battleaxe', category: 'martial', kind: 'melee', damage: '1d8', damageType: 'slashing', versatileDamage: '1d10', properties: ['versatile'], mastery: 'Topple' },
  { name: 'Flail', category: 'martial', kind: 'melee', damage: '1d8', damageType: 'bludgeoning', properties: [], mastery: 'Sap' },
  { name: 'Glaive', category: 'martial', kind: 'melee', damage: '1d10', damageType: 'slashing', range: 'reach 10 ft', properties: ['heavy', 'reach', 'two-handed'], mastery: 'Graze' },
  { name: 'Greataxe', category: 'martial', kind: 'melee', damage: '1d12', damageType: 'slashing', properties: ['heavy', 'two-handed'], mastery: 'Cleave' },
  { name: 'Greatsword', category: 'martial', kind: 'melee', damage: '2d6', damageType: 'slashing', properties: ['heavy', 'two-handed'], mastery: 'Graze' },
  { name: 'Halberd', category: 'martial', kind: 'melee', damage: '1d10', damageType: 'slashing', range: 'reach 10 ft', properties: ['heavy', 'reach', 'two-handed'], mastery: 'Cleave' },
  { name: 'Lance', category: 'martial', kind: 'melee', damage: '1d10', damageType: 'piercing', range: 'reach 10 ft', properties: ['heavy', 'reach', 'two-handed'], mastery: 'Topple' },
  { name: 'Longsword', category: 'martial', kind: 'melee', damage: '1d8', damageType: 'slashing', versatileDamage: '1d10', properties: ['versatile'], mastery: 'Sap' },
  { name: 'Maul', category: 'martial', kind: 'melee', damage: '2d6', damageType: 'bludgeoning', properties: ['heavy', 'two-handed'], mastery: 'Topple' },
  { name: 'Morningstar', category: 'martial', kind: 'melee', damage: '1d8', damageType: 'piercing', properties: [], mastery: 'Sap' },
  { name: 'Pike', category: 'martial', kind: 'melee', damage: '1d10', damageType: 'piercing', range: 'reach 10 ft', properties: ['heavy', 'reach', 'two-handed'], mastery: 'Push' },
  { name: 'Rapier', category: 'martial', kind: 'melee', damage: '1d8', damageType: 'piercing', properties: ['finesse'], mastery: 'Vex' },
  { name: 'Scimitar', category: 'martial', kind: 'melee', damage: '1d6', damageType: 'slashing', properties: ['finesse', 'light'], mastery: 'Nick' },
  { name: 'Shortsword', category: 'martial', kind: 'melee', damage: '1d6', damageType: 'piercing', properties: ['finesse', 'light'], mastery: 'Vex' },
  { name: 'Trident', category: 'martial', kind: 'melee', damage: '1d8', damageType: 'piercing', versatileDamage: '1d10', range: 'thrown 20/60 ft', properties: ['thrown', 'versatile'], mastery: 'Topple' },
  { name: 'Warhammer', category: 'martial', kind: 'melee', damage: '1d8', damageType: 'bludgeoning', versatileDamage: '1d10', properties: ['versatile'], mastery: 'Push' },
  { name: 'War Pick', category: 'martial', kind: 'melee', damage: '1d8', damageType: 'piercing', versatileDamage: '1d10', properties: ['versatile'], mastery: 'Sap' },
  { name: 'Whip', category: 'martial', kind: 'melee', damage: '1d4', damageType: 'slashing', range: 'reach 10 ft', properties: ['finesse', 'reach'], mastery: 'Slow' },
  // ---- Martial Ranged ----
  { name: 'Blowgun', category: 'martial', kind: 'ranged', damage: '1', damageType: 'piercing', range: '25/100 ft', properties: ['ammunition', 'loading'], mastery: 'Vex' },
  { name: 'Hand Crossbow', category: 'martial', kind: 'ranged', damage: '1d6', damageType: 'piercing', range: '30/120 ft', properties: ['ammunition', 'light', 'loading'], mastery: 'Vex' },
  { name: 'Heavy Crossbow', category: 'martial', kind: 'ranged', damage: '1d10', damageType: 'piercing', range: '100/400 ft', properties: ['ammunition', 'heavy', 'loading', 'two-handed'], mastery: 'Push' },
  { name: 'Longbow', category: 'martial', kind: 'ranged', damage: '1d8', damageType: 'piercing', range: '150/600 ft', properties: ['ammunition', 'heavy', 'two-handed'], mastery: 'Slow' },
  { name: 'Musket', category: 'martial', kind: 'ranged', damage: '1d12', damageType: 'piercing', range: '40/120 ft', properties: ['ammunition', 'loading', 'two-handed'], mastery: 'Slow' },
  { name: 'Pistol', category: 'martial', kind: 'ranged', damage: '1d10', damageType: 'piercing', range: '30/90 ft', properties: ['ammunition', 'loading'], mastery: 'Vex' },
];

/** The sheet tags for a weapon: its type name + its properties (deduped). */
export function weaponTags(w: WeaponData): string[] {
  return [...new Set([w.name.toLowerCase(), ...w.properties])];
}

/** Search the weapon list by name (prefix‑first), then by property/mastery. */
export function searchWeapons(query: string, limit = 12): WeaponData[] {
  const q = query.trim().toLowerCase();
  if (!q) return WEAPONS.slice(0, limit);
  const matches = WEAPONS.filter(
    (w) =>
      w.name.toLowerCase().includes(q) ||
      w.mastery.toLowerCase().includes(q) ||
      w.properties.some((p) => p.includes(q)),
  );
  matches.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
  return matches.slice(0, limit);
}

/** Exact (case‑insensitive) lookup by weapon name. */
export function getWeapon(name: string): WeaponData | null {
  const q = name.trim().toLowerCase();
  return WEAPONS.find((w) => w.name.toLowerCase() === q) ?? null;
}
