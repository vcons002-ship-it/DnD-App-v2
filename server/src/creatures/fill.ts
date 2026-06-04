import type { Monster, MonsterUpdatePayload } from '../../../shared/types.js';
import { getMonster, updateMonster } from '../sessions.js';
import { geminiEnabled, lookupCreatureAI } from './gemini.js';

export type FillResult =
  | { ok: true; filled: number; monster: Monster }
  | { ok: false; reason: 'no-key' | 'lookup-failed' | 'not-found' | 'nothing' };

/**
 * Back-fill ONLY the empty fields of a creature from an AI stat block, never
 * overwriting DM-entered data. Returns how many fields were filled.
 */
export async function aiFillCreature(monsterId: string): Promise<FillResult> {
  const m = getMonster(monsterId);
  if (!m) return { ok: false, reason: 'not-found' };
  if (!geminiEnabled()) return { ok: false, reason: 'no-key' };

  const tpl = await lookupCreatureAI(m.name);
  if (!tpl) return { ok: false, reason: 'lookup-failed' };

  const patch: MonsterUpdatePayload = { monsterId };
  if (!m.creatureType && tpl.creatureType) patch.creatureType = tpl.creatureType;
  if (m.maxHp <= 1 && tpl.maxHp > 1) patch.maxHp = tpl.maxHp;
  if (m.armorClass === 0 && tpl.armorClass > 0) patch.armorClass = tpl.armorClass;
  if (!m.speed && tpl.speed) patch.speed = tpl.speed;
  if (Object.keys(m.stats).length === 0 && Object.keys(tpl.stats).length > 0)
    patch.stats = tpl.stats;
  if (m.resistances.length === 0 && tpl.resistances.length > 0)
    patch.resistances = tpl.resistances;
  if (m.weaknesses.length === 0 && tpl.weaknesses.length > 0)
    patch.weaknesses = tpl.weaknesses;
  if (m.weapons.length === 0 && (tpl.weapons?.length ?? 0) > 0)
    patch.weapons = tpl.weapons;
  if (m.actions.length === 0 && tpl.actions.length > 0) patch.actions = tpl.actions;
  if (m.abilities.length === 0 && tpl.abilities.length > 0)
    patch.abilities = tpl.abilities;

  const filled = Object.keys(patch).length - 1; // minus monsterId
  if (filled === 0) return { ok: false, reason: 'nothing' };
  const monster = updateMonster(monsterId, patch)!;
  return { ok: true, filled, monster };
}
