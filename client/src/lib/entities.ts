import type {
  Character,
  Condition,
  CreatureTemplate,
  StateSnapshot,
  Token,
} from '../../../shared/types';
import type { StatSheet } from '../components/StatBlock';

import {resolveToken as sharedResolve,type TokenEntityIndex} from '../../../shared/tokenDisplay';
const characterIndexes=new WeakMap<StateSnapshot['characters'],TokenEntityIndex['characters']>();
const monsterIndexes=new WeakMap<StateSnapshot['monsters'],TokenEntityIndex['monsters']>();
export function tokenEntityIndex(snapshot:StateSnapshot):TokenEntityIndex{
 let characters=characterIndexes.get(snapshot.characters);if(!characters){characters=new Map(snapshot.characters.map(c=>[c.id,c]));characterIndexes.set(snapshot.characters,characters);}
 let monsters=monsterIndexes.get(snapshot.monsters);if(!monsters){monsters=new Map(snapshot.monsters.map(m=>[m.id,m]));monsterIndexes.set(snapshot.monsters,monsters);}
 return {characters,monsters};
}
/** Read current fields even when a caller updates an entity in place. */
export function resolveToken(snapshot:StateSnapshot,token:Token):TokenDisplay{
 return sharedResolve(snapshot,token,tokenEntityIndex(snapshot));
}
export type {TokenDisplay} from '../../../shared/tokenDisplay';
import type {TokenDisplay} from '../../../shared/tokenDisplay';

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

const sameStringArray = (a?: string[], b?: string[]): boolean => {
  if (a === b) return true;
  const la = a?.length ?? 0, lb = b?.length ?? 0;
  if (la !== lb) return false;
  for (let i = 0; i < la; i++) if (a![i] !== b![i]) return false;
  return true;
};

export const sameTokenFields = (a: Token, b: Token): boolean =>
  a.x === b.x &&
  a.y === b.y &&
  a.facing === b.facing &&
  a.id === b.id &&
  a.kind === b.kind &&
  a.refId === b.refId &&
  a.sharedSightOnly === b.sharedSightOnly &&
  a.invisible === b.invisible &&
  a.revealTag === b.revealTag &&
  a.widthFt === b.widthFt &&
  a.miniatureWidthFt === b.miniatureWidthFt &&
  a.isHidden === b.isHidden &&
  a.combatRole === b.combatRole &&
  a.shape === b.shape &&
  sameStringArray(a.markLabels, b.markLabels);

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
  a.deathSaves?.successes === b.deathSaves?.successes &&
  a.deathSaves?.failures === b.deathSaves?.failures &&
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
    immunities: t.immunities,
    weaknesses: t.weaknesses,
    saveProficiencies: [],
    weapons: t.weapons ?? [],
    actions: t.actions,
    abilities: t.abilities,
  };
}
