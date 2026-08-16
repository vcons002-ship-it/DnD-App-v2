import type {
  Character,
  Condition,
  CreatureTemplate,
  Disposition,
  Monster,
  MonsterPublic,
  ObjectKind,
  StateSnapshot,
  Token,
} from '../../../shared/types';
import type { StatSheet } from '../components/StatBlock';

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
  // Public (HP-hidden) view: the server's `dead` flag is the ONLY defeat signal
  // this viewer gets — dropping it here is why players saw the death puff but
  // never the persistent skull.
  return {
    name: m.name,
    conditions: m.conditions,
    disposition: m.disposition,
    objectKind: m.objectKind,
    dead: m.dead,
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
  a.combatRole === b.combatRole &&
  a.shape === b.shape;

export const sameTokenDisplay = (a: TokenDisplay, b: TokenDisplay): boolean =>
  a.name === b.name &&
  a.curHp === b.curHp &&
  a.maxHp === b.maxHp &&
  a.tempHp === b.tempHp &&
  a.disposition === b.disposition &&
  a.objectKind === b.objectKind &&
  // Without this a player's enemy token never re-renders when it dies: HP is
  // hidden, position/conditions are unchanged, so `dead` is the only difference.
  a.dead === b.dead &&
  a.icon === b.icon &&
  sameConditions(a.conditions, b.conditions);

/**
 * Adapt an SRD / library / AI `CreatureTemplate` into the `StatSheet` shape
 * `StatBlock` renders, so a creature can be previewed BEFORE it exists as a row.
 * A template has no live state, so HP starts full and the fields a template
 * simply doesn't carry (id, temp HP, save proficiencies) are neutral defaults.
 *
 * Preview only: render it WITHOUT `onSave`, which is what makes `StatBlock`
 * read-only — there's nothing to save a patch to until the creature is added.
 */
export function templateToStatSheet(t: CreatureTemplate): StatSheet {
  return {
    id: '',
    name: t.name,
    level: t.level ?? 0,
    curHp: t.maxHp,
    maxHp: t.maxHp,
    tempHp: 0,
    armorClass: t.armorClass,
    speed: t.speed,
    stats: t.stats,
    resistances: t.resistances,
    weaknesses: t.weaknesses,
    saveProficiencies: [],
    weapons: t.weapons ?? [],
    actions: t.actions,
    abilities: t.abilities,
  };
}
