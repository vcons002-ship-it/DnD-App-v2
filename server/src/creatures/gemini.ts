import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type {
  AbilityRoll,
  CreatureAbility,
  CreatureTemplate,
  SheetAbility,
  SheetModifier,
  Weapon,
} from '../../../shared/types.js';
import { iconForCreature, findBaseCreature } from './srd.js';
import { generateJson, aiAvailable } from '../ai/gateway.js';
import { parseActionRoll } from '../../../shared/monsterAttacks.js';
import { sanitizeModifiers } from '../../../shared/modifiers.js';

// Models get deprecated over time, so try a list of current ones and fall
// through on "model not found" (404). A configured model override wins.
const FALLBACK_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-pro-latest',
  'gemini-2.5-pro',
];

/** The model we last reached successfully, cached for the process. */
let resolvedModel: string | null = null;

/** Transient HTTP statuses worth retrying (rate limit + server overload). */
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

/** Reset the cached model (call when the configured model changes). */
export const clearResolvedModel = (): void => {
  resolvedModel = null;
};

/** Whether AI creature lookup is available (a key is configured). */
export const geminiEnabled = (): boolean => !!config.geminiApiKey;

// ---- Shared JSON parsers (used by creature + character generators) ----

function parseAbilities(v: unknown): CreatureAbility[] {
  return Array.isArray(v)
    ? v
        .filter((a): a is CreatureAbility => !!a && typeof a.name === 'string')
        .map((a) => ({
          name: String(a.name),
          description: String(a.description ?? ''),
        }))
    : [];
}

const ABILITY_CODES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** Validate an explicit `roll` object the model may attach to an action. */
function parseRollJSON(v: unknown): AbilityRoll | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (o.kind !== 'attack' && o.kind !== 'save' && o.kind !== 'damage' && o.kind !== 'heal')
    return undefined;
  const dice = typeof o.dice === 'string' && /\d+d\d+/i.test(o.dice) ? o.dice.trim() : undefined;
  // An attack can be roll-worthy without dice, but save/damage/heal need dice.
  if (!dice && o.kind !== 'attack') return undefined;
  const roll: AbilityRoll = { kind: o.kind };
  if (dice) roll.dice = dice;
  if (typeof o.damageType === 'string' && o.damageType) roll.damageType = o.damageType;
  if (o.kind === 'save') {
    const save = String(o.save ?? '').toUpperCase().slice(0, 3);
    if (ABILITY_CODES.includes(save)) roll.save = save;
  }
  if (Number.isFinite(Number(o.dc))) roll.dc = Math.round(Number(o.dc));
  return roll;
}

/**
 * Parse AI rich `sheetAbilities` (the searchable/rollable system). Scoped to
 * creature-appropriate kinds only — `spell` and `ability` — NEVER PC-class
 * masteries/maneuvers/stances, so AI fill can't bleed character-class flavor onto
 * a creature (or vice-versa). Each gets an id + structured roll where present.
 */
function parseSheetAbilities(v: unknown): SheetAbility[] {
  return Array.isArray(v)
    ? v
        .filter(
          (a): a is Record<string, unknown> =>
            !!a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string',
        )
        .slice(0, 12)
        .map((a) => {
          const description = String(a.description ?? '');
          const roll = parseRollJSON(a.roll) ?? parseActionRoll(description);
          const lvl = Number(a.level);
          return {
            id: randomUUID(),
            name: String(a.name),
            type: a.type === 'spell' ? ('spell' as const) : ('ability' as const),
            description,
            source: 'gemini' as const,
            ...(Number.isFinite(lvl) ? { level: Math.max(0, Math.round(lvl)) } : {}),
            ...(roll ? { roll } : {}),
          };
        })
    : [];
}

/**
 * Parse AI `actions`, attaching a structured `roll` so save/area effects (breath
 * weapons, traps, spell-like abilities) are rollable and offer "Apply damage".
 * Prefers an explicit `roll` from the model, else scrapes the description for a
 * "DC <n> <ability> saving throw … <NdM> <type> damage" clause. Weapon attacks
 * ("+N to hit") yield no roll here — they become tagged `weapons` at spawn.
 */
function parseActions(v: unknown): CreatureAbility[] {
  return Array.isArray(v)
    ? v
        .filter((a): a is CreatureAbility => !!a && typeof a.name === 'string')
        .map((a) => {
          const name = String(a.name);
          const description = String(a.description ?? '');
          const roll = parseRollJSON((a as { roll?: unknown }).roll) ?? parseActionRoll(description);
          return roll ? { name, description, roll } : { name, description };
        })
    : [];
}

/**
 * Parse AI weapon JSON. For PCs, pass `diceOnly` so the ability mod + proficiency
 * are added live at roll time (the combat system expects character weapons to be
 * dice-only): any baked-in flat modifier on the damage is stripped and the to-hit
 * `attackBonus` is dropped. Monsters keep their pre-baked damage + to-hit.
 */
function parseWeapons(v: unknown, diceOnly = false): Weapon[] {
  return Array.isArray(v)
    ? v
        .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
        .filter((w) => typeof w.name === 'string' && w.name)
        .map((w) => {
          const bonus = Number(w.attackBonus);
          let damage = w.damage ? String(w.damage) : undefined;
          // Strip a trailing flat modifier (e.g. "1d8+3" -> "1d8") for PC weapons.
          if (diceOnly && damage) damage = damage.replace(/\s*[+-]\s*\d+\s*$/, '').trim();
          return {
            name: String(w.name),
            kind: w.kind === 'ranged' ? ('ranged' as const) : ('melee' as const),
            damage: damage || undefined,
            attackBonus: diceOnly || !Number.isFinite(bonus) ? undefined : bonus,
            ...(diceOnly ? { diceOnly: true as const } : {}),
          };
        })
    : [];
}

function parseStats(v: unknown): Record<string, number> {
  const stats: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as object)) {
      const n = Number(val);
      if (Number.isFinite(n)) stats[k.toUpperCase()] = n;
    }
  }
  return stats;
}

/**
 * Ask the API which models THIS key can use for generateContent, and pick a
 * fast one (prefer "flash"). This adapts to whatever the user's key/project has
 * access to, so we never call a retired model.
 */
async function discoverModel(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) {
      console.warn(`  [gemini] ListModels HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
    };
    const usable = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => !/embedding|aqa|vision/i.test(n));
    const pick =
      usable.find((n) => /flash/i.test(n) && !/lite|thinking/i.test(n)) ||
      usable.find((n) => /flash/i.test(n)) ||
      usable.find((n) => /gemini/i.test(n)) ||
      usable[0];
    if (pick) console.log(`  [gemini] using model: ${pick}`);
    return pick ?? null;
  } catch (err) {
    console.warn('  [gemini] ListModels error:', (err as Error).message);
    return null;
  }
}

/** Plain-text Gemini call (no JSON mime) for prose answers like the rules
 *  assistant. Shares model discovery/rotation + retries with callGemini. */
export async function callGeminiText(
  prompt: string,
  signal?: AbortSignal,
): Promise<string | null> {
  return callGemini(prompt, { json: false, signal });
}

/** Call Gemini, discovering/rotating models so a retired one never blocks us. */
export async function callGemini(
  prompt: string,
  opts: { json?: boolean; signal?: AbortSignal } = {},
): Promise<string | null> {
  const json = opts.json !== false; // default: structured JSON (existing callers)
  let models: string[];
  if (resolvedModel) {
    models = [resolvedModel];
  } else if (config.geminiModel) {
    // An explicit override wins — don't auto-discover around it.
    models = [config.geminiModel];
  } else {
    const discovered = await discoverModel();
    // Try the discovered model first, then the static candidates as a backup.
    models = (discovered ? [discovered, ...FALLBACK_MODELS] : FALLBACK_MODELS).filter(
      (m, i, a) => a.indexOf(m) === i,
    );
  }
  for (const model of models) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
      `?key=${config.geminiApiKey}`;
    // Transient timeouts/network blips are common; retry up to 3 times with
    // exponential backoff (1s/2s/4s) before giving up on this model. Each try
    // keeps its own 20s budget.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: json ? { responseMimeType: 'application/json' } : {},
          }),
          signal: opts.signal
            ? AbortSignal.any([AbortSignal.timeout(20000), opts.signal])
            : AbortSignal.timeout(20000),
        });
        // Rate limits (429) and server overload (500/502/503/504) are transient
        // and common with Gemini — back off and retry before giving up.
        if (TRANSIENT_STATUS.has(res.status) && attempt < 2) {
          console.warn(
            `  [gemini] HTTP ${res.status} on ${model} (attempt ${attempt + 1}/3), retrying…`,
          );
          res = null;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        break;
      } catch (err) {
        console.warn(
          `  [gemini] request error on ${model} (attempt ${attempt + 1}/3):`,
          (err as Error).message,
        );
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    if (!res) continue; // retries exhausted → try the next model, else give up
    if (res.status === 404) {
      console.warn(`  [gemini] model ${model} unavailable, trying next…`);
      resolvedModel = null;
      continue;
    }
    if (!res.ok) {
      console.warn(
        `  [gemini] HTTP ${res.status} on ${model}: ${(await res.text()).slice(0, 300)}`,
      );
      return null;
    }
    resolvedModel = model; // cache the working model
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }
  console.warn('  [gemini] no usable model found');
  return null;
}

/**
 * Ask Gemini for a D&D 5e creature stat block as structured JSON. Returns null
 * if no key is set, the request fails, or the response can't be parsed — callers
 * fall back gracefully (the app never depends on AI being reachable).
 */
export async function lookupCreatureAI(
  name: string,
): Promise<CreatureTemplate | null> {
  if (!aiAvailable() || !name.trim()) return null;

  const prompt =
    `Give a Dungeons & Dragons 5e stat block for "${name}". This may be a plain ` +
    `creature name or a short description (e.g. "goblin with a longbow", ` +
    `"orc fighter with a halberd") — honor the described gear/role. ` +
    `Respond ONLY with minified JSON of shape ` +
    `{"name":string,"creatureType":string,"level":number,"maxHp":number,"armorClass":number,"speed":string,` +
    `"stats":{"STR":number,"DEX":number,"CON":number,"INT":number,"WIS":number,"CHA":number},` +
    `"resistances":string[],"weaknesses":string[],` +
    `"weapons":[{"name":string,"kind":"melee"|"ranged","damage":string,"attackBonus":number}],` +
    `"actions":[{"name":string,"description":string,"roll":{"kind":"save"|"attack"|"damage"|"heal","dice":string,"save":"STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA","dc":number,"damageType":string}}],` +
    `"abilities":[{"name":string,"description":string}],` +
    `"sheetAbilities":[{"name":string,"type":"ability"|"spell","level":number,"description":string,"roll":{"kind":"save"|"attack"|"damage"|"heal","dice":string,"save":"STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA","dc":number,"damageType":string}}]}. ` +
    `"sheetAbilities" are the creature's INNATE / spell-like special abilities ` +
    `(innate spellcasting, gaze, life drain, a recharge breath usable as an ability) ` +
    `with a structured "roll" when they deal damage or force a save — creature-` +
    `appropriate only. Do NOT put ordinary weapon attacks there, and do NOT invent ` +
    `player-class features (no weapon masteries, maneuvers, or stances). ` +
    `"name" is a short, flavorful creature name (≈2–4 words, e.g. "Bandit Captain" ` +
    `or "Ashfang Wolf") — NOT the full description text. ` +
    `"level" is the challenge rating as a number (e.g. 0.25, 1, 5). ` +
    `"weapons" are ordinary single-target weapon attacks as tagged data (damage like "1d8+3"). ` +
    `Humanoid combatants (bandits, soldiers, guards, cultists) should carry the ` +
    `MANUFACTURED weapons they'd realistically use, named for the weapon (e.g. ` +
    `"Scimitar", "Light Crossbow", "Spear"); beasts/monsters use natural attacks ` +
    `(Bite, Claw, Slam, Tail). Most creatures should have at least one weapon attack. ` +
    `Put every effect that forces a SAVING THROW or hits an area (breath weapons, ` +
    `traps, auras, spell-like blasts) in "actions" — NOT in "weapons" — with a ` +
    `structured "roll" ("kind":"save", the "save" ability, "dc", "dice" like "2d6", ` +
    `"damageType"), and phrase the description as "DC <n> <ability> saving throw, ` +
    `<dice> <type> damage". "abilities" are passive traits/features (no roll). ` +
    `Use SRD/average HP. Keep each description under 30 words.`;

  // If the name extends a known SRD creature (e.g. "Stone Goblin"), pass the
  // canonical base block as a POWER FLOOR + starting point — NOT a template to
  // copy. The variant should be MORE powerful and full of new, on-theme flavor;
  // the only rule is "don't end up weaker than the base." Fully-custom names (no
  // base match) skip this entirely and get full creative latitude.
  const base = findBaseCreature(name);
  const groundedPrompt = base
    ? prompt +
      `\n\nThis is a themed VARIANT of the SRD "${base.name}" (CR ${base.level}). Treat ` +
      `the base block below ONLY as a power FLOOR and a starting point — its CR, HP, AC, ` +
      `ability scores, and damage are the MINIMUM. BE CREATIVE: invent new thematic ` +
      `abilities, attacks, resistances/immunities, and reflavor freely to fit the name ` +
      `(e.g. a "Stone Goblin" gains earth/stone powers and tougher AC; a "Blood Goblin" ` +
      `gains life-drain). Make it noticeably stronger and distinct — just never weaker ` +
      `than the base, and keep it recognizably related unless the name implies a different ` +
      `creature type. Base block (the floor):\n` +
      JSON.stringify({
        name: base.name,
        creatureType: base.creatureType,
        level: base.level,
        maxHp: base.maxHp,
        armorClass: base.armorClass,
        speed: base.speed,
        stats: base.stats,
        actions: base.actions,
        abilities: base.abilities,
      })
    : prompt;

  const text = await generateJson(groundedPrompt);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const creatureType = String(parsed.creatureType ?? 'unknown');
    const stats = parseStats(parsed.stats);
    return {
      // The model picks a short, flavorful name; fall back to the raw input so
      // the create flow always has a sensible label even if the field is missing.
      name: String(parsed.name ?? '').trim() || name.trim(),
      creatureType,
      level: Number.isFinite(Number(parsed.level)) ? Number(parsed.level) : 0,
      maxHp: Number(parsed.maxHp) > 0 ? Math.round(Number(parsed.maxHp)) : 10,
      armorClass: Number(parsed.armorClass) > 0 ? Math.round(Number(parsed.armorClass)) : 0,
      speed: typeof parsed.speed === 'string' ? parsed.speed : '',
      stats,
      resistances: Array.isArray(parsed.resistances) ? parsed.resistances.map(String) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
      actions: parseActions(parsed.actions),
      abilities: parseAbilities(parsed.abilities),
      sheetAbilities: parseSheetAbilities(parsed.sheetAbilities),
      weapons: parseWeapons(parsed.weapons),
      icon: iconForCreature(name, creatureType),
      source: 'gemini',
    };
  } catch (err) {
    console.warn(`  [gemini] parse error for "${name}":`, (err as Error).message);
    return null;
  }
}

/** An AI-generated player character / NPC stat sheet. */
export type GeneratedCharacter = {
  name: string;
  race: string;
  className: string;
  subclass: string;
  level: number;
  maxHp: number;
  armorClass: number;
  speed: string;
  stats: Record<string, number>;
  weapons: Weapon[];
  resistances: string[];
  weaknesses: string[];
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
  sheetAbilities: SheetAbility[];
  proficientSkills: string[];
  icon: string;
};

/**
 * Generate a whole D&D 5e character / NPC from a free-text description
 * (e.g. "grizzled dwarf cleric, level 5", "elf rogue archer"). Returns null and
 * lets callers fall back gracefully when no key is set or the call fails.
 */
export async function generateCharacterAI(
  description: string,
): Promise<GeneratedCharacter | null> {
  if (!aiAvailable() || !description.trim()) return null;

  const prompt =
    `Create a Dungeons & Dragons 5e character or NPC from this description: ` +
    `"${description.trim()}". Choose a sensible level if none is given. ` +
    `Respond ONLY with minified JSON of shape ` +
    `{"name":string,"race":string,"className":string,"subclass":string,"level":number,"maxHp":number,` +
    `"armorClass":number,"speed":string,` +
    `"stats":{"STR":number,"DEX":number,"CON":number,"INT":number,"WIS":number,"CHA":number},` +
    `"resistances":string[],"weaknesses":string[],` +
    `"weapons":[{"name":string,"kind":"melee"|"ranged","damage":string}],` +
    `"actions":[{"name":string,"description":string,"roll":{"kind":"save"|"attack"|"damage"|"heal","dice":string,"save":"STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA","dc":number,"damageType":string}}],` +
    `"abilities":[{"name":string,"description":string}],` +
    `"sheetAbilities":[{"name":string,"type":"spell"|"ability","level":number,"description":string,"roll":{"kind":"save"|"attack"|"damage"|"heal","dice":string,"save":"STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA","dc":number,"damageType":string}}],` +
    `"proficientSkills":string[]}. ` +
    `"sheetAbilities" are the character's signature SPELLS (type "spell" with a ` +
    `"level") and class/feat FEATURES (type "ability"), with a structured "roll" ` +
    `where they deal damage / force a save / heal. ` +
    `Put saving-throw / area effects (spell blasts, auras) in "actions" with a ` +
    `structured "roll" (phrase the description "DC <n> <ability> saving throw, ` +
    `<dice> <type> damage"), not in "weapons". ` +
    `"proficientSkills" are class/background skill proficiencies from the 5e ` +
    `skill list (e.g. "Perception","Stealth","Arcana"). ` +
    `"name" is a fitting proper name; "weapons" are attacks whose "damage" is the ` +
    `weapon's damage DICE ONLY with NO ability modifier and NO flat bonus ` +
    `(e.g. "1d8" or "2d6", never "1d8+3") — the character's ability modifier and ` +
    `to-hit are added automatically from their stats; ` +
    `"actions" are attacks/features; "abilities" are class/racial traits. ` +
    `Use level-appropriate HP. Keep each description under 30 words.`;

  const text = await generateJson(prompt);
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Record<string, unknown>;
    const className = String(p.className ?? '');
    const name = String(p.name ?? description.trim());
    return {
      name,
      race: String(p.race ?? ''),
      className,
      subclass: String(p.subclass ?? ''),
      level: Number(p.level) > 0 ? Number(p.level) : 1,
      maxHp: Number(p.maxHp) > 0 ? Math.round(Number(p.maxHp)) : 10,
      armorClass: Number(p.armorClass) > 0 ? Math.round(Number(p.armorClass)) : 0,
      speed: typeof p.speed === 'string' ? p.speed : '',
      stats: parseStats(p.stats),
      resistances: Array.isArray(p.resistances) ? p.resistances.map(String) : [],
      weaknesses: Array.isArray(p.weaknesses) ? p.weaknesses.map(String) : [],
      weapons: parseWeapons(p.weapons, true),
      actions: parseActions(p.actions),
      abilities: parseAbilities(p.abilities),
      sheetAbilities: parseSheetAbilities(p.sheetAbilities),
      proficientSkills: Array.isArray(p.proficientSkills)
        ? p.proficientSkills.map(String)
        : [],
      icon: iconForCreature(name, className),
    };
  } catch (err) {
    console.warn(
      `  [gemini] character parse error for "${description}":`,
      (err as Error).message,
    );
    return null;
  }
}

/**
 * Generate a single D&D 5e item from a free-text prompt. Key-gated + fail-safe
 * (returns null with no key or on any error) like every AI path. Shape mirrors a
 * library item: name + description + a sensible default stack quantity, plus any
 * numeric magic effects as structured modifiers (validated server-side; the VTT
 * auto-applies them while the item is equipped).
 */
export async function generateItemAI(prompt: string): Promise<{
  name: string;
  description: string;
  qtyDefault: number;
  modifiers: SheetModifier[];
} | null> {
  if (!aiAvailable() || !prompt.trim()) return null;
  const ask =
    `Invent a single Dungeons & Dragons 5e item from this prompt: "${prompt}". ` +
    `Respond ONLY with minified JSON of shape ` +
    `{"name":string,"description":string,"qtyDefault":number,"modifiers":Modifier[]}. ` +
    `"name" is short (≈2–5 words). "description" is 1–3 sentences covering what ` +
    `it is, any rules effect, and rarity/attunement if magical. "qtyDefault" is a ` +
    `sensible stack size (1 for gear/weapons/armor, more for ammo/consumables). ` +
    `"modifiers" lists every FLAT NUMERIC bonus the item grants while worn/equipped — ` +
    `[] if none. A Modifier is {"target":Target,"value":number,"set"?:true} where ` +
    `Target is one of {"kind":"ability","ability":"STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA"} | ` +
    `{"kind":"save","ability"?:same} | {"kind":"skill","skill"?:string} | ` +
    `{"kind":"attack"} | {"kind":"ac"} | {"kind":"initiative"}. Omitting ` +
    `"ability"/"skill" means ALL saves/skills. "set":true means the ability score ` +
    `BECOMES value (a floor, e.g. Gauntlets of Ogre Power) rather than adding to it. ` +
    `Use one entry per bonus — an item may have several (a cloak giving +1 AC and ` +
    `+1 to all saves = two entries). Do NOT encode advantage, resistances, or other ` +
    `non-numeric effects; leave those to the description. ` +
    `Keep it SRD-safe and original.`;
  const text = await generateJson(ask);
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Record<string, unknown>;
    const name = String(p.name ?? '').trim();
    if (!name) return null;
    return {
      name,
      description: String(p.description ?? '').trim(),
      qtyDefault: Number.isFinite(Number(p.qtyDefault))
        ? Math.max(1, Math.round(Number(p.qtyDefault)))
        : 1,
      modifiers: sanitizeModifiers(p.modifiers),
    };
  } catch (err) {
    console.warn(
      `  [gemini] item parse error for "${prompt}":`,
      (err as Error).message,
    );
    return null;
  }
}
