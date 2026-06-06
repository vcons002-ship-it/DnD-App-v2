import { config } from './config.js';
import { newId } from './db.js';
import { rollDice } from '../../shared/dice.js';
import {
  resolveAttack,
  resolveAbilityRoll,
  resolveSkillRoll,
  resolveSaves,
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
  roomName,
  sendSnapshot,
  setConn,
  type IOServer,
} from './connections.js';
import { buildSnapshot } from './visibility.js';
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
  addMeasurement,
  clearMeasurements,
  removeMeasurement,
  setResource,
  setItem,
  removeItem,
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
  moveToken,
  firstInInitiative,
  releaseClaims,
  renameMap,
  renameSession,
  resizeToken,
  updateMapGrid,
  rollAllInitiative,
  rollMissingInitiative,
  rollerName,
  setActiveMap,
  setActiveTurn,
  setCondition,
  setTokenInitiative,
  touchSession,
  updateMonster,
} from './sessions.js';
import type { Condition } from '../../shared/types.js';

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

    socket.on('map:setGrid', ({ mapId, gridSizePx, feetPerSquare, widthFt }) => {
      if (!isDm() || !getMap(mapId)) return;
      const px = Math.round(Math.max(10, Math.min(400, gridSizePx)));
      const ft = Math.round(Math.max(1, Math.min(100, feetPerSquare)));
      // 0 = unset (fall back to feet-per-square); otherwise clamp to a sane span.
      const w = widthFt <= 0 ? 0 : Math.max(1, Math.min(100000, widthFt));
      updateMapGrid(mapId, px, ft, w);
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

    socket.on('session:rename', ({ name }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      renameSession(sid, name);
      afterChange();
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
      moveToken(tokenId, x, y);
      afterChange();
    });

    socket.on('token:resize', ({ tokenId, size }) => {
      if (!isDm()) return; // resizing is a DM action; players may only move
      resizeToken(tokenId, size);
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
      if (!sessionId() || !Number.isFinite(amount)) return;
      applyDamage(kind, refId, amount);
      afterChange();
    });

    socket.on('condition:set', ({ kind, refId, condition }) => {
      if (!sessionId()) return;
      const full: Condition = { id: newId(), ...condition };
      setCondition(kind, refId, full);
      afterChange();
    });

    socket.on('condition:clear', ({ kind, refId, conditionId }) => {
      if (!sessionId()) return;
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

    // ---- Sheet spells/abilities (DM or the owning player) ----
    socket.on('ability:set', ({ characterId, ability }) => {
      if (!ability?.name?.trim() || !ownsCharacter(characterId)) return;
      setSheetAbility(characterId, ability);
      afterChange();
    });

    socket.on('ability:remove', ({ characterId, abilityId }) => {
      if (!ownsCharacter(characterId)) return;
      removeSheetAbility(characterId, abilityId);
      afterChange();
    });

    socket.on('ability:roll', ({ characterId, abilityId, castLevel, advantage }) => {
      const sid = sessionId();
      if (!sid || !ownsCharacter(characterId)) return;
      const c = getCharacter(characterId);
      const ability = c?.sheetAbilities.find((a) => a.id === abilityId);
      if (!c || !ability) return;
      const adv = advantage === 'adv' || advantage === 'dis' ? advantage : undefined;
      const ok = resolveAbilityRoll(
        sid,
        rollerName(sid, socket.id, isDm()),
        c,
        ability,
        typeof castLevel === 'number' ? castLevel : undefined,
        adv,
      );
      // Casting a leveled spell spends a slot at the level it was cast.
      if (ok && ability.type === 'spell' && (ability.level ?? 0) >= 1) {
        const base = ability.level as number;
        const cast = typeof castLevel === 'number' ? Math.floor(castLevel) : base;
        const slotLevel = Math.min(9, Math.max(base, cast));
        const { hasSlot, spent } = spendSpellSlot(characterId, slotLevel);
        if (hasSlot && !spent) {
          socket.emit('notice', {
            message: `No level-${slotLevel} spell slot remaining for ${ability.name}.`,
          });
        }
      }
      if (ok) afterChange();
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
      if (!sessionId() || !Array.isArray(tokenIds) || !condition) return;
      setTokensCondition(tokenIds, condition);
      afterChange();
    });

    socket.on('tokens:clearConditions', ({ tokenIds }) => {
      if (!sessionId() || !Array.isArray(tokenIds)) return;
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
        weapons: p.weapons,
        icon: p.icon,
        disposition: p.disposition,
        source: p.source,
      });
      afterChange();
    });

    socket.on('monster:update', ({ monsterId, ...patch }) => {
      if (!isDm() || !monsterId) return; // editing creature stats is a DM action
      updateMonster(monsterId, patch);
      afterChange();
    });

    socket.on('monster:delete', ({ monsterId }) => {
      if (!isDm()) return;
      deleteMonster(monsterId);
      afterChange();
    });

    socket.on('ai:fillCreature', async ({ monsterId }) => {
      if (!isDm()) return;
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
      // Roll-all resets the round: re-roll everyone, then start at the top.
      rollAllInitiative(activeMapId);
      setActiveTurn(sid, firstInInitiative(activeMapId));
      afterChange();
    });

    socket.on('initiative:rollMissing', () => {
      const sid = sessionId();
      if (!sid || !isDm()) return;
      const activeMapId = getSessionById(sid)?.activeMapId;
      if (!activeMapId) return;
      // Only roll latecomers; if combat hasn't started, highlight the top.
      rollMissingInitiative(activeMapId);
      if (!getSessionById(sid)?.activeTurnTokenId) {
        setActiveTurn(sid, firstInInitiative(activeMapId));
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
      clearInitiative(sid);
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
        // DM, or the player who owns the attacking PC token.
        if (!isDm()) {
          if (at.kind !== 'pc') return;
          const ch = getCharacter(at.refId);
          if (!ch || ch.claimedBy !== socket.id) return;
        }
        resolveAttack(
          sid,
          rollerName(sid, socket.id, isDm()),
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

    socket.on('combat:save', ({ tokenIds, ability, dc, advantage }) => {
      const sid = sessionId();
      if (!sid || !isDm() || !Array.isArray(tokenIds) || !Number.isFinite(dc))
        return;
      resolveSaves(sid, 'DM', tokenIds, String(ability), dc, advantage);
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
