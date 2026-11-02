import { attackAdvantage, evaluateAttackContext } from '../../../shared/conditionEffects';
import type { Advantage } from '../../../shared/dice';
import { tokenDistanceFt, tokensWithin5ft } from '../../../shared/distance';
import { hasLineOfSight } from '../../../shared/mapWalls';
import { visionContains } from '../../../shared/playerVision';
import { resolveToken, tokenEntityIndex } from './entities';
import type { StateSnapshot, Token } from '../../../shared/types';

/**
 * The tokens a given attacker may target. Excludes the attacker's own token, and
 * for players excludes friendly creatures (allied PCs + friendly-disposition
 * monsters) — the DM may target anyone. Shared by weapon and spell attack UIs so
 * the target list can't drift between them.
 */
function eligible(snapshot:StateSnapshot,attacker:Token,showDead:boolean){
 const entities=tokenEntityIndex(snapshot);
 const tokens=snapshot.tokens.filter(t=>t.id!==attacker.id&&t.mapId===attacker.mapId&&
  !(snapshot.role==='player'&&t.sharedSightOnly)&&
  !(t.kind==='monster'&&entities.monsters.get(t.refId)?.modelType==='spiritual-weapon')&&
  (showDead||!resolveToken(snapshot,t).dead)&&hasLineOfSight(attacker,t,snapshot.map?.walls)&&
  (snapshot.role!=='player'||visionContains(snapshot.playerVision,t.x,t.y)));
 return tokens;
}
function attackList(snapshot:StateSnapshot,attacker:Token,tokens:Token[]){
 return tokens.filter(t=>snapshot.role!=='player'||!isFriendly(snapshot,t))
  .sort((a,b)=>tokenDistanceFt(attacker,a,snapshot.map)-tokenDistanceFt(attacker,b,snapshot.map)||targetLabel(snapshot,a).localeCompare(targetLabel(snapshot,b)));
}
export function validTargets(snapshot:StateSnapshot,attacker:Token,showDead=false){return attackList(snapshot,attacker,eligible(snapshot,attacker,showDead));}
/** Combat uses this once per relevant update, sharing its wall/vision checks
 * between attack and heal controls without retaining stale entity results. */
export function targetLists(snapshot:StateSnapshot,attacker:Token,showDead=false){
 const tokens=eligible(snapshot,attacker,showDead);
 return {attack:attackList(snapshot,attacker,tokens),heal:[...((showDead||!resolveToken(snapshot,attacker).dead)?[attacker]:[]),...tokens.filter(t=>snapshot.role!=='player'||isFriendly(snapshot,t))]};
}

const isFriendly = (snapshot: StateSnapshot, t: Token): boolean => {
  if (t.kind === 'pc') return true;
  return tokenEntityIndex(snapshot).monsters.get(t.refId)?.disposition === 'friendly';
};

/**
 * The tokens a caster may HEAL: themselves first (the default), then allies
 * (PCs + friendly creatures). The DM may heal anyone. Mirror of `validTargets`
 * so the heal dropdown can't drift from the attack one.
 */
export function healTargets(snapshot: StateSnapshot, caster: Token, showDead = false): Token[] {
  return [
    ...((showDead || !resolveToken(snapshot, caster).dead) ? [caster] : []),
    ...eligible(snapshot,caster,showDead).filter(t=>snapshot.role!=='player'||isFriendly(snapshot,t)),
  ];
}

/** Uses only the viewer's snapshot: never derives hidden monster numbers. */
export function targetLabel(snapshot: StateSnapshot, token: Token, origin?: Token): string {
  const name = `${resolveToken(snapshot, token).name}${token.revealTag ? ` ${token.revealTag}` : ''}`;
  return origin ? `${name} · ${Math.round(tokenDistanceFt(origin, token, snapshot.map) * 10) / 10} ft` : name;
}

/** Preview automatic + manual advantage/disadvantage reasons for an attack against a target. */
export function previewAttackAdvantage(
  snapshot: StateSnapshot,
  attacker: Token,
  target?: Token,
  manual?: Advantage,
): { state?: Advantage; reasons: string[] } {
  const entities = tokenEntityIndex(snapshot);
  const attackerEnt = attacker.kind === 'pc' ? entities.characters.get(attacker.refId) : entities.monsters.get(attacker.refId);
  const targetEnt = target
    ? target.kind === 'pc'
      ? entities.characters.get(target.refId)
      : entities.monsters.get(target.refId)
    : undefined;
  const attackerConds = attackerEnt?.conditions ?? resolveToken(snapshot, attacker).conditions;
  const targetConds = target ? (targetEnt?.conditions ?? resolveToken(snapshot, target).conditions) : [];
  if (!target) {
    return attackAdvantage(
      attackerConds.filter((c) => !c.isConcentration).map((c) => c.label),
      [],
      false,
      manual,
    );
  }
  const within5ft = tokensWithin5ft(attacker, target, snapshot.map);
  const distanceFt = tokenDistanceFt(attacker, target, snapshot.map);
  return evaluateAttackContext({
    attackerConditions: attackerConds,
    targetConditions: targetConds,
    attackerEntity: {
      conditions: attackerConds,
      abilities: attackerEnt && 'abilities' in attackerEnt ? attackerEnt.abilities : undefined,
      sheetAbilities: attackerEnt && 'sheetAbilities' in attackerEnt ? attackerEnt.sheetAbilities : undefined,
    },
    targetEntity: {
      conditions: targetConds,
      abilities: targetEnt && 'abilities' in targetEnt ? targetEnt.abilities : undefined,
      sheetAbilities: targetEnt && 'sheetAbilities' in targetEnt ? targetEnt.sheetAbilities : undefined,
    },
    within5ft,
    distanceFt,
    manual,
    targetTokenId: target.id,
    includeArmedManeuvers: true,
  }).adv;
}
