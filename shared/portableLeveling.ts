import type { AbilityKey } from './skills.js';
import type { CharacterLeveling, LevelUpChoices, LevelUpRecord } from './levelingTypes.js';

const abilities: AbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 160;
const names = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(text);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Copy completed advancement only. A grant belongs to its original character
 * and cannot be transferred through a library entry or a sheet import. */
export function portableLeveling(value: unknown): CharacterLeveling | undefined {
  if (!object(value) || value.rules !== '2024' || !Array.isArray(value.history)) return undefined;
  const history: LevelUpRecord[] = [];
  const ids = new Set<string>();
  for (const record of value.history.slice(0, 100)) {
    if (!object(record) || !text(record.id) || !record.id || ids.has(record.id) ||
        !Number.isInteger(record.fromLevel) || Number(record.fromLevel) < 1 || Number(record.fromLevel) >= 20 ||
        record.toLevel !== Number(record.fromLevel) + 1 || !Number.isInteger(record.hpGain) || Number(record.hpGain) < 1 ||
        typeof record.at !== 'number' || !Number.isFinite(record.at) || !object(record.choices) ||
        !['fixed', 'roll'].includes(String(record.choices.hpMethod))) continue;
    const raw = record.choices;
    const choices: LevelUpChoices = { hpMethod: raw.hpMethod as LevelUpChoices['hpMethod'] };
    if (text(raw.subclass)) choices.subclass = raw.subclass;
    if (text(raw.featName)) choices.featName = raw.featName;
    if (abilities.includes(raw.featAbility as AbilityKey)) choices.featAbility = raw.featAbility as AbilityKey;
    if (object(raw.asi)) choices.asi = Object.fromEntries(Object.entries(raw.asi)
      .filter(([key, amount]) => abilities.includes(key as AbilityKey) && (amount === 1 || amount === 2)));
    for (const key of ['spellNames', 'cantripNames', 'replaceSpellIds'] as const)
      if (names(raw[key])) choices[key] = [...raw[key]];
    if (object(raw.featureSelections)) choices.featureSelections = Object.fromEntries(Object.entries(raw.featureSelections)
      .slice(0, 30).filter(([key, selected]) => text(key) && names(selected)).map(([key, selected]) => [key, [...selected as string[]]]));
    history.push({ id: record.id, fromLevel: Number(record.fromLevel), toLevel: Number(record.toLevel),
      hpGain: Number(record.hpGain), at: record.at, choices });
    ids.add(record.id);
  }
  return { rules: '2024', history };
}

/** Import may add historical notes, but never replace server receipts or turn a
 * currently pending grant into a completed receipt. */
export function mergePortableLeveling(existing: CharacterLeveling | undefined, input: unknown): CharacterLeveling | undefined {
  const incoming = portableLeveling(input);
  if (!incoming) return existing;
  if (!existing) return incoming;
  const retainedIds = new Set(existing.history.map(record => record.id));
  if (existing.pending) retainedIds.add(existing.pending.id);
  return { ...existing, history: [...existing.history, ...incoming.history.filter(record => !retainedIds.has(record.id))] };
}
