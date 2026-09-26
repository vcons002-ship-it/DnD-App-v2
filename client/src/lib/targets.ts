import { tokenDistanceFt } from '../../../shared/distance';
import { resolveToken } from './entities';
import type { StateSnapshot, Token } from '../../../shared/types';

/**
 * The tokens a given attacker may target. Excludes the attacker's own token, and
 * for players excludes friendly creatures (allied PCs + friendly-disposition
 * monsters) — the DM may target anyone. Shared by weapon and spell attack UIs so
 * the target list can't drift between them.
 */
export function validTargets(snapshot: StateSnapshot, attacker: Token): Token[] {
  return snapshot.tokens.filter(
    (t) =>
      t.mapId === attacker.mapId && t.id !== attacker.id &&
      (snapshot.role !== 'player' || !isFriendly(snapshot, t)),
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
export function healTargets(snapshot: StateSnapshot, caster: Token): Token[] {
  return [
    caster,
    ...snapshot.tokens.filter(
      (t) =>
        t.id !== caster.id &&
        (snapshot.role !== 'player' || isFriendly(snapshot, t)),
    ),
  ];
}

/** Uses only the viewer's snapshot: never derives hidden monster numbers. */
export function targetLabel(snapshot: StateSnapshot, token: Token, origin?: Token): string {
  const name = `${resolveToken(snapshot, token).name}${token.revealTag ? ` ${token.revealTag}` : ''}`;
  return origin ? `${name} · ${Math.round(tokenDistanceFt(origin, token, snapshot.map) * 10) / 10} ft` : name;
}
