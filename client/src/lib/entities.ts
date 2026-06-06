import type {
  Character,
  Condition,
  Disposition,
  Monster,
  MonsterNeutral,
  MonsterPublic,
  StateSnapshot,
  Token,
} from '../../../shared/types';

export type TokenDisplay = {
  name: string;
  /** Undefined when the viewer isn't allowed to see HP (players vs monsters). */
  curHp?: number;
  maxHp?: number;
  /** Temporary HP buffer pool (undefined/0 when none or HP isn't visible). */
  tempHp?: number;
  conditions: Condition[];
  /** Monster disposition (undefined for PCs) — drives the battlefield dot. */
  disposition?: Disposition;
  /** Token art (emoji or "/uploads/…"); empty for the default circle. */
  icon: string;
};

type AnyMonster = Monster | MonsterNeutral | MonsterPublic;
/** Full or neutral monster views carry HP; the enemy (public) view does not. */
const hasHp = (m: AnyMonster): m is Monster | MonsterNeutral => 'maxHp' in m;

/** Resolve a token's referenced character/monster into display fields. */
export function resolveToken(
  snapshot: StateSnapshot,
  token: Token,
): TokenDisplay {
  if (token.kind === 'pc') {
    const c = snapshot.characters.find((x) => x.id === token.refId);
    if (!c) return { name: 'Unknown', conditions: [], icon: '' };
    return {
      name: c.name,
      curHp: c.curHp,
      maxHp: c.maxHp,
      tempHp: c.tempHp,
      conditions: c.conditions,
      icon: c.icon,
    };
  }
  const m = snapshot.monsters.find((x) => x.id === token.refId);
  if (!m) return { name: 'Unknown', conditions: [], icon: '' };
  if (hasHp(m)) {
    return {
      name: m.name,
      curHp: m.curHp,
      maxHp: m.maxHp,
      tempHp: m.tempHp,
      conditions: m.conditions,
      disposition: m.disposition,
      icon: m.icon,
    };
  }
  return {
    name: m.name,
    conditions: m.conditions,
    disposition: m.disposition,
    icon: m.icon,
  };
}

export const findCharacter = (
  snapshot: StateSnapshot,
  id: string,
): Character | undefined => snapshot.characters.find((c) => c.id === id);
