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
  dropConn,
  getConn,
  isConnected,
  roomName,
  sendSnapshot,
  setConn,
  type IOServer,
} from './connections.js';
import { buildSnapshot, lootVisibleToPlayers } from './visibility.js';
import {
  addRollLog,
  advanceTurn,
  applyDamage,
  claimCharacter,
  clearCondition,
  clearInitiative,
  clearRollLog,
  clearTokensConditions,
  copyTokens,
  createCharacter,
  createCharacterFromLibrary,
  updateCharacter,
  getCharacter,
  getMonster,
  addMeasurement,
  clearMeasurements,
  removeMeasurement,
  addAnnotation,
  clearAnnotations,
  removeAnnotation,
  setResource,
  setItem,
  removeItem,
  setLoot,
  takeLoot,
  setSheetAbility,
  removeSheetAbility,
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
  updateMapGrid,
  rollAllInitiative,
  rollMissingInitiative,
  setCombatRound,
  setHideDmRolls,
  rollerName,
  addChatMessage,
  setActiveMap,
  setActiveTurn,
  setCondition,
  setTokenInitiative,
  touchSession,
  updateMonster,
} from './sessions.js';
import type { Condition, TokenKind } from '../../shared/types.js';

export function registerSocketHandlers(io: IOServer): void {
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

      setConn(socket.id, {
        sessionId: session.id,
        role: payload.role,
        viewMapId: session.activeMapId,
      });
      socket.join(roomName(session.id));
      touchSession(session.id); // keep the resume directory fresh

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

    socket.on('annotation:remove', ({ id }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || !id) return;
      removeAnnotation(id, conn.role === 'dm' ? undefined : rollerName(sid, socket.id, false));
      afterChange();
    });

    socket.on('annotation:clear', ({ mapId, mineOnly }) => {
      const sid = sessionId();
      const conn = getConn(socket.id);
      if (!sid || !conn || !getMap(mapId)) return;
      const onlyMine = mineOnly || conn.role !== 'dm';
      clearAnnotations(mapId, onlyMine ? rollerName(sid, socket.id, false) : undefined);
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
      // enemy/neutral tokens are the DM's. Hidden tokens are never sent to
      // players, so a non-DM move of one is stale/forged.
      if (!isDm()) {
        const t = getToken(tokenId);
        if (!t || t.isHidden) return;
        if (
          t.kind === 'monster' &&
          getMonster(t.refId)?.disposition !== 'friendly'
        )
          return;
      }
      moveToken(tokenId, x, y);
      afterChange();
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
      if (!sessionId()) return;
      claimCharacter(characterId, socket.id);
      afterChange();
    });

    socket.on('character:create', (p) => {
      const sid = sessionId();
      if (!sid || !p.name?.trim()) return; // DM or player may add a character
      createCharacter(sid, {
        name: p.name,
        race: p.race,
        className: p.className,
        maxHp: p.maxHp,
        stats: p.stats,
      });
      afterChange();
    });

    socket.on('character:loadFromLibrary', ({ name, claim }) => {
      const sid = sessionId();
      if (!sid || !name?.trim()) return; // DM or player may load a saved sheet
      const created = createCharacterFromLibrary(sid, name);
      // A player loading their own sheet claims it immediately.
      if (created && claim && !isDm()) claimCharacter(created.id, socket.id);
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
      if (!sessionId()) return;
      releaseClaims(socket.id);
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
      if (
        ok &&
        (ability.type === 'spell' || ability.type === 'stance') &&
        (ability.level ?? 0) >= 1
      ) {
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
      if (ok) afterChange();
    });

    // Roll a death saving throw for a downed PC (owner or DM).
    socket.on('death:roll', ({ characterId }) => {
      const sid = sessionId();
      if (!sid || !ownsCharacter(characterId)) return;
      if (resolveDeathSave(sid, characterId)) afterChange();
    });

    // Shared in-session chat (anyone in the session).
    socket.on('chat:send', ({ text }) => {
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
      addChatMessage(sid, rollerName(sid, socket.id, isDm()), isDm() ? 'dm' : 'player', body);
      afterChange();
    });

    // "Apply damage" click-to-target: roll one creature's save vs a logged spell's
    // DC and auto-apply full/half of the rolled amount — DM only.
    socket.on('save:resolve', ({ rollId, tokenId, advantage, instanceIndex }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      if (typeof rollId !== 'string' || typeof tokenId !== 'string') return;
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
      releaseClaims(socket.id);
      const sid = sessionId();
      dropConn(socket.id);
      if (sid) broadcastSnapshots(io, sid);
    });
  });
}
