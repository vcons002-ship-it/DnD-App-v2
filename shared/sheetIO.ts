// Character-sheet import/export, framework-free so it's reusable + testable.
// Two import paths: a robust best-effort PLAIN-TEXT scraper (any sheet), and a
// lossless JSON round-trip with our own export.
import type {
  Character,
  CharacterUpdatePayload,
  CreatureAbility,
  InventoryItem,
  SheetAbility,
  Weapon,
} from './types.js';
import { SKILLS, abilityMod, proficiencyBonus } from './skills.js';
import { FEAT_LIBRARY } from './featLibrary.js';

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
const escapeRe = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

/** A signed bonus appearing right after (or just before) a label, e.g.
 *  "Acrobatics (Dex) +5" or "+5 Acrobatics". Undefined if none is nearby. */
function bonusNear(t: string, label: string): number | undefined {
  const L = escapeRe(label);
  const after = t.match(new RegExp(`${L}\\b(?:\\s*\\([a-z]{3}\\))?[^\\n+\\-\\d]{0,8}([+\\-]\\s*\\d{1,2})`, 'i'));
  if (after) return Number(after[1].replace(/\s+/g, ''));
  const before = t.match(new RegExp(`([+\\-]\\s*\\d{1,2})[^\\n\\d]{0,3}${L}\\b`, 'i'));
  return before ? Number(before[1].replace(/\s+/g, '')) : undefined;
}

/** The text immediately following a label, up to the next blank line / section
 *  header (used to scope save parsing to the "Saving Throws" list). */
function captureAfter(t: string, labelRe: RegExp): string {
  const m = t.match(labelRe);
  if (!m || m.index === undefined) return '';
  const after = t.slice(m.index + m[0].length);
  const stop = after.search(
    /\n\s*\n|\n[^\S\n]*(?:skills?|features?|traits?|spell|inventory|equipment|proficienc|languages?|actions?|attacks?|senses?)\b/i,
  );
  return (stop >= 0 ? after.slice(0, stop) : after).slice(0, 240);
}

/** A signed bonus next to an ability label inside a scoped context, e.g.
 *  "Constitution +5" or "Con +5". */
function bonusForAbility(ctx: string, labels: string): number | undefined {
  const m = ctx.match(new RegExp(`\\b(?:${labels})\\b[^\\n+\\-\\d]{0,8}([+\\-]\\s*\\d{1,2})`, 'i'));
  return m ? Number(m[1].replace(/\s+/g, '')) : undefined;
}

// Section headers that END a "Features & Traits" block when scraping feats.
const SECTION_STOP =
  /^[^\S\n]*(?:inventory|equipment|spell(?:s|casting|book)?|proficienc(?:y|ies)|languages?|background|actions?|attacks?|reactions?|bonus actions?|appearance|backstory|notes?|allies|treasure|coins?|gold|currency)\b/i;

/**
 * Best-effort scrape of feats + features. Three signals (union): distinctive
 * (multi-word) library feat names mentioned anywhere, an explicit "Feats: a, b"
 * label, and a "Features & Traits" block split into named entries. Single-word
 * library feats are skipped here (too many are common words) — they still come
 * in via an explicit label or the block. Returned as free-text trait entries.
 */
function parseFeatsAndFeatures(t: string): CreatureAbility[] {
  const out: CreatureAbility[] = [];
  const seen = new Set<string>();
  const add = (name: string, description = '') => {
    const clean = name.replace(/^[•●◉★*\s-]+|[•●◉★*\s:.-]+$/g, '').trim();
    const key = clean.toLowerCase();
    if (clean.length < 2 || clean.length > 60 || seen.has(key)) return;
    seen.add(key);
    out.push({ name: clean, description: description.trim().slice(0, 600) });
  };

  // 1) Distinctive (multi-word) library feats named anywhere → attach the blurb.
  for (const f of FEAT_LIBRARY) {
    if (f.group !== 'Feat' || !f.name.includes(' ')) continue;
    if (new RegExp(`\\b${escapeRe(f.name)}\\b`, 'i').test(t)) add(f.name, f.description);
  }
  // 2) Explicit "Feats: Alert, Lucky" / "Feat: Sentinel".
  const lab = t.match(/^[^\S\n]*feats?\b\s*[:\-]\s*([^\n]+)/im);
  if (lab) for (const nm of lab[1].split(/[,;/]/)) add(title(nm.trim().toLowerCase()));
  // 3) A "Features & Traits" / "Features" / "Traits" block → name + description.
  for (const e of captureFeatureEntries(t)) add(e.name, e.description);

  return out.slice(0, 40);
}

/** An id for an imported ability (works in Node + the browser). */
const genId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/** A plausible spell / feature NAME (filters out stat fragments + headers). */
function plausibleName(s: string): boolean {
  if (s.length < 3 || s.length > 40 || !/^[A-Za-z]/.test(s)) return false;
  if (/\d/.test(s)) return false; // names don't carry digits; stat lines do
  if (s.split(/\s+/).length > 6) return false;
  return !/^(?:level|cantrips?|spells?|spellcasting|prepared|known|slots?|save|attack|dc|ability|modifier)$/i.test(s);
}

/**
 * Best-effort: capture a "Spells / Spellcasting" block as spell NAMES (grouped by
 * a "Cantrips"/"Nth-level" subheader where present). No structured roll — the
 * player enriches a spell via the in-sheet search/AI; this just gets the list in.
 */
function parseSpells(t: string): SheetAbility[] {
  const lines = t.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^[^\S\n]*(?:spell(?:s|book|casting)?|cantrips?)\b/i.test(l) && /\b(?:spell|cantrip)/i.test(l)) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];
  const out: SheetAbility[] = [];
  const seen = new Set<string>();
  let curLevel: number | undefined;
  const levelOf = (s: string): number | undefined => {
    if (/\bcantrips?\b/i.test(s)) return 0;
    const m = s.match(/\blevel\s*([0-9])\b/i) ?? s.match(/\b([0-9])(?:st|nd|rd|th)\b\s*[- ]?level/i);
    return m ? Number(m[1]) : undefined;
  };
  for (let i = start; i < lines.length; i++) {
    let line = lines[i].trim();
    if (i > start && line && SECTION_STOP.test(line) && !/spell|cantrip/i.test(line) && line.length < 40) break;
    if (!line) continue;
    // A leading "Cantrips:" / "1st Level:" header sets the level; names may follow.
    const head = line.match(/^\s*(cantrips?|level\s*[0-9]|[0-9](?:st|nd|rd|th)\s*[- ]?level)\b\s*[:\-]?\s*/i);
    if (head) {
      curLevel = levelOf(head[0]);
      line = line.slice(head[0].length).trim();
      if (!line) continue;
    }
    for (let nm of line.split(/[,;]|\s{2,}|•|·/)) {
      nm = nm
        .replace(/\([^)]*\)/g, '')
        .replace(/[*•●◉★]/g, '')
        .replace(/\b(?:prepared|ritual|concentration|conc\.?|at will)\b/gi, '')
        .trim();
      if (!plausibleName(nm) || seen.has(nm.toLowerCase())) continue;
      seen.add(nm.toLowerCase());
      out.push({
        id: genId(),
        name: nm,
        type: 'spell',
        ...(curLevel !== undefined ? { level: curLevel } : {}),
        description: '',
        source: 'custom',
      });
      if (out.length >= 80) return out;
    }
  }
  return out;
}

/** Best-effort: a "Weapon Mastery / Masteries: …" line → mastery entries. */
function parseMasteries(t: string): SheetAbility[] {
  const m = t.match(/\bweapon\s*master(?:y|ies)\b\s*[:\-]?\s*([^\n]+)/i);
  if (!m) return [];
  const out: SheetAbility[] = [];
  const seen = new Set<string>();
  for (let nm of m[1].split(/[,;/]|\s{2,}/)) {
    nm = nm.replace(/\([^)]*\)/g, '').replace(/[*•●◉★]/g, '').trim();
    if (!plausibleName(nm) || seen.has(nm.toLowerCase())) continue;
    seen.add(nm.toLowerCase());
    out.push({ id: genId(), name: `${nm} Mastery`, type: 'mastery', description: '', source: 'custom' });
  }
  return out;
}

/** Split a "Features & Traits" block into {name, description} entries: a short,
 *  title-cased line that doesn't end in sentence punctuation starts an entry;
 *  the lines under it are its description, until the next name or a new section. */
function captureFeatureEntries(t: string): { name: string; description: string }[] {
  const lines = t.split('\n');
  const headerRe = /^[^\S\n]*(?:features?\s*&?\s*traits?|features?|traits?)\s*:?\s*$/i;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { start = i + 1; break; }
  }
  if (start < 0) return [];
  const entries: { name: string; description: string }[] = [];
  let cur: { name: string; description: string } | null = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && SECTION_STOP.test(line) && line.length < 40) break; // next section
    if (!line) continue;
    const isName =
      line.length <= 60 &&
      !/[.!?,;:]$/.test(line) &&
      /^[A-Z(\[]/.test(line) &&
      line.split(/\s+/).length <= 8;
    if (isName) {
      if (cur) entries.push(cur);
      cur = { name: line, description: '' };
    } else if (cur) {
      cur.description += (cur.description ? ' ' : '') + line;
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

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

  const lvl = patch.level;
  const sc = patch.stats ?? {};

  // Skill proficiencies — a marker (● • ✓ ✔ ★, "(P)/(E)", or "prof"/"expert" near
  // the skill) OR an inferred one: a listed total at least ability-mod +
  // proficiency-bonus high implies proficiency (this is what catches Roll20 /
  // D&D Beyond pastes that just list "Stealth +7" with no explicit marker).
  const prof: string[] = [];
  for (const s of SKILLS) {
    const name = escapeRe(s.name);
    const marker = new RegExp(
      `(?:[●•◉✓✔★]\\s*${name})|(?:${name}\\s*\\((?:P|E|Ex)\\))|(?:${name}[^\\n]{0,16}\\b(?:profic|expert)\\w*)`,
      'i',
    ).test(t);
    let isProf = marker;
    if (!isProf && lvl !== undefined && sc[s.ability] !== undefined) {
      const bonus = bonusNear(t, s.name);
      if (bonus !== undefined && bonus - abilityMod(sc[s.ability]) >= proficiencyBonus(lvl)) {
        isProf = true;
      }
    }
    if (isProf) prof.push(s.name);
  }
  if (prof.length) patch.proficientSkills = prof;

  // Saving-throw proficiencies — a marker near the ability + "save", or (scoped
  // to the "Saving Throws" list) a listed bonus that implies proficiency.
  const savesCtx = captureAfter(t, /\b(?:saving\s*throws?|saves)\b\s*[:\-]?/i);
  const saves: string[] = [];
  for (const [ab, labels] of Object.entries(ABILITY_LABELS)) {
    const marker =
      new RegExp(`\\b(?:${labels})\\b[^\\n]{0,20}\\bsav(?:e|ing)\\b[^\\n]{0,18}(?:[●•◉✓✔★]|\\(P\\)|profic)`, 'i').test(t) ||
      new RegExp(`(?:[●•◉✓✔★]|profic\\w*)[^\\n]{0,18}\\b(?:${labels})\\b[^\\n]{0,14}\\bsav`, 'i').test(t);
    let isProf = marker;
    if (!isProf && savesCtx && lvl !== undefined && sc[ab] !== undefined) {
      const bonus = bonusForAbility(savesCtx, labels);
      if (bonus !== undefined && bonus - abilityMod(sc[ab]) >= proficiencyBonus(lvl)) {
        isProf = true;
      }
    }
    if (isProf) saves.push(ab);
  }
  if (saves.length) patch.saveProficiencies = saves;

  // Feats + features & traits → free-text trait entries (the hard-to-parse bits).
  const feats = parseFeatsAndFeatures(t);
  if (feats.length) patch.abilities = feats;

  // Spells + weapon masteries → sheet abilities (names only; enrich via the
  // in-sheet search/AI to make them rollable).
  const abilities = [...parseSpells(t), ...parseMasteries(t)];
  if (abilities.length) patch.sheetAbilities = abilities;

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
      saveProficiencies: c.saveProficiencies,
      modifiers: c.modifiers,
      spellSlots: c.spellSlots,
      resources: c.resources,
      items: c.items,
      gold: c.gold,
      sheetAbilities: c.sheetAbilities,
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
  if (strArr('saveProficiencies')) patch.saveProficiencies = strArr('saveProficiencies');
  if (int('gold') !== undefined) patch.gold = int('gold');

  if (o.stats && typeof o.stats === 'object') {
    const stats: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.stats as object)) {
      if (Number.isFinite(Number(v))) stats[k.toUpperCase()] = Number(v);
    }
    patch.stats = stats;
  }
  if (Array.isArray(o.modifiers)) patch.modifiers = o.modifiers as SheetPatch['modifiers'];
  if (Array.isArray(o.weapons)) patch.weapons = o.weapons as Weapon[];
  if (Array.isArray(o.actions)) patch.actions = o.actions as CreatureAbility[];
  if (Array.isArray(o.abilities)) patch.abilities = o.abilities as CreatureAbility[];
  if (Array.isArray(o.items)) patch.items = o.items as InventoryItem[];
  if (Array.isArray(o.sheetAbilities))
    patch.sheetAbilities = o.sheetAbilities as SheetPatch['sheetAbilities'];
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
