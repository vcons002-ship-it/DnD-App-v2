// Character-sheet import/export, framework-free so it's reusable + testable.
// Two import paths: a robust best-effort PLAIN-TEXT scraper (any sheet), and a
// lossless JSON round-trip with our own export.
import type {
  Character,
  CharacterUpdatePayload,
  CreatureAbility,
  InventoryItem,
  Weapon,
} from './types.js';
import { SKILLS } from './skills.js';

/** Everything an import may set (a character:update without the id). */
export type SheetPatch = Omit<CharacterUpdatePayload, 'characterId'>;

const RACES = [
  'dragonborn', 'half-elf', 'half-orc', 'halfling', 'human', 'elf', 'dwarf',
  'gnome', 'tiefling', 'orc', 'drow', 'aasimar', 'goliath', 'tabaxi', 'firbolg',
  'kenku', 'warforged', 'genasi', 'tortle', 'bugbear', 'lizardfolk',
];
const CLASSES = [
  'artificer', 'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
];
// Distinctive subclass names safe to scrape from free text (multi-word or
// unambiguous — generic words like "hunter" would false-positive).
const SUBCLASSES = [
  'eldritch knight', 'battle master', 'arcane trickster', 'divine soul',
  'draconic bloodline', 'wild magic', 'circle of the moon', 'circle of the land',
  'college of lore', 'college of valor', 'life domain', 'light domain',
  'war domain', 'tempest domain', 'trickery domain', 'knowledge domain',
  'nature domain', 'grave domain', 'forge domain', 'twilight domain',
  'oath of devotion', 'oath of vengeance', 'oath of the ancients',
  'way of the open hand', 'way of shadow', 'way of the four elements',
  'beast master', 'gloom stalker', 'horizon walker', 'monster slayer',
  'hexblade', 'the fiend', 'the archfey', 'the great old one',
  'school of evocation', 'school of abjuration', 'school of divination',
  'school of necromancy', 'school of illusion', 'school of conjuration',
  'school of enchantment', 'school of transmutation',
  'champion', 'assassin', 'swashbuckler', 'samurai', 'cavalier',
  'berserker', 'totem warrior', 'zealot', 'ancestral guardian',
];
const ABILITY_LABELS: Record<string, string> = {
  STR: 'str|strength',
  DEX: 'dex|dexterity',
  CON: 'con|constitution',
  INT: 'int|intelligence',
  WIS: 'wis|wisdom',
  CHA: 'cha|charisma',
};

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const num1 = (text: string, re: RegExp): number | undefined => {
  const m = text.match(re);
  return m ? Number(m[1]) : undefined;
};

/** Best-effort scrape of common label+number patterns from any text sheet. */
export function parseSheetText(text: string): SheetPatch {
  const t = text.replace(/\r/g, '');
  const patch: SheetPatch = {};

  // Name only when explicitly labelled (avoid clobbering with junk).
  const nameM = t.match(/\bname\b\s*[:\-]\s*([A-Za-z][\w '\-]{1,30})/i);
  if (nameM) patch.name = nameM[1].trim();

  const race = RACES.find((r) => new RegExp(`\\b${r}\\b`, 'i').test(t));
  if (race) patch.race = title(race);

  const cls = CLASSES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(t));
  if (cls) patch.className = title(cls);

  // Subclass: an explicit "Subclass:"/"Archetype:" label wins; otherwise scan
  // for a distinctive known name.
  const subM = t.match(/\b(?:subclass|archetype)\b\s*[:\-]\s*([A-Za-z][\w '\-]{1,40})/i);
  const sub =
    subM?.[1].trim() ??
    SUBCLASSES.find((s) => new RegExp(`\\b${s}\\b`, 'i').test(t));
  if (sub) patch.subclass = title(sub);

  // Level: "level N" / "lvl N" / "Nth-level" / "ClassName N".
  let level =
    num1(t, /\b(?:level|lvl)\b\D{0,8}(\d{1,2})/i) ??
    num1(t, /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*level\b/i);
  if (level === undefined && cls) {
    level = num1(t, new RegExp(`\\b${cls}\\b[\\s:]{0,4}(\\d{1,2})`, 'i'));
  }
  if (level !== undefined && level >= 1 && level <= 20) patch.level = level;

  // HP: "HP 25", "Hit Points 25/30", "Max HP 30" (take max; current = lower).
  const hpM = t.match(
    /(?:max(?:imum)?\s*hp|maximum\s*hit\s*points|hit\s*points|hp)\b\D{0,10}(\d+)\s*(?:\/\s*(\d+))?/i,
  );
  if (hpM) {
    const a = Number(hpM[1]);
    const b = hpM[2] !== undefined ? Number(hpM[2]) : undefined;
    if (b !== undefined) {
      patch.maxHp = Math.max(a, b);
      patch.curHp = Math.min(a, b);
    } else {
      patch.maxHp = a;
    }
  }

  const ac = num1(t, /(?:armou?r\s*class|\bac\b)\D{0,8}(\d+)/i);
  if (ac) patch.armorClass = ac;
  const sp = num1(t, /(?:\bspeed\b|\bwalking\b)\D{0,8}(\d+)\s*(?:ft|feet)?/i);
  if (sp) patch.speed = `${sp} ft.`;

  const stats: Record<string, number> = {};
  for (const [ab, labels] of Object.entries(ABILITY_LABELS)) {
    const m = t.match(new RegExp(`\\b(?:${labels})\\b\\D{0,8}(\\d{1,2})\\b`, 'i'));
    if (m) stats[ab] = Number(m[1]);
  }
  if (Object.keys(stats).length) patch.stats = stats;

  // Skill proficiencies — only when a marker is present (● • ✓ ✔ ★, "(P)", or
  // the word "prof"/"proficient" near the skill). No markers => none imported.
  const prof: string[] = [];
  for (const s of SKILLS) {
    const name = s.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(
      `(?:[●•◉✓✔★]\\s*${name})|(?:${name}\\s*\\(P\\))|(?:${name}[^\\n]{0,14}\\bprofic)`,
      'i',
    );
    if (re.test(t)) prof.push(s.name);
  }
  if (prof.length) patch.proficientSkills = prof;

  // Spell slots: "1st-level slots: 4" / "Spell Slots Level 2: 3".
  const slots: Record<string, { max: number; used: number }> = {};
  let m: RegExpExecArray | null;
  const re1 = /\b([1-9])(?:st|nd|rd|th)?[\s-]*(?:level)?\b[^\d\n]{0,16}?spell\s*slots?\D{0,6}(\d+)/gi;
  while ((m = re1.exec(t))) slots[`L${m[1]}`] = { max: Number(m[2]), used: 0 };
  const re2 = /spell\s*slots?[^\n]{0,40}?\b(?:level|lvl)\s*([1-9])\b\D{0,6}(\d+)/gi;
  while ((m = re2.exec(t))) slots[`L${m[1]}`] = { max: Number(m[2]), used: 0 };
  if (Object.keys(slots).length) patch.spellSlots = slots;

  return patch;
}

/** Pretty JSON of every editable sheet field (for the Export button). */
export function exportSheetJSON(c: Character): string {
  return JSON.stringify(
    {
      name: c.name,
      race: c.race,
      className: c.className,
      subclass: c.subclass,
      level: c.level,
      maxHp: c.maxHp,
      curHp: c.curHp,
      armorClass: c.armorClass,
      speed: c.speed,
      stats: c.stats,
      resistances: c.resistances,
      weaknesses: c.weaknesses,
      weapons: c.weapons,
      actions: c.actions,
      abilities: c.abilities,
      proficientSkills: c.proficientSkills,
      spellSlots: c.spellSlots,
      resources: c.resources,
      items: c.items,
    },
    null,
    2,
  );
}

/** Parse our JSON export (or a loosely-shaped object) into a validated patch. */
export function parseSheetJSON(text: string): SheetPatch | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const patch: SheetPatch = {};
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
  const int = (k: string) =>
    Number.isFinite(Number(o[k])) ? Number(o[k]) : undefined;
  const strArr = (k: string) =>
    Array.isArray(o[k]) ? (o[k] as unknown[]).map(String) : undefined;

  if (str('name') !== undefined) patch.name = str('name');
  if (str('race') !== undefined) patch.race = str('race');
  if (str('className') !== undefined) patch.className = str('className');
  if (str('subclass') !== undefined) patch.subclass = str('subclass');
  if (str('speed') !== undefined) patch.speed = str('speed');
  if (int('level') !== undefined) patch.level = int('level');
  if (int('maxHp') !== undefined) patch.maxHp = int('maxHp');
  if (int('curHp') !== undefined) patch.curHp = int('curHp');
  if (int('armorClass') !== undefined) patch.armorClass = int('armorClass');
  if (strArr('resistances')) patch.resistances = strArr('resistances');
  if (strArr('weaknesses')) patch.weaknesses = strArr('weaknesses');
  if (strArr('proficientSkills')) patch.proficientSkills = strArr('proficientSkills');

  if (o.stats && typeof o.stats === 'object') {
    const stats: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.stats as object)) {
      if (Number.isFinite(Number(v))) stats[k.toUpperCase()] = Number(v);
    }
    patch.stats = stats;
  }
  if (Array.isArray(o.weapons)) patch.weapons = o.weapons as Weapon[];
  if (Array.isArray(o.actions)) patch.actions = o.actions as CreatureAbility[];
  if (Array.isArray(o.abilities)) patch.abilities = o.abilities as CreatureAbility[];
  if (Array.isArray(o.items)) patch.items = o.items as InventoryItem[];
  if (o.spellSlots && typeof o.spellSlots === 'object')
    patch.spellSlots = o.spellSlots as SheetPatch['spellSlots'];
  if (o.resources && typeof o.resources === 'object')
    patch.resources = o.resources as SheetPatch['resources'];

  return patch;
}

/** Auto-detect: JSON when the text looks like an object, else the text scraper. */
export function parseSheet(text: string): SheetPatch {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const json = parseSheetJSON(trimmed);
    if (json) return json;
  }
  return parseSheetText(text);
}
