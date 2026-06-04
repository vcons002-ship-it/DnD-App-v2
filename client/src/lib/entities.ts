import type {
  Character,
  Condition,
  Monster,
  MonsterPublic,
  StateSnapshot,
  Token,
} from '../../../shared/types';

export type TokenDisplay = {
  name: string;
  /** Undefined when the viewer isn't allowed to see HP (players vs monsters). */
  curHp?: number;
  maxHp?: number;
  conditions: Condition[];
};

const isFullMonster = (m: Monster | MonsterPublic): m is Monster =>
  'maxHp' in m;

/** Resolve a token's referenced character/monster into display fields. */
export function resolveToken(
  snapshot: StateSnapshot,
  token: Token,
): TokenDisplay {
  if (token.kind === 'pc') {
    const c = snapshot.characters.find((x) => x.id === token.refId);
    if (!c) return { name: 'Unknown', conditions: [] };
    return {
      name: c.name,
      curHp: c.curHp,
      maxHp: c.maxHp,
      conditions: c.conditions,
    };
  }
  const m = snapshot.monsters.find((x) => x.id === token.refId);
  if (!m) return { name: 'Unknown', conditions: [] };
  if (isFullMonster(m)) {
    return {
      name: m.name,
      curHp: m.curHp,
      maxHp: m.maxHp,
      conditions: m.conditions,
    };
  }
  return { name: m.name, conditions: m.conditions };
}

export const findCharacter = (
  snapshot: StateSnapshot,
  id: string,
): Character | undefined => snapshot.characters.find((c) => c.id === id);
