import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  Role,
  ServerToClientEvents,
} from '../../shared/types.js';
import { buildSnapshot } from './visibility.js';

export type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Per-connection state we track for routing snapshots. */
export type Conn = {
  sessionId: string;
  role: Role;
  /** DM's currently-selected map for prep (players ignore this). */
  viewMapId: string | null;
};

const conns = new Map<string, Conn>();

export const setConn = (socketId: string, conn: Conn): void => {
  conns.set(socketId, conn);
};
export const getConn = (socketId: string): Conn | undefined => conns.get(socketId);
export const dropConn = (socketId: string): void => {
  conns.delete(socketId);
};

export const roomName = (sessionId: string): string => `session:${sessionId}`;

/**
 * Re-send a freshly role-shaped snapshot to every connected client in a session.
 * Each client is shaped individually (DM vs player, and the DM's selected map),
 * so staging edits reach DMs only and players always see the active map.
 */
export function broadcastSnapshots(io: IOServer, sessionId: string): void {
  for (const [socketId, conn] of conns) {
    if (conn.sessionId !== sessionId) continue;
    const snapshot = buildSnapshot(
      sessionId,
      conn.role,
      conn.role === 'dm' ? conn.viewMapId : null,
      socketId,
    );
    if (snapshot) io.to(socketId).emit('state:snapshot', snapshot);
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
