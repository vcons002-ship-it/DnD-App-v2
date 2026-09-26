import { listRipostes } from './reactions.js';
import { encounterTags, creatureBaseName } from './encounterTags.js';
import { resolveMonsterModelType } from '../../shared/monsterAppearance.js';
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
  rollsInitiative,
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
  RollReveal,
  StateSnapshot,
  Token,
} from '../../shared/types.js';
import { deriveCombatRole } from '../../shared/combatRole.js';
import { coveredByFog, tokenVisibleAt } from '../../shared/fog.js';
import { peekUndo } from './undo.js';

/** Sum a list of reveal steps' values. */
const sumSteps = (steps?: { value: number }[]): number =>
  (steps ?? []).reduce((s, x) => s + x.value, 0);

/** A map shaped for the snapshot's map LIST (a picker): keep the metadata + the
 *  fog ENABLED flags, but drop the (potentially thousands of) revealed-cell
 *  strings — the canvas reads those only from the dedicated `map` field. */
const stripListFog = (m: MapState): MapState => ({
  ...m,
  mapFogRevealed: [],
  tokenFogRevealed: [],
});

/**
 * Shape a roll-log entry for PLAYERS: always redact the target AC (`vs AC ?`), and
 * for an ENEMY/NEUTRAL creature roll (`hideMods`) strip the creature's modifier
 * breakdown — the bracketed ability/proficiency/magic terms (`+4[DEX] +2[PROF]`,
 * `+4[STR]+1[MAGIC]`) and a save roll's `(+5 prof)` — plus collapse the reveal's
 * labelled bonus chips into one anonymous step so the count-up still reaches the
 * total without naming the creature's stats. The d20, total and outcome stay.
 */
function redactCreatureMods(e: RollEntry): RollEntry {
  let detail = e.detail.replace(/vs AC -?\d+/g, 'vs AC ?');
  if (!e.hideMods) return { ...e, detail };
  detail = detail
    // Bracketed stat/proficiency/magic/mastery terms (content has a letter, so
    // dice faces like `[4,6]` are kept).
    .replace(/\s*[+-]\d+\[[^\]]*[A-Za-z][^\]]*\]/g, '')
    // A save roll's "(+5 prof)" / "(-1)" parenthetical modifier.
    .replace(/\s*\([+-]?\d+(?:\s*prof)?\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  let reveal = e.reveal;
  if (reveal) {
    const anon = (total: number, base: number) => {
      const diff = total - base;
      return diff !== 0 ? [{ label: '', value: diff }] : [];
    };
    const anonymousDice = (step: NonNullable<RollReveal['damageDice']>[number]) => {
      const expression = step.diceExpression ?? step.label.match(/\d*d\d+/gi)?.join('+');
      return {...step, critical:step.critical ?? /\bCRIT\b/i.test(step.label), ...(expression ? {diceExpression:expression} : {}),
        label: expression ?? (step.label === 'CRIT' ? 'CRIT' : 'dice')};
    };
    reveal = {
      ...reveal,
      ...(reveal.damageDice ? {damageDice:reveal.damageDice.map(anonymousDice)} : {}),
      ...(reveal.toHit ? { toHit: anon(reveal.attackTotal ?? reveal.d20 ?? 0, reveal.d20 ?? 0) } : {}),
      ...(reveal.damageMods
        ? { damageMods: anon(reveal.damage ?? 0, sumSteps(reveal.damageDice)) }
        : {}),
      ...(reveal.damageBreakdown ? {
        damageBreakdown: {
          // Retain visible die faces but never disclose the creature feature,
          // rider or item name carried only by this richer log-only payload.
          dice: reveal.damageBreakdown.dice.map(anonymousDice),
          mods: anon(reveal.damage ?? 0, sumSteps(reveal.damageBreakdown.dice)),
          ...(reveal.damageBreakdown.mixedTypes ? { mixedTypes: true } : {}),
        },
      } : {}),
    };
  }
  return { ...e, detail, reveal };
}

// Moved to shared/ so `sessions.ts` (which visibility.ts imports) can use the
// same rule for initiative without a circular import. Re-exported here because
// connections.ts and the tests already import it from this module.
export { coveredByFog };

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
/** Hide numeric encounter suffixes, including inherited duplicate suffixes. */
function playerMonsterName(m: Monster): string {
  return m.objectKind ? m.name : creatureBaseName(m.name);
}

function toPlayerMonster(m: Monster): Monster | MonsterPublic {
  // Friendly = full stat block, but loot stays behind the same reveal gate as
  // every other tier (a friendly NPC's pockets aren't public until the DM says).
  if (m.disposition === 'friendly')
    return { ...m, name: playerMonsterName(m), ...(m.loot && !lootVisibleToPlayers(m) ? { loot: undefined } : {}) };
  return {
    id: m.id,
    name: playerMonsterName(m),
    modelType: resolveMonsterModelType(m),
    visualTags: m.visualTags,
    modelColor: m.modelColor,
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
  | ((
      role: Role,
      dmViewMapId?: string | null,
      socketId?: string,
      playerId?: string | null,
    ) => StateSnapshot)
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
  // Logs/reveal captions use the same names as tokens, never DM encounter counts.
  const names = new Map(monsters.map(m => [m.name, playerMonsterName(m)]));
  const escaped = [...names.keys()].sort((a,b) => b.length-a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const namePattern = escaped.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`, 'gu') : null;
  const playerLogNames = <T,>(value: T): T => {
    if (!namePattern) return value;
    if (typeof value === 'string') return value.replace(namePattern, name => names.get(name)!) as T;
    if (Array.isArray(value)) return value.map(playerLogNames) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,playerLogNames(v)])) as T;
    return value;
  };


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
      const rawTokens = listTokens(mapId);
      const tagMap = encounterTags(mapById.get(mapId)!, rawTokens, monById, mapId === activeMapId);
      if (mapId === activeMapId) for (const token of rawTokens) {
        const monster=token.kind==='monster'?monById.get(token.refId):undefined;
        const tag=tagMap.get(token.id);
        if(monster && tag && tag!=='U') names.set(monster.name, `${playerMonsterName(monster)} ${tag}`);
      }
      d = {
        // Each token's effective combat role is shown to DM AND players (the
        // badge works even for Enemy creatures whose stats players never get).
        tokens: rawTokens.map((t) => ({
          ...(tagMap.has(t.id) ? { revealTag: tagMap.get(t.id) } : {}),
          ...t,
          combatRole: tokenCombatRole(t),
          // Who "Roll all" would pull in, decided server-side (it depends on fog).
          inCombatEffective: rollsInitiative(t, mapById.get(mapId) ?? null),
        })),
        measurements: listMeasurements(mapId),
        annotations: listAnnotations(mapId),
        mapImages: listMapImages(mapId),
      };
      mapData.set(mapId, d);
    }
    return d;
  };

  // Track active-map reveals even when only a DM staging another map is connected.
  if (activeMapId && mapById.has(activeMapId)) loadMapData(activeMapId);

  // Players see the attack resolution (HIT/MISS) but not the target's AC.
  // The HP-accounting note ("Druk HP 42→38") follows the disposition tiers:
  // players keep it for PCs and FRIENDLY creatures (whose HP they can see), but
  // neutral/enemy HP changes are stripped like their hidden HP bar.
  const hpNoteVisible = (n: NonNullable<RollEntry['hpNote']>): boolean =>
    n.kind === 'pc'
      ? true
      : monById.get(n.refId)?.disposition === 'friendly';

  return (role, dmViewMapId, socketId, playerId) => {
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
    let shapedCharacters: Character[] = characters;
    let shapedRollLog = rollLog;
    let shapedChat = chat;

    if (role !== 'dm') {
      const grid = map?.gridSizePx ?? 50;
      const mapFog = map?.mapFogEnabled ? new Set(map.mapFogRevealed) : null;
      const tokenFog = map?.tokenFogEnabled ? new Set(map.tokenFogRevealed) : null;
      tokens = tokens.filter(t => tokenVisibleAt({ role, hidden: t.isHidden,
        owned: t.kind === 'pc' && charById.get(t.refId)?.claimedBy === socketId,
        foe: t.kind === 'monster' && monById.get(t.refId)?.disposition !== 'friendly',
        mapFog, tokenFog, grid, x: t.x, y: t.y }));
      // Only reveal monsters the player can actually SEE — i.e. referenced by a
      // token that survived the hidden/fog filter above. Previously EVERY session
      // monster (incl. hidden-token and staged-map creatures) was listed, leaking
      // boss names / ambush existence. (The visible-monster set is the same for
      // all players, since fog/hidden are session-level, not per-viewer.)
      // The visible-monster set is viewer-independent (fog/hidden are
      // session-level and `ownedBy` only affects PC tokens), so this shared
      // memo still computes once per change-cycle.
      const visibleMonIds = new Set(
        tokens.filter((t) => t.kind === 'monster').map((t) => t.refId),
      );
      shapedMonsters = playerMonsters ??= monsters
        .filter((m) => visibleMonIds.has(m.id))
        .map(toPlayerMonster);
      // Strip other players' infrastructure ids (live socket + durable browser
      // id): a leaked ownerId is a character-hijack key — rejoin with it and the
      // server hands you that PC. Keep the VIEWER'S OWN character intact, since
      // its own reclaim + "this is mine" checks rely on ownerId/claimedBy.
      shapedCharacters = characters.map((c): Character => {
        const mine =
          c.claimedBy === socketId || (!!playerId && c.ownerId === playerId);
        if (mine) return c;
        // Non-null sentinel preserves the client's "taken by someone" state
        // without exposing the real socket id.
        return { ...c, ownerId: null, claimedBy: c.claimedBy ? '__held__' : null };
      });
      // Rules-assistant Q&A is a DM tool — never leak it to players.
      shapedChat = playerChat ??= chat.filter((c) => !c.dmOnly);
      shapedRollLog = playerRollLog ??= rollLog
        // DM rolls captured while "hide my rolls" was on never reach players.
        .filter((e) => !e.dmOnly)
        .map((e) => ({
          ...redactCreatureMods(e),
          // The "Apply damage" payload is a DM-only adjudication tool, and the
          // parked weapon damage is the attacker's own button.
          apply: undefined,
          pending: undefined,
          smite: undefined,
          hpNote: e.hpNote && hpNoteVisible(e.hpNote) ? e.hpNote : undefined,
        }));
      // …except the OWNER keeps their own entry's payload (both are stamped with
      // an `owner` character id): the player who cast Magic Missile assigns its
      // darts, the player who cast an AOE save spell gets the "Apply damage"
      // click-to-target button, and the player who landed a hit gets the
      // "Roll damage" button — same as the DM. Per-socket overlay on the shared
      // cache, only when this viewer has such a roll in play.
      const ownedByMe = (owner?: string) =>
        !!owner && charById.get(owner)?.claimedBy === socketId;
      const mine = rollLog.filter(
        (e) =>
          ownedByMe(e.apply?.owner) || ownedByMe(e.pending?.owner) || ownedByMe(e.smite?.owner),
      );
      if (mine.length) {
        const keep = new Map(
          mine.map((e) => [
            e.id,
            {
              ...(ownedByMe(e.apply?.owner) ? { apply: e.apply } : {}),
              ...(ownedByMe(e.smite?.owner) ? { smite: e.smite } : {}),
              ...(ownedByMe(e.pending?.owner) ? { pending: e.hideMods && e.pending
                // Pending data remains the existing owner's action payload;
                // new named log-only detail is not needed before resolution.
                ? { ...e.pending, damageBreakdown: undefined } : e.pending } : {}),
            },
          ] as const),
        );
        shapedRollLog = shapedRollLog.map((e) =>
          keep.has(e.id) ? { ...e, ...keep.get(e.id) } : e,
        );
      }
    }

    if (role==='dm') {
      const labels=new Map(data.tokens.filter(t=>t.kind==='monster'&&t.revealTag).map(t=>{
        const name=monById.get(t.refId)?.name??'';
        return [name,`${name} ${t.revealTag}`];
      }));
      const caption=(name:string|undefined)=>name ? labels.get(name)??name : name;
      shapedRollLog=shapedRollLog.map(e=>({...e,
        ...(e.reveal ? {reveal:{...e.reveal,target:caption(e.reveal.target),attacker:caption(e.reveal.attacker)!}} : {}),
        ...(e.pending ? {pending:{...e.pending,target:{...e.pending.target,name:caption(e.pending.target.name)!}}} : {}),
      }));
    }
    return {
      role,
      initiativePending: session.initiativePending,
      ripostes: listRipostes(sessionId).filter(o =>
        (role === 'dm' || charById.get(o.owner)?.claimedBy === socketId) &&
        tokens.some(t => t.id === o.defenderTokenId) && tokens.some(t => t.id === o.attackerTokenId)),
      sessionCode: session.code,
      sessionName: session.name,
      map,
      activeMapId,
      activeTurnTokenId: session.activeTurnTokenId,
      round: session.combatRound,
      hideDmRolls: session.hideDmRolls,
      manualDamage: session.manualDamage,
      // DM-only: what the next undo would reverse (drives the DM's Undo button).
      undoLabel: role === 'dm' ? peekUndo(sessionId) : null,
      // The map LIST is only a picker (name/active) — the client reads fog cells
      // exclusively from the `map` field above, so drop the big fog arrays from
      // the list entries (the DM's every-map fog was ~145 KB per snapshot, and
      // the player's `[map]` duplicated the active map's fog a second time).
      maps:
        role === 'dm'
          ? maps.map(stripListFog)
          : map
            ? [stripListFog(map)]
            : [],
      tokens,
      characters: shapedCharacters,
      monsters: shapedMonsters,
      // Spawn templates are a DM-only tool.
      monsterTemplates:
        role === 'dm' ? (templates ??= listMonsterTemplates(sessionId)) : [],
      rollLog: role === 'dm' ? shapedRollLog : playerLogNames(shapedRollLog),
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
  /** Requesting player's durable browser id — keeps THEIR own character's
   *  owner/claim ids intact while other players' are stripped. */
  playerId?: string | null,
): StateSnapshot | null {
  return (
    createSnapshotBuilder(sessionId)?.(role, dmViewMapId, socketId, playerId) ?? null
  );
}
