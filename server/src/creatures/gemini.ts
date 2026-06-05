import { config } from '../config.js';
import type {
  CreatureAbility,
  CreatureTemplate,
  Weapon,
} from '../../../shared/types.js';
import { iconForCreature } from './srd.js';

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

function parseWeapons(v: unknown): Weapon[] {
  return Array.isArray(v)
    ? v
        .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
        .filter((w) => typeof w.name === 'string' && w.name)
        .map((w) => {
          const bonus = Number(w.attackBonus);
          return {
            name: String(w.name),
            kind: w.kind === 'ranged' ? ('ranged' as const) : ('melee' as const),
            damage: w.damage ? String(w.damage) : undefined,
            attackBonus: Number.isFinite(bonus) ? bonus : undefined,
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

/** Call Gemini, discovering/rotating models so a retired one never blocks us. */
export async function callGemini(prompt: string): Promise<string | null> {
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
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      console.warn(`  [gemini] request error on ${model}:`, (err as Error).message);
      return null;
    }
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
  if (!config.geminiApiKey || !name.trim()) return null;

  const prompt =
    `Give a Dungeons & Dragons 5e stat block for "${name}". This may be a plain ` +
    `creature name or a short description (e.g. "goblin with a longbow", ` +
    `"orc fighter with a halberd") — honor the described gear/role. ` +
    `Respond ONLY with minified JSON of shape ` +
    `{"creatureType":string,"level":number,"maxHp":number,"armorClass":number,"speed":string,` +
    `"stats":{"STR":number,"DEX":number,"CON":number,"INT":number,"WIS":number,"CHA":number},` +
    `"resistances":string[],"weaknesses":string[],` +
    `"weapons":[{"name":string,"kind":"melee"|"ranged","damage":string,"attackBonus":number}],` +
    `"actions":[{"name":string,"description":string}],` +
    `"abilities":[{"name":string,"description":string}]}. ` +
    `"level" is the challenge rating as a number (e.g. 0.25, 1, 5). ` +
    `"weapons" are its attacks as tagged data (damage like "1d8+3"); ` +
    `"actions" are attacks/actions (include to-hit and damage); "abilities" are ` +
    `traits/features. Use SRD/average HP. Keep each description under 30 words.`;

  const text = await callGemini(prompt);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const creatureType = String(parsed.creatureType ?? 'unknown');
    const stats = parseStats(parsed.stats);
    return {
      name: name.trim(),
      creatureType,
      level: Number.isFinite(Number(parsed.level)) ? Number(parsed.level) : 0,
      maxHp: Number(parsed.maxHp) > 0 ? Math.round(Number(parsed.maxHp)) : 10,
      armorClass: Number(parsed.armorClass) > 0 ? Math.round(Number(parsed.armorClass)) : 0,
      speed: typeof parsed.speed === 'string' ? parsed.speed : '',
      stats,
      resistances: Array.isArray(parsed.resistances) ? parsed.resistances.map(String) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
      actions: parseAbilities(parsed.actions),
      abilities: parseAbilities(parsed.abilities),
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
  if (!config.geminiApiKey || !description.trim()) return null;

  const prompt =
    `Create a Dungeons & Dragons 5e character or NPC from this description: ` +
    `"${description.trim()}". Choose a sensible level if none is given. ` +
    `Respond ONLY with minified JSON of shape ` +
    `{"name":string,"race":string,"className":string,"level":number,"maxHp":number,` +
    `"armorClass":number,"speed":string,` +
    `"stats":{"STR":number,"DEX":number,"CON":number,"INT":number,"WIS":number,"CHA":number},` +
    `"resistances":string[],"weaknesses":string[],` +
    `"weapons":[{"name":string,"kind":"melee"|"ranged","damage":string,"attackBonus":number}],` +
    `"actions":[{"name":string,"description":string}],` +
    `"abilities":[{"name":string,"description":string}],` +
    `"proficientSkills":string[]}. ` +
    `"proficientSkills" are class/background skill proficiencies from the 5e ` +
    `skill list (e.g. "Perception","Stealth","Arcana"). ` +
    `"name" is a fitting proper name; "weapons" are tagged attacks (damage like ` +
    `"1d8+3"); "actions" are attacks/features; "abilities" are class/racial traits. ` +
    `Use level-appropriate HP. Keep each description under 30 words.`;

  const text = await callGemini(prompt);
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Record<string, unknown>;
    const className = String(p.className ?? '');
    const name = String(p.name ?? description.trim());
    return {
      name,
      race: String(p.race ?? ''),
      className,
      level: Number(p.level) > 0 ? Number(p.level) : 1,
      maxHp: Number(p.maxHp) > 0 ? Math.round(Number(p.maxHp)) : 10,
      armorClass: Number(p.armorClass) > 0 ? Math.round(Number(p.armorClass)) : 0,
      speed: typeof p.speed === 'string' ? p.speed : '',
      stats: parseStats(p.stats),
      resistances: Array.isArray(p.resistances) ? p.resistances.map(String) : [],
      weaknesses: Array.isArray(p.weaknesses) ? p.weaknesses.map(String) : [],
      weapons: parseWeapons(p.weapons),
      actions: parseAbilities(p.actions),
      abilities: parseAbilities(p.abilities),
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
