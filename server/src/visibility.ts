import {
  getActiveMapId,
  getSessionById,
  listCharacters,
  listMaps,
  listMeasurements,
  listAnnotations,
  listMapImages,
  listMonsters,
  listMonsterTemplates,
  listRollLog,
  listChat,
  listTokens,
} from './sessions.js';
import type {
  Annotation,
  Character,
  ChatMessage,
  CombatRole,
  MapImage,
  MapState,
  Measurement,
  Monster,
  MonsterPublic,
  Role,
  RollEntry,
  StateSnapshot,
  Token,
} from '../../shared/types.js';
import { deriveCombatRole } from '../../shared/combatRole.js';

/**
 * Whether a point sits under a COVERED cell of either enabled fog layer (map or
 * token fog) — i.e. a player must not see it. Shared by the snapshot's per-token
 * filter and the live drag-preview gate so the two can't drift. Pass the
 * revealed-cell sets (built once by the caller) plus the grid size.
 */
export function coveredByFog(
  mapFog: Set<string> | null,
  tokenFog: Set<string> | null,
  grid: number,
  x: number,
  y: number,
): boolean {
  const key = `${Math.floor(x / grid)},${Math.floor(y / grid)}`;
  return (!!mapFog && !mapFog.has(key)) || (!!tokenFog && !tokenFog.has(key));
}

/**
 * Whether players may see an object's loot contents. A closed/locked container
 * keeps its contents secret until the DM opens it; loose items/piles show their
 * contents until taken. (The DM always sees loot via the full monster object.)
 */
export function lootVisibleToPlayers(m: Monster): boolean {
  const labels = m.conditions.map((c) => c.label.toLowerCase());
  if (!m.objectKind) {
    // A creature's loot is takeable only once it's DEAD and the DM has revealed
    // it (enables a perception-roll gate before the body can be searched).
    const dead = m.curHp <= 0 || labels.includes('dead');
    return dead && labels.includes('loot revealed');
  }
  if (m.objectKind === 'item' || m.objectKind === 'other')
    return !labels.includes('taken');
  return labels.includes('open') || labels.includes('looted');
}

/**
 * Shape a monster for a player according to its disposition:
 * - friendly: full stat block
 * - neutral / enemy: name + conditions + icon only (data identical — only the
 *   battlefield dot colour differs, so players can't read a neutral's HP/stats)
 */
function toPlayerMonster(m: Monster): Monster | MonsterPublic {
  // Friendly = full stat block, but loot stays behind the same reveal gate as
  // every other tier (a friendly NPC's pockets aren't public until the DM says).
  if (m.disposition === 'friendly')
    return m.loot && !lootVisibleToPlayers(m) ? { ...m, loot: undefined } : m;
  return {
    id: m.id,
    name: m.name,
    conditions: m.conditions,
    disposition: m.disposition,
    icon: m.icon,
    // Defeated enemies show a skull to players even though their HP stays
    // hidden — a server-computed flag (0 HP or a "dead" condition).
    dead: m.curHp <= 0 || m.conditions.some((c) => c.label.toLowerCase() === 'dead'),
    // Object kind is not secret — players should see a chest is a chest.
    ...(m.objectKind ? { objectKind: m.objectKind } : {}),
    // Loot is only revealed once the container is opened/unlocked.
    ...(m.loot && lootVisibleToPlayers(m) ? { loot: m.loot } : {}),
    // Shared party notes are visible on every tier (the players wrote them).
    playerNotes: m.playerNotes,
  };
}

/** The per-map slice of a snapshot, cached so DM staging views and the active
 *  map are each loaded once per change-cycle regardless of client count. */
type MapData = {
  tokens: Token[];
  measurements: Measurement[];
  annotations: Annotation[];
  mapImages: MapImage[];
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
  let playerMonsters: (Monster | MonsterPublic)[] | null = null;
  let playerRollLog: RollEntry[] | null = null;
  let playerChat: ChatMessage[] | null = null;
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
        mapImages: listMapImages(mapId),
      };
      mapData.set(mapId, d);
    }
    return d;
  };

  // Players see the attack resolution (HIT/MISS) but not the target's AC.
  // The HP-accounting note ("Druk HP 42→38") follows the disposition tiers:
  // players keep it for PCs and FRIENDLY creatures (whose HP they can see), but
  // neutral/enemy HP changes are stripped like their hidden HP bar.
  const hpNoteVisible = (n: NonNullable<RollEntry['hpNote']>): boolean =>
    n.kind === 'pc'
      ? true
      : monById.get(n.refId)?.disposition === 'friendly';

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
      : { tokens: [], measurements: [], annotations: [], mapImages: [] };

    let tokens = data.tokens;
    let shapedMonsters: (Monster | MonsterPublic)[] = monsters;
    let shapedRollLog = rollLog;
    let shapedChat = chat;

    if (role === 'player') {
      const grid = map?.gridSizePx ?? 50;
      const mapFog = map?.mapFogEnabled ? new Set(map.mapFogRevealed) : null;
      const tokenFog = map?.tokenFogEnabled ? new Set(map.tokenFogRevealed) : null;
      // Map fog is a terrain blackout — it hides ANY token in an unrevealed cell.
      const underMapFog = (t: Token) => coveredByFog(mapFog, null, grid, t.x, t.y);
      // Token fog is for lurking threats: it hides ONLY enemy/neutral creatures.
      // The party — PCs and friendly creatures — stays visible to players even
      // under token fog (so you can always see your allies).
      const underTokenFog = (t: Token) => coveredByFog(null, tokenFog, grid, t.x, t.y);
      const isFoe = (t: Token) =>
        t.kind === 'monster' &&
        (monById.get(t.refId)?.disposition ?? 'enemy') !== 'friendly';
      // A player always sees their own claimed PC token, even under fog — they
      // know where they are; only OTHER players are kept from seeing it.
      const ownedBy = (t: Token) =>
        t.kind === 'pc' && charById.get(t.refId)?.claimedBy === socketId;
      tokens = tokens.filter((t) => {
        if (t.isHidden) return false;
        if (ownedBy(t)) return true;
        if (underMapFog(t)) return false;
        if (underTokenFog(t) && isFoe(t)) return false;
        return true;
      });
      shapedMonsters = playerMonsters ??= monsters.map(toPlayerMonster);
      // Rules-assistant Q&A is a DM tool — never leak it to players.
      shapedChat = playerChat ??= chat.filter((c) => !c.dmOnly);
      shapedRollLog = playerRollLog ??= rollLog
        // DM rolls captured while "hide my rolls" was on never reach players.
        .filter((e) => !e.dmOnly)
        .map((e) => ({
          ...e,
          detail: e.detail.replace(/vs AC -?\d+/g, 'vs AC ?'),
          // The "Apply damage" payload is a DM-only adjudication tool.
          apply: undefined,
          hpNote: e.hpNote && hpNoteVisible(e.hpNote) ? e.hpNote : undefined,
        }));
      // …except a split spell's caster keeps the apply payload for THEIR OWN
      // entry, so the player who cast Magic Missile can assign its darts (the
      // click-to-target path is no longer DM-only). Per-socket overlay on the
      // shared cache, only when this viewer has such a roll in play.
      const myDarts = rollLog.filter((e) => {
        const owner = e.apply?.darts ? e.apply.owner : undefined;
        return owner && charById.get(owner)?.claimedBy === socketId;
      });
      if (myDarts.length) {
        const keep = new Map(myDarts.map((e) => [e.id, e.apply] as const));
        shapedRollLog = shapedRollLog.map((e) =>
          keep.has(e.id) ? { ...e, apply: keep.get(e.id) } : e,
        );
      }
    }

    return {
      role,
      sessionCode: session.code,
      sessionName: session.name,
      map,
      activeMapId,
      activeTurnTokenId: session.activeTurnTokenId,
      round: session.combatRound,
      hideDmRolls: session.hideDmRolls,
      // Players don't need the full map list (DM-only prep tool).
      maps: role === 'dm' ? maps : map ? [map] : [],
      tokens,
      characters,
      monsters: shapedMonsters,
      // Spawn templates are a DM-only tool.
      monsterTemplates:
        role === 'dm' ? (templates ??= listMonsterTemplates(sessionId)) : [],
      rollLog: shapedRollLog,
      chat: shapedChat,
      measurements: data.measurements,
      annotations: data.annotations,
      mapImages: data.mapImages,
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
