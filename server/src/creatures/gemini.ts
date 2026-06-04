import { config } from '../config.js';
import type { CreatureTemplate } from '../../../shared/types.js';
import { iconForCreature } from './srd.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/** Whether AI creature lookup is available (a key is configured). */
export const geminiEnabled = (): boolean => !!config.geminiApiKey;

/**
 * Ask Gemini for a D&D 5e creature's stat block as structured JSON. Returns null
 * if no key is set, the request fails, or the response can't be parsed — callers
 * fall back gracefully (the app never depends on AI being reachable).
 */
export async function lookupCreatureAI(
  name: string,
): Promise<CreatureTemplate | null> {
  if (!config.geminiApiKey || !name.trim()) return null;

  const prompt =
    `Give the Dungeons & Dragons 5e stat summary for "${name}". ` +
    `Respond ONLY with minified JSON of shape ` +
    `{"creatureType":string,"maxHp":number,"resistances":string[],` +
    `"weaknesses":string[],"abilities":[{"name":string,"description":string}]}. ` +
    `Use the SRD/average HP. Keep each ability description under 20 words.`;

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent` +
      `?key=${config.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      // Don't let a slow API stall token creation.
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Partial<CreatureTemplate>;
    const creatureType = String(parsed.creatureType ?? 'unknown');
    return {
      name: name.trim(),
      creatureType,
      maxHp: Number(parsed.maxHp) > 0 ? Math.round(Number(parsed.maxHp)) : 10,
      resistances: Array.isArray(parsed.resistances)
        ? parsed.resistances.map(String)
        : [],
      weaknesses: Array.isArray(parsed.weaknesses)
        ? parsed.weaknesses.map(String)
        : [],
      abilities: Array.isArray(parsed.abilities)
        ? parsed.abilities
            .filter((a) => a && a.name)
            .map((a) => ({
              name: String(a.name),
              description: String(a.description ?? ''),
            }))
        : [],
      icon: iconForCreature(name, creatureType),
      source: 'gemini',
    };
  } catch {
    return null; // network/parse/timeout — degrade silently
  }
}
