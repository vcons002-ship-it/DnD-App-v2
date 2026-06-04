import {
  getActiveMapId,
  getMap,
  getSessionById,
  listCharacters,
  listMaps,
  listMonsters,
  listMonsterTemplates,
  listTokens,
} from './sessions.js';
import type {
  Monster,
  MonsterNeutral,
  MonsterPublic,
  Role,
  StateSnapshot,
  Token,
} from '../../shared/types.js';

/**
 * Shape a monster for a player according to its disposition:
 * - friendly: full stat block
 * - neutral:  name + HP + type + AC (+ conditions/icon)
 * - enemy:    name + conditions + icon only (default)
 */
function toPlayerMonster(
  m: Monster,
): Monster | MonsterNeutral | MonsterPublic {
  if (m.disposition === 'friendly') return m;
  const base: MonsterPublic = {
    id: m.id,
    name: m.name,
    conditions: m.conditions,
    disposition: m.disposition,
    icon: m.icon,
  };
  if (m.disposition === 'neutral') {
    return {
      ...base,
      curHp: m.curHp,
      maxHp: m.maxHp,
      creatureType: m.creatureType,
      armorClass: m.armorClass,
    };
  }
  return base;
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
  // Fall back to the active map if the requested one is gone (e.g. the DM was
  // viewing a map that just got deleted).
  const map =
    (viewMapId ? getMap(viewMapId) : null) ??
    (role === 'dm' && activeMapId ? getMap(activeMapId) : null);

  let tokens: Token[] = map ? listTokens(map.id) : [];
  let monsters: (Monster | MonsterNeutral | MonsterPublic)[] =
    listMonsters(sessionId);

  if (role === 'player') {
    // Individually-hidden tokens, and (in either fog mode) any token sitting
    // under a covered cell, are never sent to players.
    const revealed = new Set(map?.fogRevealed ?? []);
    const grid = map?.gridSizePx ?? 50;
    const fogOn = map?.fogMode === 'map' || map?.fogMode === 'tokens';
    const covered = (t: Token) =>
      fogOn &&
      !revealed.has(`${Math.floor(t.x / grid)},${Math.floor(t.y / grid)}`);
    tokens = tokens.filter((t) => !t.isHidden && !covered(t));
    monsters = monsters.map((m) => toPlayerMonster(m as Monster));
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
    // Spawn templates are a DM-only tool.
    monsterTemplates: role === 'dm' ? listMonsterTemplates(sessionId) : [],
  };
}
