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
  applyDamage,
  claimCharacter,
  clearCondition,
  createMonster,
  createToken,
  getMap,
  getSessionByCode,
  moveToken,
  releaseClaims,
  resizeToken,
  setActiveMap,
  setCondition,
  setTokenInitiative,
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

    socket.on('token:spawn', (p) => {
      if (!isDm()) return; // spawning is a DM action in the MVP
      if (!getMap(p.mapId)) return;
      createToken({
        mapId: p.mapId,
        kind: p.kind,
        refId: p.refId,
        x: p.x,
        y: p.y,
      });
      afterChange();
    });

    // ---- Shared: anyone in the session may move/resize tokens (per spec) ----

    socket.on('token:move', ({ tokenId, x, y }) => {
      if (!sessionId()) return;
      moveToken(tokenId, x, y);
      afterChange();
    });

    socket.on('token:resize', ({ tokenId, size }) => {
      if (!sessionId()) return;
      resizeToken(tokenId, size);
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

    socket.on('monster:create', ({ name, maxHp, creatureType }) => {
      const sid = sessionId();
      if (!sid || !isDm()) return; // monster creation is a DM action
      createMonster(sid, { name, maxHp, creatureType });
      afterChange();
    });

    socket.on('initiative:set', ({ tokenId, initiative }) => {
      if (!sessionId() || !isDm()) return;
      setTokenInitiative(tokenId, initiative);
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
