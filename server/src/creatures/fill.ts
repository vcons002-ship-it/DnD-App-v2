import type {
  Character,
  CharacterUpdatePayload,
  Monster,
  MonsterUpdatePayload,
} from '../../../shared/types.js';
import {
  createCharacter,
  getCharacter,
  getMonster,
  updateCharacter,
  updateMonster,
} from '../sessions.js';
import {
  generateCharacterAI,
  geminiEnabled,
  lookupCreatureAI,
} from './gemini.js';

export type FillResult =
  | { ok: true; filled: number; id: string }
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
  if (m.level === 0 && (tpl.level ?? 0) > 0) patch.level = tpl.level;
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
  // Free-text actions fold into the merged system via updateMonster (weapon-like
  // → weapons, the rest → sheetAbilities) — only when there's nothing rollable yet.
  if (
    (m.sheetAbilities.length === 0 || m.weapons.length === 0) &&
    tpl.actions.length > 0
  )
    patch.actions = tpl.actions;
  if (m.abilities.length === 0 && tpl.abilities.length > 0)
    patch.abilities = tpl.abilities;
  if (m.sheetAbilities.length === 0 && (tpl.sheetAbilities?.length ?? 0) > 0)
    patch.sheetAbilities = tpl.sheetAbilities;

  const filled = Object.keys(patch).length - 1; // minus monsterId
  if (filled === 0) return { ok: false, reason: 'nothing' };
  updateMonster(monsterId, patch);
  return { ok: true, filled, id: monsterId };
}

/** Back-fill ONLY the empty fields of a character from an AI-generated sheet. */
export async function aiFillCharacter(characterId: string): Promise<FillResult> {
  const c = getCharacter(characterId);
  if (!c) return { ok: false, reason: 'not-found' };
  if (!geminiEnabled()) return { ok: false, reason: 'no-key' };

  const desc = [c.name, c.className, c.level ? `level ${c.level}` : '']
    .filter(Boolean)
    .join(', ');
  const gen = await generateCharacterAI(desc || c.name);
  if (!gen) return { ok: false, reason: 'lookup-failed' };

  const patch: CharacterUpdatePayload = { characterId };
  if (!c.race && gen.race) patch.race = gen.race;
  if (!c.className && gen.className) patch.className = gen.className;
  if (c.armorClass === 0 && gen.armorClass > 0) patch.armorClass = gen.armorClass;
  if (!c.speed && gen.speed) patch.speed = gen.speed;
  if (Object.keys(c.stats).length === 0 && Object.keys(gen.stats).length > 0)
    patch.stats = gen.stats;
  if (c.resistances.length === 0 && gen.resistances.length > 0)
    patch.resistances = gen.resistances;
  if (c.weaknesses.length === 0 && gen.weaknesses.length > 0)
    patch.weaknesses = gen.weaknesses;
  if (c.weapons.length === 0 && gen.weapons.length > 0) patch.weapons = gen.weapons;
  if (c.actions.length === 0 && gen.actions.length > 0) patch.actions = gen.actions;
  if (c.abilities.length === 0 && gen.abilities.length > 0)
    patch.abilities = gen.abilities;
  if (c.proficientSkills.length === 0 && gen.proficientSkills.length > 0)
    patch.proficientSkills = gen.proficientSkills;
  if (c.sheetAbilities.length === 0 && gen.sheetAbilities.length > 0)
    patch.sheetAbilities = gen.sheetAbilities;

  const filled = Object.keys(patch).length - 1;
  if (filled === 0) return { ok: false, reason: 'nothing' };
  updateCharacter(characterId, patch);
  return { ok: true, filled, id: characterId };
}

export type CreateResult =
  | { ok: true; character: Character }
  | { ok: false; reason: 'no-key' | 'lookup-failed' };

/** Generate a whole character/NPC from a free-text description and create it. */
export async function aiCreateCharacter(
  sessionId: string,
  description: string,
): Promise<CreateResult> {
  if (!geminiEnabled()) return { ok: false, reason: 'no-key' };
  const gen = await generateCharacterAI(description);
  if (!gen) return { ok: false, reason: 'lookup-failed' };
  const character = createCharacter(sessionId, gen);
  return { ok: true, character };
}
