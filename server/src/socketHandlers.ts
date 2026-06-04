import { config } from './config.js';
import { newId } from './db.js';
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
  copyTokens,
  duplicateToken,
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
      copyTokens(fromMapId, toMapId, kinds);
      afterChange();
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

    socket.on('monster:create', (p) => {
      const sid = sessionId();
      if (!sid || !isDm() || !p.name?.trim()) return; // DM action
      createMonsterTemplate(sid, {
        name: p.name,
        maxHp: p.maxHp,
        creatureType: p.creatureType,
        armorClass: p.armorClass,
        speed: p.speed,
        stats: p.stats,
        resistances: p.resistances,
        weaknesses: p.weaknesses,
        actions: p.actions,
        abilities: p.abilities,
        icon: p.icon,
        source: p.source,
      });
      afterChange();
    });

    socket.on('monster:delete', ({ monsterId }) => {
      if (!isDm()) return;
      deleteMonster(monsterId);
      afterChange();
    });

    socket.on('tokens:setIcon', ({ tokenIds, icon }) => {
      if (!isDm() || !Array.isArray(tokenIds)) return;
      for (const id of tokenIds) {
        const t = getToken(id);
        if (t) setEntityIcon(t.kind, t.refId, icon);
      }
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
