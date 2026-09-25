import { tokenVisibleAt } from '../../shared/fog.js';
import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  Role,
  ServerToClientEvents,
} from '../../shared/types.js';
import { buildSnapshot, createSnapshotBuilder } from './visibility.js';
import { addChatMessage, drainHpFx, getActiveMapId, getMap, getCharacter, getMonster } from './sessions.js';
import type { Token } from '../../shared/types.js';

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

/** Backend health is app-wide; operational notices go only to authenticated DMs. */
export function broadcastAiStatus(io: IOServer, message: string): void {
  const sessions = new Set<string>();
  for (const [id, conn] of conns) if(conn.role === 'dm') {
    io.to(id).emit('notice',{message});
    sessions.add(conn.sessionId);
  }
  for (const sessionId of sessions) {
    addChatMessage(sessionId, 'AI status', 'dm', message, true);
    broadcastSnapshots(io, sessionId);
  }
}

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

/** No history replay or ability details; hidden and off-map casters stay private. */
export function broadcastSpellCast(io: IOServer, sessionId: string, kind: Token['kind'], refId: string): void {
  const build = createSnapshotBuilder(sessionId);
  if (!build) return;
  for (const [socketId, conn] of conns) {
    if (conn.sessionId !== sessionId) continue;
    const snapshot = build(conn.role, conn.role === 'dm' ? conn.viewMapId : null, socketId, conn.playerId);
    const tokenIds = snapshot.tokens.filter(t => t.kind === kind && t.refId === refId).map(t => t.id);
    if (tokenIds.length) io.to(socketId).emit('fx:spellCast', { tokenIds });
  }
}

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
      conn.playerId,
    );
    io.to(socketId).emit('state:snapshot', snapshot);
    const visibleRolls = new Set(snapshot.rollLog.filter((roll) => roll.reveal).map((roll) => roll.id));
    const visible = hpFx.filter((e) =>
      snapshot.tokens.some((t) => t.kind === e.kind && t.refId === e.refId),
    ).map((event) => {
      if (!event.rollId || visibleRolls.has(event.rollId)) return event;
      // Hidden DM rolls still cause visible HP feedback, but never expose a
      // hidden roll ID or make that feedback wait for an unavailable reveal.
      const { rollId: _hiddenRollId, ...uncorrelated } = event;
      return uncorrelated;
    });
    if (visible.length) io.to(socketId).emit('fx:hp', { events: visible });
  }
}

/**
 * Fan a live token-drag preview out to the OTHER members of the session who can
 * actually see the token at its in-progress `x,y`: DMs always (on the map they're
 * viewing); players only when the token isn't individually hidden and the live
 * cell isn't under fog — the same gate the snapshot applies, so a drag can never
 * reveal more than a committed move would. Ephemeral: no DB write, no snapshot.
 */
export function broadcastTokenDrag(
  io: IOServer,
  sessionId: string,
  fromSocketId: string,
  token: Token,
  x: number,
  y: number,
): void {
  const activeMapId = getActiveMapId(sessionId);
  const map = token.mapId ? getMap(token.mapId) : null;
  const grid = map?.gridSizePx ?? 50;
  const mapFog = map?.mapFogEnabled ? new Set(map.mapFogRevealed) : null;
  const tokenFog = map?.tokenFogEnabled ? new Set(map.tokenFogRevealed) : null;
  const owner = token.kind === 'pc' ? getCharacter(token.refId)?.claimedBy : null;
  const foe = token.kind === 'monster' && getMonster(token.refId)?.disposition !== 'friendly';
  for (const [socketId, conn] of conns) {
    if (socketId === fromSocketId || conn.sessionId !== sessionId) continue;
    // Players are locked to the active map; a DM may be staging another.
    const viewMapId = conn.role === 'dm' ? conn.viewMapId ?? activeMapId : activeMapId;
    if (token.mapId !== viewMapId) continue;
    const visible = (px: number, py: number) => tokenVisibleAt({ role: conn.role,
      hidden: token.isHidden, owned: owner === socketId, foe, mapFog, tokenFog, grid, x: px, y: py });
    // Never reveal an unknown token merely because its preview crosses open ground.
    if (!visible(token.x, token.y)) continue;
    if (!visible(x, y)) {
      // Only its already-known anchor is sent; concealed coordinates remain private.
      io.to(socketId).emit('fx:tokenDrag', { tokenId: token.id, x: token.x, y: token.y, hidden: true });
    } else io.to(socketId).emit('fx:tokenDrag', { tokenId: token.id, x, y });
  }
}

/** A player started/stopped typing in chat → pop a typing bubble over their PC
 *  token for the OTHERS in the session (you don't need to see your own). */
export function broadcastTyping(
  io: IOServer,
  sessionId: string,
  fromSocketId: string,
  refId: string,
  typing: boolean,
): void {
  for (const [socketId, conn] of conns) {
    if (conn.sessionId !== sessionId || socketId === fromSocketId) continue;
    io.to(socketId).emit('fx:typing', { refId, typing });
  }
}

/** Fan a live cursor position out to the OTHERS in the session who are viewing
 *  the SAME map (so a DM's pointer on a staging map never shows to players, and
 *  vice-versa). Ephemeral: no DB, no snapshot. */
export function broadcastCursor(
  io: IOServer,
  sessionId: string,
  fromSocketId: string,
  name: string,
  x: number,
  y: number,
  mapId: string,
): void {
  const activeMapId = getActiveMapId(sessionId);
  // NB: we deliberately do NOT auto-hide the cursor over fog — any fog-dependent
  // visibility would leak the fog boundary as the pointer winks in/out. The DM
  // instead toggles "share my pointer" off to point at secret things privately.
  for (const [socketId, conn] of conns) {
    if (conn.sessionId !== sessionId || socketId === fromSocketId) continue;
    const viewMapId = conn.role === 'dm' ? conn.viewMapId ?? activeMapId : activeMapId;
    if (viewMapId !== mapId) continue;
    io.to(socketId).emit('fx:cursor', { id: fromSocketId, name, x, y, mapId });
  }
}

/** Remove a socket's cursor for everyone (on mouse-leave or disconnect). */
export function broadcastCursorHide(io: IOServer, sessionId: string, socketId: string): void {
  for (const [otherId, conn] of conns) {
    if (conn.sessionId !== sessionId || otherId === socketId) continue;
    io.to(otherId).emit('fx:cursorHide', { id: socketId });
  }
}

/** A player sent a chat message → pop their words over their PC token for
 *  EVERYONE in the session (the speaker sees their own bubble too). */
export function broadcastSay(
  io: IOServer,
  sessionId: string,
  refId: string,
  text: string,
): void {
  for (const [socketId, conn] of conns) {
    if (conn.sessionId !== sessionId) continue;
    io.to(socketId).emit('fx:say', { refId, text });
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
    conn.playerId,
  );
  if (snapshot) io.to(socketId).emit('state:snapshot', snapshot);
}
