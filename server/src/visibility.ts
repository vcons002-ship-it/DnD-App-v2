import {
  getActiveMapId,
  getMap,
  getSessionById,
  listCharacters,
  listMaps,
  listMonsters,
  listTokens,
} from './sessions.js';
import type {
  Monster,
  MonsterPublic,
  Role,
  StateSnapshot,
  Token,
} from '../../shared/types.js';

/** Strip a monster down to what players are allowed to see: name + conditions. */
function toPublicMonster(m: Monster): MonsterPublic {
  return { id: m.id, name: m.name, conditions: m.conditions };
}

/**
 * Build a role-shaped snapshot. This is the single security boundary:
 * players never receive hidden tokens or full monster stats, and they only
 * ever see the session's active map regardless of what they request.
 */
export function buildSnapshot(
  sessionId: string,
  role: Role,
  /** DM's currently-selected (possibly staging) map; ignored for players. */
  dmViewMapId?: string | null,
): StateSnapshot | null {
  const session = getSessionById(sessionId);
  if (!session) return null;

  const activeMapId = getActiveMapId(sessionId);
  const maps = listMaps(sessionId);
  const characters = listCharacters(sessionId);

  // Players are locked to the active map; the DM may view any map for prep.
  const viewMapId =
    role === 'dm' ? dmViewMapId ?? activeMapId : activeMapId;
  const map = viewMapId ? getMap(viewMapId) : null;

  let tokens: Token[] = map ? listTokens(map.id) : [];
  let monsters: (Monster | MonsterPublic)[] = listMonsters(sessionId);

  if (role === 'player') {
    // Hidden tokens, and (when fog is on) any token sitting under a covered
    // cell, are never sent to players.
    const revealed = new Set(map?.fogRevealed ?? []);
    const grid = map?.gridSizePx ?? 50;
    const covered = (t: Token) =>
      !!map?.fogEnabled &&
      !revealed.has(`${Math.floor(t.x / grid)},${Math.floor(t.y / grid)}`);
    tokens = tokens.filter((t) => !t.isHidden && !covered(t));
    monsters = monsters.map((m) => toPublicMonster(m as Monster));
  }

  return {
    role,
    sessionCode: session.code,
    map,
    activeMapId,
    activeTurnTokenId: session.activeTurnTokenId,
    // Players don't need the full map list (DM-only prep tool).
    maps: role === 'dm' ? maps : map ? [map] : [],
    tokens,
    characters,
    monsters,
  };
}
