import type {
  Character,
  Condition,
  Disposition,
  Monster,
  MonsterPublic,
  ObjectKind,
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
  /** Non-combat object kind (chest/door/…), undefined for creatures/PCs. */
  objectKind?: ObjectKind;
  /** Token art (emoji or "/uploads/…"); empty for the default circle. */
  icon: string;
};

type AnyMonster = Monster | MonsterPublic;
/** Only the full (friendly) monster view carries HP; the public view does not. */
const hasHp = (m: AnyMonster): m is Monster => 'maxHp' in m;

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
      objectKind: m.objectKind,
      icon: m.icon,
    };
  }
  return {
    name: m.name,
    conditions: m.conditions,
    disposition: m.disposition,
    objectKind: m.objectKind,
    icon: m.icon,
  };
}

export const findCharacter = (
  snapshot: StateSnapshot,
  id: string,
): Character | undefined => snapshot.characters.find((c) => c.id === id);

// ---- Content comparators for React.memo ----
// Every snapshot broadcast rebuilds the token/display objects, so memoized
// renderers (TokenShape, the Data view cards) compare the rendered fields
// instead of object identity.

export const sameConditions = (a: Condition[], b: Condition[]): boolean =>
  a.length === b.length &&
  a.every(
    (c, i) =>
      c.id === b[i].id &&
      c.label === b[i].label &&
      c.aura === b[i].aura &&
      c.isConcentration === b[i].isConcentration &&
      c.customText === b[i].customText,
  );

export const sameTokenFields = (a: Token, b: Token): boolean =>
  a.id === b.id &&
  a.kind === b.kind &&
  a.refId === b.refId &&
  a.x === b.x &&
  a.y === b.y &&
  a.widthFt === b.widthFt &&
  a.isHidden === b.isHidden &&
  a.combatRole === b.combatRole;

export const sameTokenDisplay = (a: TokenDisplay, b: TokenDisplay): boolean =>
  a.name === b.name &&
  a.curHp === b.curHp &&
  a.maxHp === b.maxHp &&
  a.tempHp === b.tempHp &&
  a.disposition === b.disposition &&
  a.objectKind === b.objectKind &&
  a.icon === b.icon &&
  sameConditions(a.conditions, b.conditions);
