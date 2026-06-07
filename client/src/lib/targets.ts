import type { StateSnapshot, Token } from '../../../shared/types';

/**
 * The tokens a given attacker may target. Excludes the attacker's own token, and
 * for players excludes friendly creatures (allied PCs + friendly-disposition
 * monsters) — the DM may target anyone. Shared by weapon and spell attack UIs so
 * the target list can't drift between them.
 */
export function validTargets(snapshot: StateSnapshot, attacker: Token): Token[] {
  const isFriendly = (t: Token) => {
    if (t.kind === 'pc') return true;
    return snapshot.monsters.find((m) => m.id === t.refId)?.disposition === 'friendly';
  };
  return snapshot.tokens.filter(
    (t) => t.id !== attacker.id && (snapshot.role !== 'player' || !isFriendly(t)),
  );
}
