import { tokenDistanceFt } from '../../../shared/distance';
import {hasLineOfSight} from '../../../shared/mapWalls';
import {visionContains} from '../../../shared/playerVision';
import { resolveToken } from './entities';
import type { StateSnapshot, Token } from '../../../shared/types';

/**
 * The tokens a given attacker may target. Excludes the attacker's own token, and
 * for players excludes friendly creatures (allied PCs + friendly-disposition
 * monsters) — the DM may target anyone. Shared by weapon and spell attack UIs so
 * the target list can't drift between them.
 */
export function validTargets(snapshot: StateSnapshot, attacker: Token, showDead = false): Token[] {
  return snapshot.tokens.filter(
    (t) =>
      t.mapId === attacker.mapId && t.id !== attacker.id &&
      !(t.kind==='monster'&&snapshot.monsters.find(m=>m.id===t.refId)?.modelType==='spiritual-weapon') &&
      (showDead || !resolveToken(snapshot, t).dead) &&
      hasLineOfSight(attacker,t,snapshot.map?.walls) &&
      (snapshot.role!=='player'||visionContains(snapshot.playerVision,t.x,t.y)) &&
      (snapshot.role !== 'player' || (!t.sharedSightOnly && !isFriendly(snapshot, t))),
  ).sort((a, b) => tokenDistanceFt(attacker, a, snapshot.map) - tokenDistanceFt(attacker, b, snapshot.map) || targetLabel(snapshot, a).localeCompare(targetLabel(snapshot, b)));
}

const isFriendly = (snapshot: StateSnapshot, t: Token): boolean => {
  if (t.kind === 'pc') return true;
  return snapshot.monsters.find((m) => m.id === t.refId)?.disposition === 'friendly';
};

/**
 * The tokens a caster may HEAL: themselves first (the default), then allies
 * (PCs + friendly creatures). The DM may heal anyone. Mirror of `validTargets`
 * so the heal dropdown can't drift from the attack one.
 */
export function healTargets(snapshot: StateSnapshot, caster: Token, showDead = false): Token[] {
  return [
    ...((showDead || !resolveToken(snapshot, caster).dead) ? [caster] : []),
    ...snapshot.tokens.filter(
      (t) =>
        t.id !== caster.id && t.mapId === caster.mapId &&
        !(t.kind==='monster'&&snapshot.monsters.find(m=>m.id===t.refId)?.modelType==='spiritual-weapon') &&
        (showDead || !resolveToken(snapshot, t).dead) &&
        hasLineOfSight(caster,t,snapshot.map?.walls) &&
        (snapshot.role!=='player'||visionContains(snapshot.playerVision,t.x,t.y)) &&
        (snapshot.role !== 'player' || (!t.sharedSightOnly && isFriendly(snapshot, t))),
    ),
  ];
}

/** Uses only the viewer's snapshot: never derives hidden monster numbers. */
export function targetLabel(snapshot: StateSnapshot, token: Token, origin?: Token): string {
  const name = `${resolveToken(snapshot, token).name}${token.revealTag ? ` ${token.revealTag}` : ''}`;
  return origin ? `${name} · ${Math.round(tokenDistanceFt(origin, token, snapshot.map) * 10) / 10} ft` : name;
}
