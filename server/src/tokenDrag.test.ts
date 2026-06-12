import { describe, it, expect, afterEach } from 'vitest';
import {
  broadcastTokenDrag,
  setConn,
  dropConn,
  type IOServer,
} from './connections.js';
import {
  createSession,
  createMap,
  setActiveMap,
  createToken,
  createCharacter,
  setTokenHidden,
  setFogLayer,
  getToken,
} from './sessions.js';

/** Records every io.to(socketId).emit(event, payload). */
function fakeIo() {
  const sent: Record<string, { event: string; payload: unknown }[]> = {};
  const io = {
    to: (id: string) => ({
      emit: (event: string, payload: unknown) => {
        (sent[id] ??= []).push({ event, payload });
      },
    }),
  } as unknown as IOServer;
  const saw = (id: string) =>
    (sent[id] ?? []).some((e) => e.event === 'fx:tokenDrag');
  return { io, saw, sent };
}

describe('broadcastTokenDrag — visibility-gated live drag preview', () => {
  const ids = ['dm-drag', 'dm-watch', 'pl-watch', 'foreign'];
  afterEach(() => ids.forEach(dropConn));

  const setup = () => {
    const s = createSession('Drag');
    const map = createMap(s.id, { name: 'Field' });
    setActiveMap(s.id, map.id);
    const ch = createCharacter(s.id, { name: 'Mover' });
    const token = createToken({ mapId: map.id, kind: 'pc', refId: ch.id, x: 100, y: 100 });
    // The dragger (DM), a watching DM, a watching player — all in-session; and a
    // DM in a DIFFERENT session who must never receive it.
    setConn('dm-drag', { sessionId: s.id, role: 'dm', viewMapId: null, playerId: null });
    setConn('dm-watch', { sessionId: s.id, role: 'dm', viewMapId: null, playerId: null });
    setConn('pl-watch', { sessionId: s.id, role: 'player', viewMapId: null, playerId: null });
    setConn('foreign', { sessionId: 'other', role: 'dm', viewMapId: null, playerId: null });
    return { s, map, token };
  };

  it('fans a visible token to everyone else in the session (never the sender or another session)', () => {
    const { s, token } = setup();
    const { io, saw } = fakeIo();
    broadcastTokenDrag(io, s.id, 'dm-drag', token, 250, 80);
    expect(saw('dm-watch')).toBe(true);
    expect(saw('pl-watch')).toBe(true);
    expect(saw('dm-drag')).toBe(false); // never echoes to the dragger
    expect(saw('foreign')).toBe(false); // never crosses sessions
  });

  it('carries the live position in the payload', () => {
    const { s, token } = setup();
    const { io, sent } = fakeIo();
    broadcastTokenDrag(io, s.id, 'dm-drag', token, 250, 80);
    expect(sent['pl-watch'][0].payload).toEqual({ tokenId: token.id, x: 250, y: 80 });
  });

  it('hides an individually-hidden token from players but still shows the DM', () => {
    const { s, token } = setup();
    setTokenHidden(token.id, true);
    const hidden = getToken(token.id)!;
    const { io, saw } = fakeIo();
    broadcastTokenDrag(io, s.id, 'dm-drag', hidden, 250, 80);
    expect(saw('dm-watch')).toBe(true); // DMs see everything
    expect(saw('pl-watch')).toBe(false); // a hidden token never leaks to players
  });

  it('hides a drag whose LIVE position is under fog from players (DM still sees it)', () => {
    const { s, map, token } = setup();
    setFogLayer(map.id, 'map', true); // enabled with nothing revealed → all covered
    const { io, saw } = fakeIo();
    broadcastTokenDrag(io, s.id, 'dm-drag', token, 250, 80);
    expect(saw('dm-watch')).toBe(true);
    expect(saw('pl-watch')).toBe(false);
  });

  it('skips viewers not on the token’s map (DM staging a different map)', () => {
    const { s, token } = setup();
    setConn('dm-watch', { sessionId: s.id, role: 'dm', viewMapId: 'some-other-map', playerId: null });
    const { io, saw } = fakeIo();
    broadcastTokenDrag(io, s.id, 'dm-drag', token, 250, 80);
    expect(saw('dm-watch')).toBe(false); // viewing another map → no ghost
    expect(saw('pl-watch')).toBe(true); // player is locked to the active map
  });
});
