import {visionContains,visionInSight} from '../../shared/playerVision.js';
import {deliverState,resetDelivery} from './stateDelivery.js';
import {spellAreaFlashes} from '../../shared/spellImpact.js';
import {fogVisionContains,usesTokenVision} from '../../shared/playerVision.js';
import {randomBytes} from 'node:crypto';
import {isLiveCommand,afterRollCommit} from './liveRollContext.js';
import { tokenVisibleAt } from '../../shared/fog.js';
import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  Role,
  ServerToClientEvents,
} from '../../shared/types.js';
import { buildSnapshot, createSnapshotBuilder } from './visibility.js';
import {renderingState,renderingOverride} from './renderingPolicy.js';
import {resetRenderAssets} from './renderAssets.js';
import { addChatMessage, drainHpFx, getActiveMapId, getMap, getCharacter, getMonster } from './sessions.js';
import type { StateSnapshot, Token } from '../../shared/types.js';

export type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Per-connection state we track for routing snapshots. */
export type Conn = {
  legacyMotion?:boolean;
  compactMotion?:boolean;
  motionEntityRefs?:boolean;
  renderProtocol?:1|2|3;
  serverRendering?:boolean;
  stateProtocol?:1;
  legacyRendering?:boolean;
  sprites2d?:{pc:boolean;monster:boolean};
  sessionId: string;
  role: Role;
  /** DM's currently-selected map for prep (players ignore this). */
  viewMapId: string | null;
  /** Only this DM connection requests the extra combined-player display. */
  partyView?: boolean;
  /** Durable per-browser id from the join handshake (character ownership). */
  playerId: string | null;
};

const conns = new Map<string, Conn>();
export function withRenderingState(snapshot:StateSnapshot,conn:Conn):StateSnapshot{
 const state=renderingState(conn.sessionId,snapshot.map?.id,conn.role==='player'?conn.playerId:null,conn.serverRendering!==false);
 if(conn.role==='dm'){
  const players=new Map<string,NonNullable<import('../../shared/serverRendering.js').ServerRenderingState['players']>[number]>();
  for(const [socketId,p] of conns)if(p.sessionId===conn.sessionId&&p.role==='player'&&p.playerId){
   const names=snapshot.characters.filter(c=>c.claimedBy===socketId).map(c=>c.name);
   const effective=renderingState(conn.sessionId,snapshot.activeMapId,p.playerId,p.serverRendering!==false);
   players.set(p.playerId,{id:p.playerId,name:names.join(', ')||`Player ${p.playerId.slice(0,8)}`,override:renderingOverride(conn.sessionId,'player',p.playerId),enabled:effective.enabled,boardForced:effective.forcedBy==='board'});
  }
  return {...snapshot,serverRendering:{...state,players:[...players.values()]}};
 }
 return {...snapshot,serverRendering:state};
}
// The last role-shaped snapshot sent to each connection: exactly what that
// viewer can currently see. High-rate ephemeral fan-outs (live drag previews)
// gate on it instead of rebuilding every snapshot for every packet. Cleared
// whenever the connection's role/session/view changes.
const lastSent = new Map<string, StateSnapshot>();
export const lastSnapshotFor=(socketId:string)=>lastSent.get(socketId);
// Connection-scoped credentials never enter shared snapshots or image URLs.
const mediaTokens=new Map<string,string>();
export const chatAccessToken=(socketId:string):string|undefined=>mediaTokens.get(socketId);
export function mediaSocketId(token:string):string|undefined {
  if(!/^[a-f0-9]{64}$/.test(token))return undefined;
  for(const [id,key] of mediaTokens)if(key===token)return id;
  return undefined;
}
export function chatMediaConnection(token:string):Conn|undefined {
  if(!/^[a-f0-9]{64}$/.test(token))return undefined;
  for(const [id,key] of mediaTokens)if(key===token)return conns.get(id);
  return undefined;
}

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
  resetRenderAssets(socketId);
  resetDelivery(socketId);
  const previous=conns.get(socketId);
  conns.set(socketId, conn);
  lastSent.delete(socketId);
  if(!mediaTokens.has(socketId)||previous?.sessionId!==conn.sessionId||previous?.role!==conn.role||previous?.playerId!==conn.playerId)
    mediaTokens.set(socketId,randomBytes(32).toString('hex'));
};
export const getConn = (socketId: string): Conn | undefined => conns.get(socketId);
export const hasPlayerConnection=(sessionId:string)=>[...conns.values()].some(c=>c.sessionId===sessionId&&c.role==='player');
export const dropConn = (socketId: string): void => {
  resetRenderAssets(socketId);
  resetDelivery(socketId);
  conns.delete(socketId);
  mediaTokens.delete(socketId);
  lastSent.delete(socketId);
};

/** Is this socket id currently connected (i.e. an active player/DM)? Used to
 *  protect a character claimed by a player who is still in the session. */
export const isConnected = (socketId: string | null | undefined): boolean =>
  !!socketId && conns.has(socketId);

export const roomName = (sessionId: string): string => `session:${sessionId}`;

/** Private area planning belongs to the caster and DMs viewing this map. */
export function broadcastSpellArea(io:IOServer,sessionId:string,id:string,preview:import('../../shared/types.js').SpellAreaPreview|null):void {
  for(const [recipient,conn] of conns){
    if(conn.sessionId!==sessionId||(recipient!==id&&conn.role!=='dm'))continue;
    const mapId=conn.role==='dm'?conn.viewMapId??getActiveMapId(sessionId):getActiveMapId(sessionId);
    io.to(recipient).emit('fx:spellArea',{id,preview:preview&&preview.area.mapId===mapId?preview:null});
  }
}

/** No history replay or ability details; hidden and off-map casters stay private. */
export function broadcastSpellCast(io: IOServer, sessionId: string, kind: Token['kind'], refId: string): void {
  if(isLiveCommand()){afterRollCommit(()=>broadcastSpellCast(io, sessionId, kind, refId));return;}
  const build = createSnapshotBuilder(sessionId);
  if (!build) return;
  for (const [socketId, conn] of conns) {
    if (conn.sessionId !== sessionId) continue;
    const snapshot = build(conn.role, conn.role === 'dm' ? conn.viewMapId : null, socketId, conn.playerId);
    const tokenIds = snapshot.tokens.filter(t => !t.sharedSightOnly && t.kind === kind && t.refId === refId).map(t => t.id);
    if (tokenIds.length) io.to(socketId).emit('fx:spellCast', { tokenIds });
  }
}

/** Points spread over an area's footprint: a circle's centre and two rings, or
 *  a line/cone/cube's axis (start → `end`) and both edges (`radiusFt` is the
 *  half-width at the far end). Enough to tell whether any part is in view. */
export function areaSamplePoints(area:{x:number;y:number;radiusFt:number;end?:{x:number;y:number}},pxPerFoot:number):{x:number;y:number}[] {
  const r=area.radiusFt*pxPerFoot,points=[{x:area.x,y:area.y}];
  if(area.end){
    const dx=area.end.x-area.x,dy=area.end.y-area.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    for(let i=1;i<=10;i++){const t=i/10,cx=area.x+dx*t,cy=area.y+dy*t;
      for(const side of [-1,-.5,0,.5,1])points.push({x:cx+nx*r*side,y:cy+ny*r*side});}
    return points;
  }
  for(const ring of [.5,.95])for(let i=0;i<12;i++){const a=i/12*Math.PI*2;points.push({x:area.x+Math.cos(a)*r*ring,y:area.y+Math.sin(a)*r*ring});}
  return points;
}

/**
 * Re-send a freshly role-shaped snapshot to every connected client in a session.
 * Each client is shaped individually (DM vs player, and the DM's selected map),
 * so staging edits reach DMs only and players always see the active map.
 */
export function broadcastSnapshots(io: IOServer, sessionId: string): void {
  if(isLiveCommand()){afterRollCommit(()=>broadcastSnapshots(io, sessionId));return;}
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
    const rawSnapshot = build(
      conn.role,
      conn.role === 'dm' ? conn.viewMapId : null,
      socketId,
      conn.playerId,
      conn.role === 'dm' && conn.partyView === true,
    );
    const snapshot=withRenderingState(rawSnapshot,conn);
    lastSent.set(socketId, snapshot);
    const visibleRolls = new Set(snapshot.rollLog.filter((roll) => roll.reveal).map((roll) => roll.id));
    const publicRolls = new Set(snapshot.rollLog.filter(roll=>!roll.outcomeOnly).map(roll=>roll.id));
    // Area art goes to a player when ANY part of the area is visible to them
    // (vision and revealed map fog); their client clips it to the visible
    // pixels. A hidden caster's spell still shows where it reaches open view.
    // A flashing spell lights itself, so line of sight is enough in darkness.
    const revealed = snapshot.map?.mapFogEnabled ? new Set(snapshot.map.mapFogRevealed) : null, grid = snapshot.map?.gridSizePx ?? 50;
    const visible = hpFx.filter((e) => {
      if (!e.areaPosition) return snapshot.tokens.some((t) => !t.sharedSightOnly && t.kind === e.kind && t.refId === e.refId);
      if (snapshot.map?.id !== e.areaPosition.mapId) return false;
      if (conn.role === 'dm') return true;
      const sees = spellAreaFlashes(e) ? visionInSight : visionContains;
      return areaSamplePoints(e.areaPosition, grid / snapshot.map.feetPerSquare).some((p) =>
        (!revealed || revealed.has(`${Math.floor(p.x / grid)},${Math.floor(p.y / grid)}`)) && sees(snapshot.playerVision, p.x, p.y));
    }).map((original) => {
      // The destination can be visible while its caster is behind a wall.
      // Do not reveal that hidden origin through projectile coordinates.
      const source=original.sourcePosition;
      const event=source&&conn.role!=='dm'&&(!snapshot.tokens.some(t=>!t.sharedSightOnly&&!t.isHidden&&t.kind===original.kind&&t.refId===original.refId)||!visionContains(snapshot.playerVision,source.x,source.y)||(original.weaponAttack&&!snapshot.tokens.some(t=>!t.sharedSightOnly&&!t.isHidden&&t.mapId===source.mapId&&Math.hypot(t.x-source.x,t.y-source.y)<1)))
        ? (({sourcePosition,...rest})=>rest)(original):original;
      const visibleImpact=!event.impact||publicRolls.has(event.impact.id);
      if ((!event.rollId || visibleRolls.has(event.rollId))&&visibleImpact) return event;
      // Hidden DM rolls still cause visible HP feedback, but never expose a
      // hidden roll ID or make that feedback wait for an unavailable reveal.
      const { rollId: _hiddenRollId, impact: _hiddenImpact, ...uncorrelated } = event;
      return {...uncorrelated,...(event.rollId&&visibleRolls.has(event.rollId)?{rollId:event.rollId}:{}),...(visibleImpact&&event.impact?{impact:event.impact}:{})};
    });
    deliverState(io,socketId,snapshot,{...conn,serverRendering:snapshot.serverRendering?.enabled},()=>{if(visible.length)io.to(socketId).emit('fx:hp',{events:visible});});
  }
}

/**
 * Fan a live token-drag preview out to the OTHER members of the session who can
 * actually see the token at its in-progress `x,y`: DM plans stay DM-only, even
 * for legacy clients that still send drag events. DMs always (on the map they're
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
  const sender = conns.get(fromSocketId);
  if (!sender || sender.sessionId !== sessionId) return;
  const activeMapId = getActiveMapId(sessionId);
  const map = token.mapId ? getMap(token.mapId) : null;
  const grid = map?.gridSizePx ?? 50;
  const mapFog = map?.mapFogEnabled ? new Set(map.mapFogRevealed) : null;
  const tokenFog = map?.tokenFogEnabled ? new Set(map.tokenFogRevealed) : null;
  const owner = token.kind === 'pc' ? getCharacter(token.refId)?.claimedBy : null;
  const foe = token.kind === 'monster' && getMonster(token.refId)?.disposition !== 'friendly';
  // Built only if some viewer has no cached snapshot (drag packets arrive many
  // times a second; the session doesn't change between them).
  let build: ReturnType<typeof createSnapshotBuilder> | undefined;
  for (const [socketId, conn] of conns) {
    if (socketId === fromSocketId || conn.sessionId !== sessionId) continue;
    if (sender.role === 'dm' && conn.role !== 'dm') continue;
    // Players are locked to the active map; a DM may be staging another.
    const viewMapId = conn.role === 'dm' ? conn.viewMapId ?? activeMapId : activeMapId;
    if (token.mapId !== viewMapId) continue;
    const personal=conn.role==='dm'?undefined:lastSent.get(socketId)??(build===undefined?(build=createSnapshotBuilder(sessionId)):build)?.(conn.role,null,socketId,conn.playerId);
    if(personal&&!personal.tokens.some(t=>t.id===token.id))continue;
    const visible = (px: number, py: number) => fogVisionContains(personal?.playerVision,px,py,usesTokenVision(map)) && tokenVisibleAt({ role: conn.role,
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
    conn.role === 'dm' && conn.partyView === true,
  );
  if (snapshot) {
    const prepared=withRenderingState(snapshot,conn);
    deliverState(io,socketId,prepared,{...conn,serverRendering:prepared.serverRendering?.enabled});
    lastSent.set(socketId, snapshot);
  }
}
