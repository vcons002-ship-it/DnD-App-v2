import type {Condition,Disposition,ObjectKind,Monster,MonsterPublic,StateSnapshot,Token} from './types.js';

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
  /** Defeated. For an enemy a player can't see HP for, this is the SERVER's
   *  `dead` flag (visibility.ts) — the only way that viewer can know, so it must
   *  survive into the display or the death marker never renders for them. */
  dead?: boolean;
  /** Token art (emoji or "/uploads/…"); empty for the default circle. */
  icon: string;
};

type AnyMonster = Monster | MonsterPublic;
export type TokenEntityIndex={characters:ReadonlyMap<string,StateSnapshot['characters'][number]>;monsters:ReadonlyMap<string,AnyMonster>};
/** Only the full (friendly) monster view carries HP; the public view does not. */
const hasHp = (m: AnyMonster): m is Monster => 'maxHp' in m;

/** Resolve a token's referenced character/monster into display fields. */
export function resolveToken(
  snapshot: StateSnapshot,
  token: Token,
  index?:TokenEntityIndex,
): TokenDisplay {
  const withMarks=(conditions:Condition[]):Condition[]=>token.markLabels?.length?
    [...conditions,...token.markLabels.map(label=>({id:`spell-mark:${label}`,label,aura:'green' as const,isConcentration:false}))]:conditions;
  if (token.kind === 'pc') {
    const c = index?index.characters.get(token.refId):snapshot.characters.find((x) => x.id === token.refId);
    if (!c) return { name: 'Unknown', conditions: [], icon: '' };
    return {
      name: c.name,
      curHp: c.curHp,
      maxHp: c.maxHp,
      tempHp: c.tempHp,
      dead: c.deathSaves.failures >= 3 || c.conditions.some(c => c.label.trim().toLowerCase() === 'dead'),
      conditions: withMarks(c.conditions),
      icon: c.icon,
    };
  }
  const m = index?index.monsters.get(token.refId):snapshot.monsters.find((x) => x.id === token.refId);
  if (!m) return { name: 'Unknown', conditions: [], icon: '' };
  if (hasHp(m)) {
    const force=m.objectKind==='other'&&m.modelType==='spiritual-weapon';
    return {
      name: m.name,
      curHp: force?undefined:m.curHp,
      maxHp: force?undefined:m.maxHp,
      tempHp: force?undefined:m.tempHp,
      conditions: withMarks(m.conditions),
      disposition: m.disposition,
      objectKind: m.objectKind,
      dead: !m.objectKind && (m.curHp <= 0 || m.conditions.some(c => c.label.trim().toLowerCase() === 'dead')),
      icon: m.icon,
    };
  }
  // Public (HP-hidden) view: the server's `dead` flag is the ONLY defeat signal
  // this viewer gets — dropping it here is why players saw the death puff but
  // never the persistent skull.
  return {
    name: m.name,
    conditions: withMarks(m.conditions),
    disposition: m.disposition,
    objectKind: m.objectKind,
    dead: !m.objectKind && (m.dead || m.conditions.some(c => c.label.trim().toLowerCase() === 'dead')),
    icon: m.icon,
  };
}
