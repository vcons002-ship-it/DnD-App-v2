import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  Role,
  ServerToClientEvents,
} from '../../shared/types.js';
import { buildSnapshot, createSnapshotBuilder } from './visibility.js';
import { drainHpFx } from './sessions.js';

export type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Per-connection state we track for routing snapshots. */
export type Conn = {
  sessionId: string;
  role: Role;
  /** DM's currently-selected map for prep (players ignore this). */
  viewMapId: string | null;
  /** Durable per-browser id from the join handshake (character ownership). */
  playerId: string | null;
};

const conns = new Map<string, Conn>();

export const setConn = (socketId: string, conn: Conn): void => {
  conns.set(socketId, conn);
};
export const getConn = (socketId: string): Conn | undefined => conns.get(socketId);
export const dropConn = (socketId: string): void => {
  conns.delete(socketId);
};

/** Is this socket id currently connected (i.e. an active player/DM)? Used to
 *  protect a character claimed by a player who is still in the session. */
export const isConnected = (socketId: string | null | undefined): boolean =>
  !!socketId && conns.has(socketId);

export const roomName = (sessionId: string): string => `session:${sessionId}`;

/**
 * Re-send a freshly role-shaped snapshot to every connected client in a session.
 * Each client is shaped individually (DM vs player, and the DM's selected map),
 * so staging edits reach DMs only and players always see the active map.
 */
export function broadcastSnapshots(io: IOServer, sessionId: string): void {
  // Transient HP-change FX queued by this change-cycle's applyDamage calls.
  // Each viewer only receives floaters for tokens THEIR snapshot contains, so
  // hidden/fog-covered/other-map creatures never pop a number for players.
  const hpFx = drainHpFx(sessionId);
  // One builder per change-cycle: the session-wide queries (creatures, roll
  // log, chat, …) run once and per-viewer shaping is pure CPU — previously
  // every client re-ran every query, with a per-token SELECT on top.
  const build = createSnapshotBuilder(sessionId);
  if (!build) return;
  for (const [socketId, conn] of conns) {
    if (conn.sessionId !== sessionId) continue;
    const snapshot = build(
      conn.role,
      conn.role === 'dm' ? conn.viewMapId : null,
      socketId,
    );
    io.to(socketId).emit('state:snapshot', snapshot);
    const visible = hpFx.filter((e) =>
      snapshot.tokens.some((t) => t.kind === e.kind && t.refId === e.refId),
    );
    if (visible.length) io.to(socketId).emit('fx:hp', { events: visible });
  }
}

/** Send a snapshot to a single socket (used right after join/select). */
export function sendSnapshot(io: IOServer, socketId: string): void {
  const conn = conns.get(socketId);
  if (!conn) return;
  const snapshot = buildSnapshot(
    conn.sessionId,
    conn.role,
    conn.role === 'dm' ? conn.viewMapId : null,
    socketId,
  );
  if (snapshot) io.to(socketId).emit('state:snapshot', snapshot);
}
