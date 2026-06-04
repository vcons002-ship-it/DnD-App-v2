import { config } from '../config.js';
import type { CreatureAbility, CreatureTemplate } from '../../../shared/types.js';
import { iconForCreature } from './srd.js';

// Models get deprecated over time, so try a list of current ones and fall
// through on "model not found" (404). A single GEMINI_MODEL override wins.
const CANDIDATE_MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-pro-latest',
      'gemini-2.5-pro',
    ];

/** The model we last reached successfully, cached for the process. */
let resolvedModel: string | null = null;

/** Whether AI creature lookup is available (a key is configured). */
export const geminiEnabled = (): boolean => !!config.geminiApiKey;

/** Call Gemini, rotating through candidate models if one is unavailable. */
async function callGemini(prompt: string): Promise<string | null> {
  const models = resolvedModel ? [resolvedModel] : CANDIDATE_MODELS;
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
      // Model retired/unknown — try the next candidate.
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
  console.warn('  [gemini] no available model found among:', CANDIDATE_MODELS.join(', '));
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
    `Give the Dungeons & Dragons 5e stat block for "${name}". ` +
    `Respond ONLY with minified JSON of shape ` +
    `{"creatureType":string,"maxHp":number,"armorClass":number,"speed":string,` +
    `"stats":{"STR":number,"DEX":number,"CON":number,"INT":number,"WIS":number,"CHA":number},` +
    `"resistances":string[],"weaknesses":string[],` +
    `"actions":[{"name":string,"description":string}],` +
    `"abilities":[{"name":string,"description":string}]}. ` +
    `"actions" are attacks/actions (include to-hit and damage); "abilities" are ` +
    `traits/features. Use SRD/average HP. Keep each description under 30 words.`;

  const abilityList = (v: unknown): CreatureAbility[] =>
    Array.isArray(v)
      ? v
          .filter((a): a is CreatureAbility => !!a && typeof a.name === 'string')
          .map((a) => ({
            name: String(a.name),
            description: String(a.description ?? ''),
          }))
      : [];

  const text = await callGemini(prompt);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const creatureType = String(parsed.creatureType ?? 'unknown');
    const stats: Record<string, number> = {};
    if (parsed.stats && typeof parsed.stats === 'object') {
      for (const [k, v] of Object.entries(parsed.stats as object)) {
        const n = Number(v);
        if (Number.isFinite(n)) stats[k.toUpperCase()] = n;
      }
    }
    return {
      name: name.trim(),
      creatureType,
      maxHp: Number(parsed.maxHp) > 0 ? Math.round(Number(parsed.maxHp)) : 10,
      armorClass: Number(parsed.armorClass) > 0 ? Math.round(Number(parsed.armorClass)) : 0,
      speed: typeof parsed.speed === 'string' ? parsed.speed : '',
      stats,
      resistances: Array.isArray(parsed.resistances) ? parsed.resistances.map(String) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
      actions: abilityList(parsed.actions),
      abilities: abilityList(parsed.abilities),
      icon: iconForCreature(name, creatureType),
      source: 'gemini',
    };
  } catch (err) {
    console.warn(`  [gemini] parse error for "${name}":`, (err as Error).message);
    return null;
  }
}
