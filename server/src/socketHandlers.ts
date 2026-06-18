import { config } from './config.js';
import { newId } from './db.js';
import { parseRollCommand, rollDice } from '../../shared/dice.js';
import {
  resolveAttack,
  resolveAbilityRoll,
  resolveMonsterSheetAbility,
  resolveForcedSave,
  resolveSkillRoll,
  resolveTrapDisarm,
  resolveObjectCheck,
  resolveSaves,
  resolveSave,
  resolveCheck,
  resolveDeathSave,
  noteConcentration,
} from './combat.js';
import {
  aiCreateCharacter,
  aiFillCharacter,
  aiFillCreature,
} from './creatures/fill.js';
import {
  broadcastSnapshots,
  broadcastTokenDrag,
  broadcastTyping,
  broadcastSay,
  broadcastCursor,
  broadcastCursorHide,
  dropConn,
  getConn,
  isConnected,
  roomName,
  sendSnapshot,
  setConn,
  type IOServer,
} from './connections.js';
import { answerRules, recapSession, creatureLine } from './assistant/index.js';
import { buildSnapshot, lootVisibleToPlayers } from './visibility.js';
import {
  addRollLog,
  advanceTurn,
  applyDamage,
  setTempHp,
  claimCharacter,
  clearOwnershipElsewhere,
  listCharacters,
  setCharacterOwner,
  clearCondition,
  clearInitiative,
  clearRollLog,
  clearTokensConditions,
  copyTokens,
  createCharacter,
  createCharacterFromLibrary,
  updateCharacter,
  getCharacter,
  getRollEntry,
  getMonster,
  addMeasurement,
  clearMeasurements,
  removeMeasurement,
  addAnnotation,
  clearAnnotations,
  moveAnnotation,
  removeAnnotation,
  resizeAnnotation,
  setAnnotationPopup,
  addMapImage,
  moveMapImage,
  resizeMapImage,
  reorderMapImage,
  deleteMapImage,
  setResource,
  setItem,
  removeItem,
  setLoot,
  takeLoot,
  setSheetAbility,
  removeSheetAbility,
  reorderSheetAbilities,
  spendResourceForAbility,
  spendSpellSlot,
  damageTokens,
  duplicateToken,
  setTokensHidden,
  setTokensCondition,
  coverFog,
  createMonsterTemplate,
  createToken,
  deleteMap,
  deleteMonster,
  deleteCharacter,
  setMonsterPlayerNotes,
  deleteToken,
  instantiateMonster,
  setEntityIcon,
  paintFog,
  setFogLayer,
  setTokenHidden,
  setTokensHideCombatRole,
  setTokensCombatRole,
  getActiveMapId,
  getMap,
  getSessionById,
  getSessionByCode,
  getToken,
  listRollLog,
  listChat,
  listTokens,
  monsterInSession,
  moveToken,
  firstInInitiative,
  releaseClaims,
  renameMap,
  renameSession,
  importMaps,
  previewImportCharacters,
  resizeToken,
  setTokenShape,
  createPastedObject,
  createSummon,
  updateMapGrid,
  rollAllInitiative,
  rollMissingInitiative,
  setCombatRound,
  setHideDmRolls,
  rollerName,
  getClaimedCharacterId,
  addChatMessage,
  setActiveMap,
  setActiveTurn,
  setCondition,
  setTokenInitiative,
  touchSession,
  updateMonster,
} from './sessions.js';
import type { Condition, MapPopup, TokenKind } from '../../shared/types.js';

/** Grace window after a disconnect before a player's claim is freed, so a brief
 *  connection blip doesn't de-select their character (and others can't snipe it).
 *  When the same player reconnects within it, the claim is handed straight back. */
/** Clamp a client-supplied decal popup to safe sizes before storing. */
function sanitizePopup(p: MapPopup): MapPopup {
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  return {
    title: str(p?.title, 80) || 'Shop',
    ...(p?.note ? { note: str(p.note, 1000) } : {}),
    items: (Array.isArray(p?.items) ? p.items : []).slice(0, 100).map((it) => ({
      id: str(it?.id, 40) || newId(),
      name: str(it?.name, 80),
      price: str(it?.price, 40),
      ...(Number.isFinite(Number(it?.qty)) ? { qty: Math.max(0, Math.round(Number(it.qty))) } : {}),
      ...(it?.note ? { note: str(it.note, 300) } : {}),
    })),
  };
}

const CLAIM_GRACE_MS = 20_000;
/** In-flight rules-assistant requests by socket id, so the Stop button (and a
 *  disconnect) can abort the long-running LLM call. */
const assistantInFlight = new Map<string, AbortController>();
/** Disconnected sockets whose claims are held during their grace window:
 *  socketId → its session + player + the pending release timer. */
const pendingReleases = new Map<
  string,
  { sessionId: string; playerId: string | null; timer: NodeJS.Timeout }
>();
/** A claim is protected (un-stealable) while its holder is connected OR still
 *  inside its post-disconnect grace window. */
const isClaimProtected = (claimedBy: string | null | undefined): boolean =>
  isConnected(claimedBy) || (!!claimedBy && pendingReleases.has(claimedBy));
/** The player id behind a claim, whether the holder is live or grace-pending. */
const claimHolderPlayerId = (claimedBy: string | null): string | null =>
  (claimedBy
    ? getConn(claimedBy)?.playerId ?? pendingReleases.get(claimedBy)?.playerId
    : null) ?? null;

export function registerSocketHandlers(io: IOServer): void {
  /** Cancel every pending release for a player (they're back) so their claims
   *  aren't freed, then hand back the one character they last held if no live
   *  player holds it now. Called on (re)join. */
  const reclaimForPlayer = (
    sid: string,
    playerId: string | null,
    socketId: string,
  ): void => {
    if (!playerId) return;
    for (const [oldSock, p] of pendingReleases) {
      if (p.playerId === playerId) {
        clearTimeout(p.timer);
        pendingReleases.delete(oldSock);
      }
    }
    for (const c of listCharacters(sid)) {
      if (c.ownerId !== playerId) continue;
      // Skip if a DIFFERENT live socket is actively holding it.
      if (c.claimedBy && c.claimedBy !== socketId && isConnected(c.claimedBy)) continue;
      claimCharacter(c.id, socketId, playerId);
      break; // a player holds exactly one character
    }
  };

  /** Hold a disconnected socket's claim for the grace window, then free it. */
  const scheduleRelease = (
    sid: string,
    socketId: string,
    playerId: string | null,
  ): void => {
    const timer = setTimeout(() => {
      pendingReleases.delete(socketId);
      releaseClaims(socketId);
      broadcastSnapshots(io, sid);
    }, CLAIM_GRACE_MS);
    pendingReleases.set(socketId, { sessionId: sid, playerId, timer });
  };

  io.on('connection', (socket) => {
    const isDm = () => getConn(socket.id)?.role === 'dm';
    const sessionId = () => getConn(socket.id)?.sessionId;

    /** Run a mutation, persist, and re-shape snapshots for everyone. */
    const afterChange = () => {
      const sid = sessionId();
      if (sid) broadcastSnapshots(io, sid);
    };

    socket.on('join', (payload, ack) => {
      const session = getSessionByCode(payload.sessionCode ?? '');
      if (!session) {
        return ack({
          ok: false,
          error: { code: 'NO_SESSION', message: 'Session not found' },
        });
      }
      if (
        payload.role === 'dm' &&
        config.dmPassphrase &&
        payload.dmPassphrase !== config.dmPassphrase
      ) {
        return ack({
          ok: false,
          error: { code: 'BAD_PASSPHRASE', message: 'Incorrect DM passphrase' },
        });
      }

      const playerId =
        typeof payload.playerId === 'string' && payload.playerId.trim()
          ? payload.playerId.slice(0, 64)
          : null;
      setConn(socket.id, {
        sessionId: session.id,
        role: payload.role,
        viewMapId: session.activeMapId,
        playerId,
      });
      socket.join(roomName(session.id));
      touchSession(session.id); // keep the resume directory fresh

      // Hand back the character this player last held (and cancel any pending
      // release from a just-dropped connection) so a reload/reconnect lands them
      // right back on their PC if it's still free.
      if (payload.role === 'player') reclaimForPlayer(session.id, playerId, socket.id);

      const snapshot = buildSnapshot(
        session.id,
        payload.role,
        session.activeMapId,
        socket.id,
      );
      if (!snapshot) {
        return ack({
          ok: false,
          error: { code: 'NO_SNAPSHOT', message: 'Could not load session' },
        });
      }
      ack({ ok: true, snapshot });
      // Let everyone else see the (possibly) re-taken character.
      broadcastSnapshots(io, session.id);
    });

    // ---- DM-only: map prep & promotion ----

    socket.on('map:select', ({ mapId }) => {
      const conn = getConn(socket.id);
      if (!conn || conn.role !== 'dm') return;
      if (!getMap(mapId)) return;
      setConn(socket.id, { ...conn, viewMapId: mapId });
      sendSnapshot(io, socket.id); // only this DM's staging view changes
    });

    socket.on('map:setActive', ({ mapId }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !getMap(mapId)) return;
      setActiveMap(sid, mapId);
      afterChange();
    });

    socket.on('map:rename', ({ mapId, name }) => {
      if (!isDm() || !getMap(mapId)) return;
      renameMap(mapId, name);
      afterChange();
    });

    socket.on('map:setGrid', (p) => {
      if (!isDm() || !getMap(p.mapId)) return;
      const px = Math.round(Math.max(10, Math.min(400, p.gridSizePx)));
      const ft = Math.round(Math.max(1, Math.min(100, p.feetPerSquare)));
      // 0 = unset (fall back to feet-per-square); otherwise clamp to a sane span.
      const w = p.widthFt <= 0 ? 0 : Math.max(1, Math.min(100000, p.widthFt));
      updateMapGrid(p.mapId, px, ft, w, {
        offsetX: p.offsetX === undefined ? undefined : ((p.offsetX % px) + px) % px,
        offsetY: p.offsetY === undefined ? undefined : ((p.offsetY % px) + px) % px,
        locked: p.locked,
        hidden: p.hidden,
      });
      afterChange();
    });

    // Measuring shapes — any session member may draw/clear them; they're shared.
    const MEASURE_KINDS = ['cone', 'circle', 'line', 'square', 'emanation', 'ruler'];
    socket.on('measure:add', ({ kind, origin, target, tokenId }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || !MEASURE_KINDS.includes(kind)) return;
      const mapId =
        conn.role === 'dm' ? conn.viewMapId ?? getActiveMapId(sid) : getActiveMapId(sid);
      if (!mapId || !getMap(mapId)) return;
      addMeasurement(sid, {
        mapId,
        kind,
        origin: { x: Number(origin?.x) || 0, y: Number(origin?.y) || 0 },
        target: { x: Number(target?.x) || 0, y: Number(target?.y) || 0 },
        tokenId: typeof tokenId === 'string' ? tokenId : undefined,
        createdBy: rollerName(sid, socket.id, conn.role === 'dm'),
      });
      afterChange();
    });

    socket.on('measure:remove', ({ id }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || !id) return;
      // The DM may remove any; a player only their own.
      removeMeasurement(
        id,
        conn.role === 'dm' ? undefined : rollerName(sid, socket.id, false),
      );
      afterChange();
    });

    socket.on('measure:clear', ({ mapId, mineOnly }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || !getMap(mapId)) return;
      // Players may only clear their own; the DM may clear everyone's.
      const onlyMine = mineOnly || conn.role !== 'dm';
      clearMeasurements(mapId, onlyMine ? rollerName(sid, socket.id, false) : undefined);
      afterChange();
    });

    socket.on('annotation:add', ({ kind, points, x, y, text, color, url, width, height }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || (kind !== 'freehand' && kind !== 'text' && kind !== 'image')) return;
      // Image decals are a DM tool (scenery/set-dressing); strokes/text are shared.
      if (kind === 'image' && conn.role !== 'dm') return;
      const mapId =
        conn.role === 'dm' ? conn.viewMapId ?? getActiveMapId(sid) : getActiveMapId(sid);
      if (!mapId || !getMap(mapId)) return;
      addAnnotation(sid, {
        mapId,
        kind,
        points: Array.isArray(points) ? points.slice(0, 2000).map(Number) : undefined,
        x: Number(x) || 0,
        y: Number(y) || 0,
        text: typeof text === 'string' ? text : undefined,
        color: typeof color === 'string' ? color : '#ffd166',
        url: typeof url === 'string' ? url : undefined,
        width: Number(width) || undefined,
        height: Number(height) || undefined,
        createdBy: rollerName(sid, socket.id, conn.role === 'dm'),
      });
      afterChange();
    });

    // Paste an uploaded image onto the map AS AN OBJECT (draggable token).
    socket.on('object:paste', ({ mapId, x, y, icon, name }) => {
      const sid = sessionId();
      if (!sid || !isDm() || typeof icon !== 'string' || !icon) return;
      const map = getMap(mapId);
      if (!map || getActiveMapId(sid) !== mapId) {
        // Only place on the active/viewed map the DM is looking at.
      }
      if (!map) return;
      createPastedObject(sid, mapId, Number(x) || 0, Number(y) || 0, icon, (name || 'Object').slice(0, 60));
      afterChange();
    });

    // Cast a summon-tagged spell/ability: spawn its friendly companion token. The
    // caster must own the creature; players may only place on the ACTIVE map. A
    // leveled spell spends a slot (cantrips/abilities don't).
    socket.on('summon:cast', ({ kind, refId, abilityId, mapId, x, y, castLevel }) => {
      const sid = sessionId();
      if (!sid || !ownsCreature(kind, refId)) return;
      const map = getMap(mapId);
      if (!map || map.sessionId !== sid) return;
      if (!isDm() && getActiveMapId(sid) !== mapId) return;
      const ent = kind === 'pc' ? getCharacter(refId) : getMonster(refId);
      const ability = ent?.sheetAbilities.find((a) => a.id === abilityId);
      if (!ability?.summon) return;
      const name = (ability.summon.name?.trim() || ability.name || 'Summon').slice(0, 60);
      const icon = (ability.summon.icon || '✋').slice(0, 2000);
      // Spend a slot for a leveled spell BEFORE spawning; bail if none left.
      if (kind === 'pc' && ability.type === 'spell' && (ability.level ?? 0) >= 1) {
        const base = ability.level ?? 1;
        const lvl = typeof castLevel === 'number' && castLevel >= base ? castLevel : base;
        const { hasSlot, spent } = spendSpellSlot(refId, lvl);
        if (hasSlot && !spent) {
          socket.emit('notice', { message: `No level ${lvl} spell slots left.` });
          return;
        }
      }
      createSummon(sid, mapId, Number(x) || 0, Number(y) || 0, name, icon);
      afterChange();
    });

    socket.on('annotation:remove', ({ id }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || !id) return;
      removeAnnotation(id, conn.role === 'dm' ? undefined : rollerName(sid, socket.id, false));
      afterChange();
    });

    socket.on('annotation:clear', ({ mapId, mineOnly, kind }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || !getMap(mapId)) return;
      const onlyMine = mineOnly || conn.role !== 'dm';
      const k =
        kind === 'freehand' || kind === 'text' || kind === 'image' ? kind : undefined;
      // NOTE: pass the caller's REAL role — annotations store the DM's as
      // createdBy 'DM', so a hardcoded `false` here made the DM's "Clear mine"
      // look for 'Player' and delete nothing.
      clearAnnotations(
        mapId,
        onlyMine ? rollerName(sid, socket.id, conn.role === 'dm') : undefined,
        k,
      );
      afterChange();
    });

    // Reposition an image decal (DM drag); strokes/text never move.
    socket.on('annotation:move', ({ id, x, y }) => {
      if (!sessionId() || !isDm() || !id) return;
      moveAnnotation(id, Number(x) || 0, Number(y) || 0);
      afterChange();
    });

    // Resize an image decal (DM corner-handle drag).
    socket.on('annotation:resize', ({ id, width, height }) => {
      if (!sessionId() || !isDm() || !id) return;
      const w = Math.max(8, Math.min(20000, Number(width) || 0));
      const h = Math.max(8, Math.min(20000, Number(height) || 0));
      resizeAnnotation(id, w, h);
      afterChange();
    });

    // Attach/edit/clear a decal's clickable "shop" popup (DM only).
    socket.on('annotation:setPopup', ({ id, popup }) => {
      if (!sessionId() || !isDm() || !id) return;
      setAnnotationPopup(id, popup ? sanitizePopup(popup) : null);
      afterChange();
    });

    // ---- Map image tiles (DM composes a larger map from several images) ----
    const px = (v: unknown) => Math.max(-100000, Math.min(100000, Number(v) || 0));
    const dim = (v: unknown) => Math.max(1, Math.min(40000, Number(v) || 0));
    socket.on('mapImage:add', ({ mapId, imagePath, x, y, w, h }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !getMap(mapId) || typeof imagePath !== 'string' || !imagePath) return;
      addMapImage(sid, { mapId, imagePath, x: px(x), y: px(y), w: dim(w), h: dim(h) });
      afterChange();
    });
    socket.on('mapImage:move', ({ id, x, y }) => {
      if (!sessionId() || !isDm() || !id) return;
      moveMapImage(id, px(x), px(y));
      afterChange();
    });
    socket.on('mapImage:resize', ({ id, x, y, w, h }) => {
      if (!sessionId() || !isDm() || !id) return;
      resizeMapImage(id, px(x), px(y), dim(w), dim(h));
      afterChange();
    });
    socket.on('mapImage:reorder', ({ id, to }) => {
      if (!sessionId() || !isDm() || !id || (to !== 'front' && to !== 'back')) return;
      reorderMapImage(id, to);
      afterChange();
    });
    socket.on('mapImage:remove', ({ id }) => {
      if (!sessionId() || !isDm() || !id) return;
      deleteMapImage(id);
      afterChange();
    });

    socket.on('session:rename', ({ name }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      renameSession(sid, name);
      afterChange();
    });

    // Import selected maps + their tokens from another session (DM only).
    socket.on('session:importPreview', ({ sourceCode, mapIds }, ack) => {
      const sid = sessionId();
      if (!sid || !isDm() || typeof ack !== 'function') {
        if (typeof ack === 'function') ack([]);
        return;
      }
      const ids = Array.isArray(mapIds)
        ? mapIds.filter((m): m is string => typeof m === 'string').slice(0, 200)
        : [];
      ack(previewImportCharacters(sid, sourceCode, ids));
    });

    socket.on('session:importMaps', ({ sourceCode, mapIds, resolutions }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      if (typeof sourceCode !== 'string' || !Array.isArray(mapIds)) return;
      const ids = mapIds.filter((m): m is string => typeof m === 'string').slice(0, 200);
      const n = importMaps(sid, sourceCode, ids, {
        resolutions: resolutions ?? {},
        isClaimActive: isConnected,
      });
      socket.emit('notice', {
        message: n
          ? `Imported ${n} map${n === 1 ? '' : 's'} from ${sourceCode.toUpperCase()}.`
          : `No maps imported from "${sourceCode}".`,
      });
      if (n) afterChange();
    });

    socket.on('map:delete', ({ mapId }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || conn.role !== 'dm' || !getMap(mapId)) return;
      deleteMap(mapId);
      // If this DM was prepping the deleted map, drop the stale view so their
      // snapshot falls back to the (possibly new) active map.
      if (conn.viewMapId === mapId) {
        setConn(socket.id, { ...conn, viewMapId: getActiveMapId(sid) });
      }
      afterChange();
    });

    socket.on('fog:setLayer', ({ mapId, layer, enabled }) => {
      if (!isDm() || !getMap(mapId)) return;
      setFogLayer(mapId, layer, enabled);
      afterChange();
    });

    socket.on('fog:paint', ({ mapId, layer, cells, reveal }) => {
      if (!isDm() || !getMap(mapId) || !Array.isArray(cells)) return;
      paintFog(mapId, layer, cells, reveal);
      afterChange();
    });

    socket.on('fog:cover', ({ mapId, layer }) => {
      if (!isDm() || !getMap(mapId)) return;
      coverFog(mapId, layer);
      afterChange();
    });

    socket.on('token:spawn', (p) => {
      const sid = sessionId();
      if (!sid || !getMap(p.mapId)) return;
      if (!isDm()) {
        // Players may place ONLY their own claimed character, on the active map.
        if (p.kind !== 'pc') return;
        const c = getCharacter(p.refId);
        if (!c || c.claimedBy !== socket.id) return;
        if (p.mapId !== getActiveMapId(sid)) return;
        // Don't pile up duplicates: skip if their token is already on this map.
        const exists = listTokens(p.mapId).some(
          (t) => t.kind === 'pc' && t.refId === p.refId,
        );
        if (exists) return;
      }
      // Monsters spawn from a template -> each placement is a fresh numbered
      // instance (Goblin 1, 2, …). PCs reference their character directly.
      let refId = p.refId;
      if (p.kind === 'monster') {
        const inst = instantiateMonster(p.refId);
        if (!inst) return;
        refId = inst.id;
      }
      createToken({ mapId: p.mapId, kind: p.kind, refId, x: p.x, y: p.y });
      afterChange();
    });

    // ---- Shared: anyone in the session may move/resize tokens (per spec) ----

    socket.on('token:move', ({ tokenId, x, y }) => {
      if (!sessionId()) return;
      // Players may move PCs and FRIENDLY creatures (companions/summons) only —
      // enemy/neutral tokens and OBJECTS (chests/doors/traps) are the DM's.
      // Hidden tokens are never sent to players, so a non-DM move of one is
      // stale/forged.
      if (!isDm()) {
        const t = getToken(tokenId);
        if (!t || t.isHidden) return;
        if (t.kind === 'monster') {
          const m = getMonster(t.refId);
          if (!m || m.disposition !== 'friendly' || m.objectKind) return;
        }
      }
      moveToken(tokenId, x, y);
      afterChange();
    });

    // Live, throttled drag preview (no DB write / snapshot) — same sender gate
    // as token:move so a player can't broadcast a ghost for a token they can't
    // move; recipients are filtered by visibility inside broadcastTokenDrag.
    socket.on('token:drag', ({ tokenId, x, y }) => {
      const sid = sessionId();
      if (!sid) return;
      const t = getToken(tokenId);
      if (!t) return;
      if (!isDm()) {
        if (t.isHidden) return;
        if (t.kind === 'monster') {
          const m = getMonster(t.refId);
          if (!m || m.disposition !== 'friendly' || m.objectKind) return;
        }
      }
      broadcastTokenDrag(io, sid, socket.id, t, x, y);
    });

    socket.on('token:resize', ({ tokenId, widthFt }) => {
      if (!isDm()) return; // resizing is a DM action; players may only move
      resizeToken(tokenId, widthFt);
      afterChange();
    });

    socket.on('token:setShape', ({ tokenId, shape }) => {
      if (!isDm()) return;
      const ok = ['circle', 'square', 'diamond', 'triangle', 'image'];
      if (!ok.includes(shape)) return;
      setTokenShape(tokenId, shape);
      afterChange();
    });

    socket.on('token:delete', ({ tokenId }) => {
      if (!isDm()) return; // removing tokens is a DM action
      deleteToken(tokenId);
      afterChange();
    });

    socket.on('token:duplicate', ({ tokenId }) => {
      if (!isDm()) return; // duplicating tokens is a DM action
      duplicateToken(tokenId);
      afterChange();
    });

    socket.on('token:setHidden', ({ tokenId, hidden }) => {
      if (!isDm()) return; // hiding tokens from players is a DM action
      setTokenHidden(tokenId, hidden);
      afterChange();
    });

    socket.on('tokens:copy', ({ fromMapId, toMapId, kinds }) => {
      if (!isDm() || !getMap(fromMapId) || !getMap(toMapId)) return;
      const n = copyTokens(fromMapId, toMapId, kinds);
      afterChange();
      socket.emit('notice', {
        message: n
          ? `Brought ${n} token${n === 1 ? '' : 's'} to this map`
          : 'No new tokens to bring (already here)',
      });
    });

    socket.on('damage:apply', ({ kind, refId, amount }) => {
      const sid = sessionId();
      if (!sid || !Number.isFinite(amount)) return;
      applyDamage(kind, refId, amount);
      // Damage taken while concentrating prompts a CON save (DC from the amount).
      noteConcentration(sid, kind, refId, amount);
      afterChange();
    });

    // Grant temporary HP — same audience as damage:apply (quick in-combat
    // buff that sets the flat 2024-rules buffer pool, drained before real HP).
    socket.on('tempHp:set', ({ kind, refId, amount }) => {
      if (!sessionId() || !Number.isFinite(amount)) return;
      setTempHp(kind, refId, amount);
      afterChange();
    });

    // A player may only change status on their own claimed PC; the DM may change
    // any creature's. (Creatures stay DM-controlled.)
    const canEditConditions = (kind: TokenKind, refId: string): boolean =>
      isDm() || (kind === 'pc' && getCharacter(refId)?.claimedBy === socket.id);

    socket.on('condition:set', ({ kind, refId, condition }) => {
      if (!sessionId() || !canEditConditions(kind, refId)) return;
      const full: Condition = { id: newId(), ...condition };
      setCondition(kind, refId, full);
      afterChange();
    });

    socket.on('condition:clear', ({ kind, refId, conditionId }) => {
      if (!sessionId() || !canEditConditions(kind, refId)) return;
      clearCondition(kind, refId, conditionId);
      afterChange();
    });

    socket.on('character:claim', ({ characterId }) => {
      const sid = sessionId();
      if (!sid) return;
      const c = getCharacter(characterId);
      if (!c) return;
      const pid = getConn(socket.id)?.playerId ?? null;
      if (!isDm()) {
        // A character is "taken" only while another player is actively holding
        // it — live, or within their brief disconnect grace. Once that lapses,
        // anyone may claim (no offline lock). The same player may always reclaim.
        if (
          c.claimedBy &&
          c.claimedBy !== socket.id &&
          isClaimProtected(c.claimedBy) &&
          claimHolderPlayerId(c.claimedBy) !== pid
        ) {
          socket.emit('notice', {
            message: `${c.name} is being played by someone else.`,
          });
          return;
        }
      }
      claimCharacter(characterId, socket.id, isDm() ? null : pid);
      // One owned character per player → drop their claim on any other.
      if (pid) clearOwnershipElsewhere(sid, pid, characterId);
      afterChange();
    });

    // DM fallback: force a character free (e.g. a stuck claim) so anyone can grab
    // it. Clears the live claim and the last-holder record.
    socket.on('character:unlock', ({ characterId }) => {
      if (!isDm() || !getCharacter(characterId)) return;
      setCharacterOwner(characterId, null);
      afterChange();
    });

    socket.on('character:create', (p) => {
      const sid = sessionId();
      if (!sid || !p.name?.trim()) return; // DM or player may add a character
      const created = createCharacter(sid, {
        name: p.name,
        race: p.race,
        className: p.className,
        maxHp: p.maxHp,
        stats: p.stats,
      });
      // A player's new character is theirs from the start.
      const pid = getConn(socket.id)?.playerId;
      if (created && !isDm() && pid) {
        setCharacterOwner(created.id, pid);
        clearOwnershipElsewhere(sid, pid, created.id);
      }
      afterChange();
    });

    socket.on('character:loadFromLibrary', ({ name, claim }) => {
      const sid = sessionId();
      if (!sid || !name?.trim()) return; // DM or player may load a saved sheet
      const created = createCharacterFromLibrary(sid, name);
      // A player loading their own sheet claims (and thereby owns) it.
      if (created && claim && !isDm()) {
        const pid = getConn(socket.id)?.playerId ?? null;
        claimCharacter(created.id, socket.id, pid);
        if (pid) clearOwnershipElsewhere(sid, pid, created.id);
      }
      afterChange();
    });

    socket.on('character:update', ({ characterId, ...patch }) => {
      const c = getCharacter(characterId);
      // The DM or the owning player may edit a character's stat sheet.
      if (!c || (!isDm() && c.claimedBy !== socket.id)) return;
      updateCharacter(characterId, patch);
      afterChange();
    });

    socket.on('character:delete', ({ characterId }) => {
      if (!isDm()) return; // DM-only: prune a PC from the spawn list
      const c = getCharacter(characterId);
      if (!c) return;
      // Never delete a character a player is actively holding (still connected).
      if (isConnected(c.claimedBy)) {
        socket.emit('notice', {
          message: `Can't remove ${c.name} — it's claimed by an active player.`,
        });
        return;
      }
      deleteCharacter(characterId);
      afterChange();
    });

    socket.on('character:release', () => {
      const sid = sessionId();
      if (!sid) return;
      releaseClaims(socket.id);
      // An explicit "change character" gives it up for good — drop the
      // last-holder record so they don't get auto-reclaimed back onto it.
      const pid = getConn(socket.id)?.playerId;
      if (pid) clearOwnershipElsewhere(sid, pid);
      afterChange();
    });

    // ---- Resources & items (DM or the owning player) ----
    const ownsCharacter = (characterId: string): boolean => {
      const c = getCharacter(characterId);
      return !!c && (isDm() || c.claimedBy === socket.id);
    };
    // Who may edit/roll sheet abilities on a creature: a PC's owner or the DM;
    // monster sheet abilities are DM-authored (like monster:update).
    const ownsCreature = (kind: 'pc' | 'monster', refId: string): boolean =>
      kind === 'pc' ? ownsCharacter(refId) : isDm();

    socket.on('resource:set', ({ characterId, group, key, max, used, remove }) => {
      if (!key || !ownsCharacter(characterId)) return;
      setResource(characterId, group, key, { max, used, remove });
      afterChange();
    });

    socket.on('item:set', ({ characterId, item }) => {
      if (!item?.name?.trim() || !ownsCharacter(characterId)) return;
      setItem(characterId, item);
      afterChange();
    });

    socket.on('item:remove', ({ characterId, itemId }) => {
      if (!ownsCharacter(characterId)) return;
      removeItem(characterId, itemId);
      afterChange();
    });

    // ---- Object loot (DM fills containers; anyone who owns the target PC takes) ----
    socket.on('object:setLoot', ({ monsterId, loot }) => {
      if (!isDm()) return; // only the DM stocks loot (object OR creature)
      const sid = sessionId();
      if (!sid || !monsterInSession(monsterId, sid)) return;
      setLoot(monsterId, loot);
      afterChange();
    });

    socket.on('loot:take', ({ monsterId, characterId, itemId, gold, all }) => {
      const sid = sessionId();
      if (!sid || !monsterInSession(monsterId, sid)) return; // this session only
      const m = getMonster(monsterId);
      // The taker must own the destination character; players can only take from
      // a container/corpse whose contents are actually revealed to them.
      if (!m || !ownsCharacter(characterId)) return;
      if (!isDm() && !lootVisibleToPlayers(m)) return;
      takeLoot(monsterId, characterId, { itemId, gold, all });
      afterChange();
    });

    // A character attempts to disarm a trap (DM or the owning player). On success
    // the trap flips to "Disarmed" so it can't be triggered.
    socket.on('trap:disarm', ({ monsterId, characterId, advantage }) => {
      const sid = sessionId();
      if (!sid || !ownsCharacter(characterId)) return;
      const trap = getMonster(monsterId);
      const c = getCharacter(characterId);
      if (!trap || trap.objectKind !== 'trap' || !c) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const { success } = resolveTrapDisarm(
        sid,
        rollerName(sid, socket.id, isDm()),
        c,
        trap,
        adv,
      );
      if (success) {
        const armed = trap.conditions.find((x) => x.label.toLowerCase() === 'armed');
        if (armed) clearCondition('monster', monsterId, armed.id);
        if (!trap.conditions.some((x) => x.label.toLowerCase() === 'disarmed'))
          setCondition('monster', monsterId, {
            id: newId(),
            label: 'Disarmed',
            aura: 'green',
            isConcentration: false,
          });
      }
      afterChange();
    });

    // Player/DM interacts with a door or chest: open it (if not locked) or pick
    // its lock (a DEX check vs the object's DC; success clears Locked).
    socket.on('object:interact', ({ monsterId, characterId, action }) => {
      const sid = sessionId();
      if (!sid) return;
      const obj = getMonster(monsterId);
      if (!obj || (obj.objectKind !== 'door' && obj.objectKind !== 'chest')) return;
      const has = (label: string) =>
        obj.conditions.find((c) => c.label.toLowerCase() === label.toLowerCase());
      const locked = has('locked');

      if (action === 'unlock') {
        // Anyone who owns a PC may attempt the pick; the DM may force it open.
        if (!locked) return;
        if (isDm()) {
          clearCondition('monster', monsterId, locked.id);
          afterChange();
          return;
        }
        const c = characterId ? getCharacter(characterId) : undefined;
        if (!c || !ownsCharacter(c.id)) return;
        const { success } = resolveObjectCheck(
          sid,
          rollerName(sid, socket.id, false),
          c,
          obj,
          'unlock',
        );
        if (success) clearCondition('monster', monsterId, locked.id);
        afterChange();
        return;
      }

      // Open/close toggle — blocked while Locked (pick it first).
      if (action === 'open') {
        if (locked) return;
        const open = has('open');
        if (open) clearCondition('monster', monsterId, open.id);
        else
          setCondition('monster', monsterId, {
            id: newId(),
            label: 'Open',
            aura: 'green',
            isConcentration: false,
          });
        afterChange();
      }
    });

    // ---- Sheet spells/abilities (PC owner, or the DM for creatures) ----
    socket.on('ability:set', ({ kind, refId, ability }) => {
      if (!ability?.name?.trim() || !ownsCreature(kind, refId)) return;
      setSheetAbility(kind, refId, ability);
      afterChange();
    });

    socket.on('ability:remove', ({ kind, refId, abilityId }) => {
      if (!ownsCreature(kind, refId)) return;
      removeSheetAbility(kind, refId, abilityId);
      afterChange();
    });

    socket.on('ability:reorder', ({ kind, refId, orderedIds }) => {
      if (!Array.isArray(orderedIds) || !ownsCreature(kind, refId)) return;
      reorderSheetAbilities(kind, refId, orderedIds.filter((x) => typeof x === 'string'));
      afterChange();
    });

    socket.on('ability:roll', ({ kind, refId, abilityId, castLevel, advantage, targetTokenId }) => {
      const sid = sessionId();
      if (!sid || !ownsCreature(kind, refId)) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const tgt = typeof targetTokenId === 'string' ? targetTokenId : undefined;
      const cast = typeof castLevel === 'number' ? castLevel : undefined;
      const roller = rollerName(sid, socket.id, isDm());

      if (kind === 'monster') {
        const m = getMonster(refId);
        const ability = m?.sheetAbilities.find((a) => a.id === abilityId);
        if (!m || !ability) return;
        // CR-based DC/to-hit; no spell slots for creatures.
        if (resolveMonsterSheetAbility(sid, roller, m, ability, cast, adv, tgt)) afterChange();
        return;
      }

      const c = getCharacter(refId);
      const ability = c?.sheetAbilities.find((a) => a.id === abilityId);
      if (!c || !ability) return;
      const ok = resolveAbilityRoll(sid, roller, c, ability, cast, adv, tgt);
      // Casting a leveled spell (or activating a spell-backed stance like
      // Hunter's Mark) spends a slot at the level it was cast.
      const leveled =
        (ability.type === 'spell' || ability.type === 'stance') &&
        (ability.level ?? 0) >= 1;
      if (ok && leveled) {
        const base = ability.level as number;
        const c2 = typeof castLevel === 'number' ? Math.floor(castLevel) : base;
        const slotLevel = Math.min(9, Math.max(base, c2));
        const { hasSlot, spent } = spendSpellSlot(refId, slotLevel);
        if (hasSlot && !spent) {
          socket.emit('notice', {
            message: `No level-${slotLevel} spell slot remaining for ${ability.name}.`,
          });
        }
      }
      // A non-spell ability that shares its name with a class-resource counter
      // (Second Wind, Bardic Inspiration…) spends one use on cast. Soft: an
      // empty pool never blocks the roll, it just nudges the player.
      if (ok && !leveled) {
        const { matched, spent } = spendResourceForAbility(refId, ability.name);
        if (matched && !spent) {
          socket.emit('notice', {
            message: `No uses of ${ability.name} remaining.`,
          });
        }
      }
      if (ok) afterChange();
    });

    // Roll a death saving throw for a downed PC (owner or DM).
    socket.on('death:roll', ({ characterId }) => {
      const sid = sessionId();
      if (!sid || !ownsCharacter(characterId)) return;
      if (resolveDeathSave(sid, characterId)) afterChange();
    });

    // Shared in-session chat (anyone in the session).
    socket.on('chat:send', ({ text, speakAsTokenId }) => {
      const sid = sessionId();
      const body = typeof text === 'string' ? text.trim() : '';
      if (!sid || !body) return;
      // "/roll 2d6+3 [adv|dis]" (or "/r …") typed into chat rolls server-side
      // into the shared roll log instead of posting a message — the combined
      // feed shows the result inline where the chat line would have been.
      const cmd = parseRollCommand(body);
      if (cmd) {
        const result = rollDice(cmd.expr, cmd.advantage);
        if (!result) {
          socket.emit('notice', { message: `Invalid dice: "${cmd.expr}"` });
          return;
        }
        addRollLog(sid, {
          roller: rollerName(sid, socket.id, isDm()),
          label: '',
          expr: result.expr,
          total: result.total,
          detail: result.detail,
        });
        afterChange();
        return;
      }
      // The DM may "speak as" a selected token (NPC/monster/PC): the message is
      // attributed to that token's name and the bubble pops over it. Falls back to
      // a plain "DM" message if no/invalid token is given.
      const speakToken =
        isDm() && typeof speakAsTokenId === 'string' ? getToken(speakAsTokenId) : null;
      const speakEntity = speakToken
        ? speakToken.kind === 'pc'
          ? getCharacter(speakToken.refId)
          : getMonster(speakToken.refId)
        : null;
      // Only speak as a token belonging to THIS session.
      const speakAs = speakEntity && speakEntity.sessionId === sid ? speakEntity : null;
      const sender = speakAs ? speakAs.name : rollerName(sid, socket.id, isDm());
      addChatMessage(sid, sender, isDm() ? 'dm' : 'player', body);
      // Pop the words in a speech bubble over the speaker's token. Players bubble
      // over their claimed PC; the DM bubbles over the token they're speaking as.
      if (speakAs) {
        broadcastSay(io, sid, speakToken!.refId, body.slice(0, 240));
      } else if (!isDm()) {
        const refId = getClaimedCharacterId(sid, socket.id);
        if (refId) broadcastSay(io, sid, refId, body.slice(0, 240));
      }
      afterChange();
    });

    // Ephemeral "I'm typing" ping → a typing bubble over the player's PC token.
    socket.on('chat:typing', ({ typing }) => {
      const sid = sessionId();
      if (!sid || isDm()) return; // DMs have no PC token to bubble over
      const refId = getClaimedCharacterId(sid, socket.id);
      if (refId) broadcastTyping(io, sid, socket.id, refId, !!typing);
    });

    // Live "laser pointer": relay my cursor to others on the same map.
    socket.on('cursor:move', ({ x, y, mapId }) => {
      const sid = sessionId();
      if (!sid || !Number.isFinite(x) || !Number.isFinite(y) || typeof mapId !== 'string') return;
      broadcastCursor(io, sid, socket.id, rollerName(sid, socket.id, isDm()), x, y, mapId);
    });
    socket.on('cursor:hide', () => {
      const sid = sessionId();
      if (sid) broadcastCursorHide(io, sid, socket.id);
    });

    // DM-only rules assistant. The DM's question and the answer are posted as
    // DM-only chat messages (filtered from players in visibility.ts) and answered
    // by a local Ollama model, falling back to Gemini. Fail-safe: posts a notice
    // if no backend is reachable.
    socket.on('assistant:ask', async ({ question, backend }) => {
      const sid = sessionId();
      const q = typeof question === 'string' ? question.trim() : '';
      if (!sid || !isDm() || !q) return;
      // Sanitize the chat's backend choice (prefer + an Ollama model name).
      const opts =
        backend && typeof backend === 'object'
          ? {
              prefer: backend.prefer === 'local' ? ('local' as const) : ('gemini' as const),
              ...(typeof backend.ollamaModel === 'string'
                ? { ollamaModel: backend.ollamaModel.slice(0, 80) }
                : {}),
            }
          : {};
      // Show the question in the DM's feed immediately, then think. Other chat
      // keeps flowing while we await (the handler yields, never blocks).
      addChatMessage(sid, 'DM', 'dm', `❓ ${q.slice(0, 500)}`, true);
      afterChange();
      // A cancellable, long-running request (the Stop button aborts it).
      const controller = new AbortController();
      assistantInFlight.set(socket.id, controller);
      socket.emit('assistant:thinking', { thinking: true });
      let result: { answer: string | null; pages: number[] } = { answer: null, pages: [] };
      try {
        result = await answerRules(q, { ...opts, signal: controller.signal, timeoutMs: 600_000 });
      } catch (err) {
        console.warn('  [assistant] failed:', (err as Error).message);
      } finally {
        assistantInFlight.delete(socket.id);
        socket.emit('assistant:thinking', { thinking: false });
      }
      if (controller.signal.aborted) {
        // Stopped by the DM — note it, don't post a stale answer.
        addChatMessage(sid, '📖 Rules Assistant', 'dm', '⏹ Stopped.', true);
        afterChange();
        socket.emit('notice', { message: 'Rules assistant stopped' });
        return;
      }
      addChatMessage(
        sid,
        '📖 Rules Assistant',
        'dm',
        result.answer ??
          'Rules assistant is unavailable. Start a local Ollama server (or set a Gemini API key in Settings) and try again.',
        true,
        result.answer ? result.pages : [],
      );
      afterChange();
      socket.emit('notice', { message: result.answer ? 'Rules assistant answered' : 'Rules assistant unavailable' });
    });

    // DM-only: stop the in-flight rules-assistant request.
    socket.on('assistant:cancel', () => {
      assistantInFlight.get(socket.id)?.abort();
    });

    // DM-only: "Previously on…" recap of recent rolls + chat, posted to chat for
    // everyone (so returning players can catch up).
    socket.on('assistant:recap', async () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const rolls = listRollLog(sid, 60).map((r) => ({
        t: r.createdAt,
        line: `[roll] ${r.roller}: ${r.detail}${r.description ? ` (${r.description})` : ''}`,
      }));
      const chat = listChat(sid, 60)
        .filter((c) => !c.dmOnly)
        .map((c) => ({ t: c.createdAt, line: `[chat] ${c.sender}: ${c.text}` }));
      const transcript = [...rolls, ...chat]
        .sort((a, b) => a.t - b.t)
        .map((x) => x.line)
        .join('\n')
        .slice(-6000); // keep the most recent if very long
      let recap: string | null = null;
      try {
        recap = await recapSession(transcript);
      } catch (err) {
        console.warn('  [recap] failed:', (err as Error).message);
      }
      if (recap) {
        addChatMessage(sid, '📜 Recap', 'dm', recap); // visible to everyone
        afterChange();
      }
      socket.emit('notice', { message: recap ? 'Session recap posted' : 'Could not generate a recap' });
    });

    // DM-only: make a creature speak an AI-generated in-character line, floated
    // as a speech bubble over its token (reuses the chat-bubble system).
    socket.on('creature:speak', async ({ tokenId }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const t = getToken(tokenId);
      if (!t || t.kind === 'pc') return; // voice monsters/NPCs, not PCs
      const m = getMonster(t.refId);
      if (!m) return;
      const conds = m.conditions?.map((c) => c.label).join(', ');
      const describe =
        `Creature: ${m.name}${m.creatureType ? ` (${m.creatureType})` : ''}. ` +
        `Disposition toward the party: ${m.disposition ?? 'enemy'}. ` +
        `${m.maxHp > 0 && m.curHp <= m.maxHp * 0.35 ? 'It is badly wounded. ' : ''}` +
        `${conds ? `Current conditions: ${conds}. ` : ''}` +
        `Give its one spoken line right now.`;
      let line: string | null = null;
      try {
        line = await creatureLine(describe);
      } catch (err) {
        console.warn('  [speak] failed:', (err as Error).message);
      }
      if (line) broadcastSay(io, sid, t.refId, line);
      socket.emit('notice', { message: line ? `${m.name} speaks` : 'No AI backend for dialogue' });
    });

    // "Apply damage" click-to-target: roll one creature's save vs a logged spell's
    // DC and auto-apply full/half of the rolled amount — DM only.
    socket.on('save:resolve', ({ rollId, tokenId, advantage, instanceIndex }) => {
      const sid = sessionId();
      if (!sid) return;
      if (typeof rollId !== 'string' || typeof tokenId !== 'string') return;
      // The DM resolves any apply; a player may resolve ONLY their own split
      // spell's darts (Magic Missile), identified by the caster `owner` on the
      // roll entry — the click-to-assign path is no longer DM-gated for those.
      const owner = getRollEntry(rollId)?.apply?.owner;
      const allowed =
        isDm() || (!!owner && getCharacter(owner)?.claimedBy === socket.id);
      if (!allowed) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const idx = typeof instanceIndex === 'number' ? instanceIndex : undefined;
      resolveForcedSave(sid, rollId, tokenId, adv, idx);
      afterChange();
    });

    socket.on('skill:roll', ({ characterId, skill, advantage }) => {
      const sid = sessionId();
      if (!sid || typeof skill !== 'string' || !ownsCharacter(characterId)) return;
      const c = getCharacter(characterId);
      if (!c) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const ok = resolveSkillRoll(
        sid,
        rollerName(sid, socket.id, isDm()),
        c,
        skill,
        adv,
      );
      if (ok) afterChange();
    });

    // Click a stat block ability to roll that creature's saving throw. A PC's
    // save may be rolled by its owner or the DM; a monster's by the DM only.
    socket.on('save:roll', ({ kind, refId, ability, advantage }) => {
      const sid = sessionId();
      if (!sid || typeof ability !== 'string' || typeof refId !== 'string') return;
      const allowed = kind === 'pc' ? ownsCharacter(refId) : isDm();
      if (!allowed) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const ok = resolveSave(sid, rollerName(sid, socket.id, isDm()), kind, refId, ability, adv);
      if (ok) afterChange();
    });

    socket.on('check:roll', ({ kind, refId, ability, advantage }) => {
      const sid = sessionId();
      if (!sid || typeof ability !== 'string' || typeof refId !== 'string') return;
      const allowed = kind === 'pc' ? ownsCharacter(refId) : isDm();
      if (!allowed) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const ok = resolveCheck(sid, rollerName(sid, socket.id, isDm()), kind, refId, ability, adv);
      if (ok) afterChange();
    });

    socket.on('ai:fillCharacter', async ({ characterId }) => {
      const c = getCharacter(characterId);
      if (!c || (!isDm() && c.claimedBy !== socket.id)) return;
      const res = await aiFillCharacter(characterId);
      if (res.ok) {
        afterChange();
        socket.emit('notice', {
          message: `Filled ${res.filled} missing field${
            res.filled === 1 ? '' : 's'
          } with AI`,
        });
      } else {
        socket.emit('notice', {
          message:
            res.reason === 'no-key'
              ? 'No AI key configured'
              : res.reason === 'nothing'
              ? 'Nothing missing to fill'
              : 'AI lookup failed',
        });
      }
    });

    socket.on('ai:createCharacter', async ({ description }) => {
      const sid = sessionId();
      if (!sid || !description?.trim()) return; // DM or player may generate
      const res = await aiCreateCharacter(sid, description.trim());
      if (res.ok) {
        afterChange();
        socket.emit('notice', { message: `Created ${res.character.name} with AI` });
      } else {
        socket.emit('notice', {
          message:
            res.reason === 'no-key' ? 'No AI key configured' : 'AI lookup failed',
        });
      }
    });

    // ---- Bulk multi-select token edits ----

    socket.on('tokens:damage', ({ tokenIds, amount }) => {
      if (!sessionId() || !Array.isArray(tokenIds) || !Number.isFinite(amount))
        return;
      damageTokens(tokenIds, amount);
      afterChange();
    });

    socket.on('tokens:setHidden', ({ tokenIds, hidden }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      setTokensHidden(tokenIds, hidden);
      afterChange();
    });

    socket.on('tokens:setCondition', ({ tokenIds, condition }) => {
      // Bulk condition edits are a DM-only (Data view) tool.
      if (!isDm() || !Array.isArray(tokenIds) || !condition) return;
      setTokensCondition(tokenIds, condition);
      afterChange();
    });

    socket.on('tokens:clearConditions', ({ tokenIds }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      clearTokensConditions(tokenIds);
      afterChange();
    });

    socket.on('monster:create', (p) => {
      const sid = sessionId();
      if (!sid || !isDm() || !p.name?.trim()) return; // DM action
      createMonsterTemplate(sid, {
        name: p.name,
        maxHp: p.maxHp,
        creatureType: p.creatureType,
        level: p.level,
        armorClass: p.armorClass,
        speed: p.speed,
        stats: p.stats,
        resistances: p.resistances,
        weaknesses: p.weaknesses,
        actions: p.actions,
        abilities: p.abilities,
        sheetAbilities: p.sheetAbilities,
        weapons: p.weapons,
        icon: p.icon,
        disposition: p.disposition,
        objectKind: p.objectKind,
        source: p.source,
      });
      afterChange();
    });

    socket.on('monster:update', ({ monsterId, ...patch }) => {
      const sid = sessionId();
      // Editing creature stats is a DM action, scoped to the DM's own session.
      if (!sid || !isDm() || !monsterInSession(monsterId, sid)) return;
      updateMonster(monsterId, patch);
      afterChange();
    });

    socket.on('monster:delete', ({ monsterId }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !monsterInSession(monsterId, sid)) return;
      deleteMonster(monsterId);
      afterChange();
    });

    // Shared party notes — any joined client (DM or player) may edit, scoped to
    // their own session so notes can't leak/write across sessions.
    socket.on('creature:setNotes', ({ monsterId, notes }) => {
      const sid = sessionId();
      if (!sid || getMonster(monsterId)?.sessionId !== sid) return;
      setMonsterPlayerNotes(monsterId, notes);
      afterChange();
    });

    socket.on('ai:fillCreature', async ({ monsterId }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !monsterInSession(monsterId, sid)) return;
      const res = await aiFillCreature(monsterId);
      if (res.ok) {
        afterChange();
        socket.emit('notice', {
          message: `Filled ${res.filled} missing field${
            res.filled === 1 ? '' : 's'
          } with AI`,
        });
      } else {
        const msg =
          res.reason === 'no-key'
            ? 'No AI key configured'
            : res.reason === 'nothing'
            ? 'Nothing missing to fill'
            : 'AI lookup failed';
        socket.emit('notice', { message: msg });
      }
    });

    socket.on('tokens:setIcon', ({ tokenIds, icon }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      for (const id of tokenIds) {
        const t = getToken(id);
        if (t) setEntityIcon(t.kind, t.refId, icon);
      }
      afterChange();
    });

    socket.on('tokens:setHideCombatRole', ({ tokenIds, hide }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      setTokensHideCombatRole(tokenIds, hide);
      afterChange();
    });

    socket.on('tokens:setCombatRole', ({ tokenIds, role }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      setTokensCombatRole(tokenIds, role);
      afterChange();
    });

    socket.on('initiative:set', ({ tokenId, initiative }) => {
      if (!sessionId() || !isDm()) return;
      setTokenInitiative(tokenId, initiative);
      afterChange();
    });

    socket.on('initiative:rollAll', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const activeMapId = getSessionById(sid)?.activeMapId;
      if (!activeMapId) return;
      // Roll-all resets combat: re-roll everyone, start at the top, round 1.
      rollAllInitiative(activeMapId);
      setActiveTurn(sid, firstInInitiative(activeMapId));
      setCombatRound(sid, 1);
      afterChange();
    });

    socket.on('initiative:rollMissing', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const activeMapId = getSessionById(sid)?.activeMapId;
      if (!activeMapId) return;
      // Only roll latecomers; if combat hasn't started, highlight the top and
      // open round 1. Mid-fight, the round counter is left alone.
      rollMissingInitiative(activeMapId);
      const ses = getSessionById(sid);
      if (!ses?.activeTurnTokenId) {
        setActiveTurn(sid, firstInInitiative(activeMapId));
        if (!ses?.combatRound) setCombatRound(sid, 1);
      }
      afterChange();
    });

    socket.on('initiative:next', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      advanceTurn(sid);
      afterChange();
    });

    // A player may end the turn ONLY when the active combatant is their own
    // claimed PC (the DM still advances anyone via initiative:next).
    socket.on('initiative:endTurn', () => {
      const sid = sessionId();
      if (!sid) return;
      if (!isDm()) {
        const activeId = getSessionById(sid)?.activeTurnTokenId;
        if (!activeId) return;
        const tok = getToken(activeId);
        const mine = getClaimedCharacterId(sid, socket.id);
        if (!tok || tok.kind !== 'pc' || !mine || tok.refId !== mine) return;
      }
      advanceTurn(sid);
      afterChange();
    });

    socket.on('initiative:clear', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      clearInitiative(sid); // also zeroes the round counter
      afterChange();
    });

    // DM edits the round counter directly (fix a miscount / re-count after a
    // narrative break) without touching anyone's rolls.
    socket.on('initiative:setRound', ({ round }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !Number.isFinite(round)) return;
      setCombatRound(sid, Math.min(999, Math.max(0, Math.round(round))));
      afterChange();
    });

    socket.on('session:setHideDmRolls', ({ hide }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      setHideDmRolls(sid, !!hide);
      afterChange();
    });

    socket.on('dice:roll', ({ expr, label, advantage }) => {
      const sid = sessionId();
      if (!sid || typeof expr !== 'string') return;
      const result = rollDice(expr.trim(), advantage);
      if (!result) {
        socket.emit('notice', { message: `Invalid dice: "${expr}"` });
        return;
      }
      addRollLog(sid, {
        roller: rollerName(sid, socket.id, isDm()),
        label: (label ?? '').slice(0, 40),
        expr: result.expr,
        total: result.total,
        detail: result.detail,
      });
      afterChange();
    });

    socket.on('dice:clearLog', () => {
      const sid = sessionId();
      if (!sid) return;
      clearRollLog(sid);
      afterChange();
    });

    socket.on(
      'combat:attack',
      ({ attackerTokenId, targetTokenId, weaponIndex, advantage, offhand, twoHanded }) => {
        const sid = sessionId();
        if (!sid) return;
        const at = getToken(attackerTokenId);
        if (!at) return;
        // DM may attack with anyone. A player may attack with their own claimed
        // PC, or with a friendly creature (e.g. a companion/summon they control).
        if (!isDm()) {
          if (at.kind === 'pc') {
            const ch = getCharacter(at.refId);
            if (!ch || ch.claimedBy !== socket.id) return;
          } else {
            const m = getMonster(at.refId);
            if (!m || m.disposition !== 'friendly') return;
          }
        }
        // Attribute the roll to the ATTACKING creature, not the player's own PC,
        // so attacking as a friendly companion/summon reads as that creature (for
        // a player's own token the name is the same). The DM stays "DM".
        const attackerName =
          at.kind === 'pc' ? getCharacter(at.refId)?.name : getMonster(at.refId)?.name;
        const roller = isDm()
          ? 'DM'
          : attackerName ?? rollerName(sid, socket.id, false);
        resolveAttack(
          sid,
          roller,
          attackerTokenId,
          targetTokenId,
          weaponIndex,
          advantage,
          !!offhand,
          !!twoHanded,
        );
        afterChange();
      },
    );

    socket.on('combat:save', ({ tokenIds, ability, dc, advantage, advantageByToken }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !Array.isArray(tokenIds) || !Number.isFinite(dc))
        return;
      resolveSaves(sid, 'DM', tokenIds, String(ability), dc, advantage, advantageByToken);
      afterChange();
    });

    socket.on('disconnect', () => {
      const sid = sessionId();
      const playerId = getConn(socket.id)?.playerId ?? null;
      assistantInFlight.get(socket.id)?.abort(); // stop any in-flight LLM call
      assistantInFlight.delete(socket.id);
      if (sid) broadcastCursorHide(io, sid, socket.id); // clear my laser pointer
      dropConn(socket.id);
      if (sid) {
        // Hold the claim through a short grace window (handed back if they
        // reconnect, freed if they don't) instead of de-selecting on a blip.
        scheduleRelease(sid, socket.id, playerId);
        broadcastSnapshots(io, sid);
      } else {
        releaseClaims(socket.id);
      }
    });
  });
}
