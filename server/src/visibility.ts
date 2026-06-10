import {
  getActiveMapId,
  getSessionById,
  listCharacters,
  listMaps,
  listMeasurements,
  listAnnotations,
  listMonsters,
  listMonsterTemplates,
  listRollLog,
  listChat,
  listTokens,
} from './sessions.js';
import type {
  Annotation,
  Character,
  CombatRole,
  MapState,
  Measurement,
  Monster,
  MonsterNeutral,
  MonsterPublic,
  Role,
  RollEntry,
  StateSnapshot,
  Token,
} from '../../shared/types.js';
import { deriveCombatRole } from '../../shared/combatRole.js';

/**
 * Whether players may see an object's loot contents. A closed/locked container
 * keeps its contents secret until the DM opens it; loose items/piles show their
 * contents until taken. (The DM always sees loot via the full monster object.)
 */
export function lootVisibleToPlayers(m: Monster): boolean {
  if (!m.objectKind) return false;
  const labels = m.conditions.map((c) => c.label.toLowerCase());
  if (m.objectKind === 'item' || m.objectKind === 'other')
    return !labels.includes('taken');
  return labels.includes('open') || labels.includes('looted');
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
    // Object kind is not secret — players should see a chest is a chest.
    ...(m.objectKind ? { objectKind: m.objectKind } : {}),
    // Loot is only revealed once the container is opened/unlocked.
    ...(m.loot && lootVisibleToPlayers(m) ? { loot: m.loot } : {}),
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

/** The per-map slice of a snapshot, cached so DM staging views and the active
 *  map are each loaded once per change-cycle regardless of client count. */
type MapData = {
  tokens: Token[];
  measurements: Measurement[];
  annotations: Annotation[];
};

/**
 * Build snapshots for ONE change-cycle of a session. All session-wide data
 * (creatures, roll log, chat, …) is loaded ONCE and creature lookups go through
 * in-memory maps — previously every connected client re-ran every query and
 * each token cost its own SELECT (an N+1 that scaled as clients × tokens).
 * The returned shaper is pure CPU per viewer; player-shaped monsters and roll
 * log are computed lazily once and shared by every player connection.
 * Returns null when the session doesn't exist.
 */
export function createSnapshotBuilder(
  sessionId: string,
):
  | ((role: Role, dmViewMapId?: string | null, socketId?: string) => StateSnapshot)
  | null {
  const session = getSessionById(sessionId);
  if (!session) return null;

  const activeMapId = getActiveMapId(sessionId);
  const maps = listMaps(sessionId);
  const characters = listCharacters(sessionId);
  const monsters = listMonsters(sessionId);
  const rollLog = listRollLog(sessionId);
  const chat = listChat(sessionId);
  const charById = new Map(characters.map((c) => [c.id, c]));
  const monById = new Map(monsters.map((m) => [m.id, m]));
  const mapById = new Map(maps.map((m) => [m.id, m]));

  // Lazy, shared across the connections that need them.
  let templates: Monster[] | null = null; // DM-only
  let playerMonsters: (Monster | MonsterNeutral | MonsterPublic)[] | null = null;
  let playerRollLog: RollEntry[] | null = null;
  const mapData = new Map<string, MapData>();

  /**
   * Effective combat role for a token: hidden → null, override → it, else the
   * creature's most recent attack role (so the badge follows the weapon last
   * used), falling back to deriving from its stat block.
   */
  const tokenCombatRole = (t: Token): CombatRole | null => {
    if (t.hideCombatRole) return null;
    if (t.combatRoleOverride) return t.combatRoleOverride;
    if (t.kind === 'pc') {
      const c = charById.get(t.refId);
      if (!c) return null;
      return (
        c.lastAttackRole ??
        deriveCombatRole({ weapons: c.weapons, className: c.className })
      );
    }
    const m = monById.get(t.refId);
    if (!m || m.objectKind) return null; // objects (chests/doors/…) get no badge
    return m.lastAttackRole ?? deriveCombatRole(m);
  };

  const loadMapData = (mapId: string): MapData => {
    let d = mapData.get(mapId);
    if (!d) {
      d = {
        // Each token's effective combat role is shown to DM AND players (the
        // badge works even for Enemy creatures whose stats players never get).
        tokens: listTokens(mapId).map((t) => ({
          ...t,
          combatRole: tokenCombatRole(t),
        })),
        measurements: listMeasurements(mapId),
        annotations: listAnnotations(mapId),
      };
      mapData.set(mapId, d);
    }
    return d;
  };

  // Players see the attack resolution (HIT/MISS) but not the target's AC.
  // The HP-accounting note ("Druk HP 42→38") follows the disposition tiers:
  // players keep it for PCs and friendly/neutral creatures, but an ENEMY's
  // (or a deleted target's) HP change is stripped like its HP bar.
  const hpNoteVisible = (n: NonNullable<RollEntry['hpNote']>): boolean =>
    n.kind === 'pc'
      ? true
      : (monById.get(n.refId)?.disposition ?? 'enemy') !== 'enemy';

  return (role, dmViewMapId, socketId) => {
    // Players are locked to the active map; the DM may view any map for prep.
    // Fall back to the active map if the requested one is gone (e.g. the DM
    // was viewing a map that just got deleted).
    const wantId = role === 'dm' ? dmViewMapId ?? activeMapId : activeMapId;
    const map: MapState | null =
      (wantId ? mapById.get(wantId) : null) ??
      (role === 'dm' && activeMapId ? mapById.get(activeMapId) : null) ??
      null;
    const data: MapData = map
      ? loadMapData(map.id)
      : { tokens: [], measurements: [], annotations: [] };

    let tokens = data.tokens;
    let shapedMonsters: (Monster | MonsterNeutral | MonsterPublic)[] = monsters;
    let shapedRollLog = rollLog;

    if (role === 'player') {
      // Individually-hidden tokens, and any token sitting under a covered cell
      // of EITHER enabled fog layer (map or token fog), are never sent.
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
        t.kind === 'pc' && charById.get(t.refId)?.claimedBy === socketId;
      tokens = tokens.filter((t) => !t.isHidden && (!covered(t) || ownedBy(t)));
      shapedMonsters = playerMonsters ??= monsters.map(toPlayerMonster);
      shapedRollLog = playerRollLog ??= rollLog.map((e) => ({
        ...e,
        detail: e.detail.replace(/vs AC \d+/g, 'vs AC ?'),
        // The "Apply damage" payload is a DM-only adjudication tool.
        apply: undefined,
        hpNote: e.hpNote && hpNoteVisible(e.hpNote) ? e.hpNote : undefined,
      }));
    }

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
      monsters: shapedMonsters,
      // Spawn templates are a DM-only tool.
      monsterTemplates:
        role === 'dm' ? (templates ??= listMonsterTemplates(sessionId)) : [],
      rollLog: shapedRollLog,
      chat,
      measurements: data.measurements,
      annotations: data.annotations,
    };
  };
}

/**
 * Build a single role-shaped snapshot. This is the security boundary: players
 * never receive hidden tokens or full monster stats, and they only ever see the
 * session's active map regardless of what they request. (For fan-out to many
 * clients use `createSnapshotBuilder` so the queries run once per change.)
 */
export function buildSnapshot(
  sessionId: string,
  role: Role,
  /** DM's currently-selected (possibly staging) map; ignored for players. */
  dmViewMapId?: string | null,
  /** Requesting socket — a player always sees their own claimed PC token. */
  socketId?: string,
): StateSnapshot | null {
  return createSnapshotBuilder(sessionId)?.(role, dmViewMapId, socketId) ?? null;
}
