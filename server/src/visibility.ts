import {
  getActiveMapId,
  getCharacter,
  getMap,
  getMonster,
  getSessionById,
  listCharacters,
  listMaps,
  listMeasurements,
  listMonsters,
  listMonsterTemplates,
  listRollLog,
  listChat,
  listTokens,
} from './sessions.js';
import type {
  CombatRole,
  Monster,
  MonsterNeutral,
  MonsterPublic,
  Role,
  StateSnapshot,
  Token,
} from '../../shared/types.js';
import { deriveCombatRole } from '../../shared/combatRole.js';

/**
 * Effective combat role for a token: hidden → null, override → it, else the
 * creature's most recent attack role (so the badge follows the weapon last
 * used), falling back to deriving from its stat block.
 */
function tokenCombatRole(t: Token): CombatRole | null {
  if (t.hideCombatRole) return null;
  if (t.combatRoleOverride) return t.combatRoleOverride;
  if (t.kind === 'pc') {
    const c = getCharacter(t.refId);
    if (!c) return null;
    return (
      c.lastAttackRole ??
      deriveCombatRole({ weapons: c.weapons, className: c.className })
    );
  }
  const m = getMonster(t.refId);
  return m ? m.lastAttackRole ?? deriveCombatRole(m) : null;
}

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
    // Shared party notes are visible on every tier (the players wrote them).
    playerNotes: m.playerNotes,
  };
  if (m.disposition === 'neutral') {
    return {
      ...base,
      curHp: m.curHp,
      maxHp: m.maxHp,
      tempHp: m.tempHp,
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
  /** Requesting socket — a player always sees their own claimed PC token. */
  socketId?: string,
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

  // Compute each token's effective combat role (shown to DM AND players, so the
  // badge works even for Enemy creatures whose stats players never receive).
  let tokens: Token[] = (map ? listTokens(map.id) : []).map((t) => ({
    ...t,
    combatRole: tokenCombatRole(t),
  }));
  let monsters: (Monster | MonsterNeutral | MonsterPublic)[] =
    listMonsters(sessionId);

  if (role === 'player') {
    // Individually-hidden tokens, and any token sitting under a covered cell of
    // EITHER enabled fog layer (map or token fog), are never sent to players.
    const grid = map?.gridSizePx ?? 50;
    const mapFog = map?.mapFogEnabled ? new Set(map.mapFogRevealed) : null;
    const tokenFog = map?.tokenFogEnabled ? new Set(map.tokenFogRevealed) : null;
    const covered = (t: Token) => {
      const key = `${Math.floor(t.x / grid)},${Math.floor(t.y / grid)}`;
      return (
        (!!mapFog && !mapFog.has(key)) || (!!tokenFog && !tokenFog.has(key))
      );
    };
    // A player always sees their own claimed PC token, even under fog — they
    // know where they are; only OTHER players are kept from seeing it.
    const ownedBy = (t: Token) =>
      t.kind === 'pc' && getCharacter(t.refId)?.claimedBy === socketId;
    tokens = tokens.filter(
      (t) => !t.isHidden && (!covered(t) || ownedBy(t)),
    );
    monsters = monsters.map((m) => toPlayerMonster(m as Monster));
  }

  // Players see the attack resolution (HIT/MISS) but not the target's AC.
  const rollLog =
    role === 'player'
      ? listRollLog(sessionId).map((e) => ({
          ...e,
          detail: e.detail.replace(/vs AC \d+/g, 'vs AC ?'),
          // The "Apply damage" payload is a DM-only adjudication tool.
          apply: undefined,
        }))
      : listRollLog(sessionId);

  return {
    role,
    sessionCode: session.code,
    sessionName: session.name,
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
    rollLog,
    chat: listChat(sessionId),
    measurements: map ? listMeasurements(map.id) : [],
  };
}
