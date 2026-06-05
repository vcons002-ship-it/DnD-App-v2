import { config } from './config.js';
import { newId } from './db.js';
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
  advanceTurn,
  applyDamage,
  claimCharacter,
  clearCondition,
  clearInitiative,
  clearTokensConditions,
  copyTokens,
  createCharacter,
  updateCharacter,
  getCharacter,
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
  setFogMode,
  setTokenHidden,
  setTokensHideCombatRole,
  setTokensCombatRole,
  getActiveMapId,
  getMap,
  getSessionById,
  getSessionByCode,
  getToken,
  moveToken,
  releaseClaims,
  resizeToken,
  rollAllInitiative,
  setActiveMap,
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

    socket.on('fog:setMode', ({ mapId, mode }) => {
      if (!isDm() || !getMap(mapId)) return;
      setFogMode(mapId, mode);
      afterChange();
    });

    socket.on('fog:paint', ({ mapId, cells, reveal }) => {
      if (!isDm() || !getMap(mapId) || !Array.isArray(cells)) return;
      paintFog(mapId, cells, reveal);
      afterChange();
    });

    socket.on('fog:cover', ({ mapId }) => {
      if (!isDm() || !getMap(mapId)) return;
      coverFog(mapId);
      afterChange();
    });

    socket.on('token:spawn', (p) => {
      if (!isDm()) return; // spawning is a DM action in the MVP
      if (!getMap(p.mapId)) return;
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
      rollAllInitiative(activeMapId);
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

    socket.on('disconnect', () => {
      releaseClaims(socket.id);
      const sid = sessionId();
      dropConn(socket.id);
      if (sid) broadcastSnapshots(io, sid);
    });
  });
}
