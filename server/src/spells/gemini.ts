import { config } from '../config.js';
import type { AbilityRoll, SheetAbility } from '../../../shared/types.js';
import { callGemini, geminiEnabled } from '../creatures/gemini.js';

export { geminiEnabled };

/** A local spell/ability entry shape (no id — assigned when added to a sheet). */
export type SpellLookup = Omit<SheetAbility, 'id'>;

function parseRoll(v: unknown): AbilityRoll | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const kind = r.kind;
  if (kind !== 'attack' && kind !== 'save' && kind !== 'damage' && kind !== 'heal') {
    return undefined;
  }
  const base = Number(r.baseLevel);
  return {
    kind,
    dice: typeof r.dice === 'string' && r.dice.trim() ? r.dice.trim() : undefined,
    scaleDice:
      typeof r.scaleDice === 'string' && r.scaleDice.trim() ? r.scaleDice.trim() : undefined,
    save: typeof r.save === 'string' && r.save.trim() ? r.save.toUpperCase().slice(0, 3) : undefined,
    damageType:
      typeof r.damageType === 'string' && r.damageType.trim() ? r.damageType.trim() : undefined,
    baseLevel: Number.isFinite(base) ? base : undefined,
  };
}

/**
 * Ask Gemini for a 5e spell or ability as structured JSON. Returns null when no
 * key is set, the request fails, or it can't be parsed — callers fall back
 * gracefully (the app never depends on AI being reachable).
 */
export async function lookupSpellAI(name: string): Promise<SpellLookup | null> {
  if (!config.geminiApiKey || !name.trim()) return null;

  const prompt =
    `Give the Dungeons & Dragons 5e spell or class ability named "${name}". ` +
    `Respond ONLY with minified JSON of shape ` +
    `{"name":string,"type":"spell"|"ability","level":number,"school":string,` +
    `"meta":string,"description":string,` +
    `"roll":{"kind":"attack"|"save"|"damage"|"heal","dice":string,"scaleDice":string,` +
    `"save":string,"damageType":string,"baseLevel":number}}. ` +
    `"type" is "spell" for spells, "ability" for class/racial features. ` +
    `"level" is the spell level (0 for a cantrip); omit for non-spell abilities. ` +
    `"meta" is a short line like "1 action · 120 ft · V,S". ` +
    `Include "roll" ONLY if the spell/ability rolls dice: "kind" is "attack" ` +
    `(spell attack roll + damage), "save" (target rolls a save vs your DC, e.g. ` +
    `"DEX"), "damage" (auto-hit damage), or "heal". "dice" is the base damage/heal ` +
    `at "baseLevel" (e.g. "8d6"); "scaleDice" is added per slot level above base ` +
    `(or per cantrip tier), e.g. "1d6". "baseLevel" is the spell's base level (0 for ` +
    `a cantrip). Omit "roll" for purely descriptive entries. Keep the description ` +
    `under 50 words.`;

  const text = await callGemini(prompt);
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Record<string, unknown>;
    const type = p.type === 'ability' ? 'ability' : 'spell';
    const level = Number(p.level);
    return {
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : name.trim(),
      type,
      level: type === 'spell' && Number.isFinite(level) ? Math.max(0, Math.floor(level)) : undefined,
      school: typeof p.school === 'string' ? p.school : undefined,
      meta: typeof p.meta === 'string' ? p.meta : undefined,
      description: typeof p.description === 'string' ? p.description : '',
      roll: parseRoll(p.roll),
      source: 'gemini',
    };
  } catch (err) {
    console.warn(`  [gemini] spell parse error for "${name}":`, (err as Error).message);
    return null;
  }
}
