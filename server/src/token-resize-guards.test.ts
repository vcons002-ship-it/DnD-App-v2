import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSocketHandlers } from './socketHandlers.js';
import { dropConn, setConn, type IOServer } from './connections.js';
import { claimCharacter, createCharacter, createMap, createSession, createToken,
  createSummon, getToken, setActiveMap, setTokenHidden } from './sessions.js';

const connections: string[] = [];
afterEach(() => { connections.splice(0).forEach(dropConn); vi.restoreAllMocks(); });

function client(sessionId: string, mapId: string, role: 'player' | 'dm' | null) {
  let connect!: (socket: unknown) => void;
  const io = { on: (_: string, cb: typeof connect) => { connect = cb; }, to: () => ({ emit: vi.fn() }) };
  registerSocketHandlers(io as unknown as IOServer);
  const handlers = new Map<string, (payload: unknown) => void>();
  const id = `resize-test-${Math.random()}`;
  connections.push(id);
  connect({ id, on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler), emit: vi.fn() });
  if (role) setConn(id, { sessionId, role, viewMapId: mapId, playerId: null });
  return { id, resize: (tokenId: string, widthFt: unknown) => handlers.get('token:resize')!({ tokenId, widthFt }) };
}
function fixture() {
  const session = createSession('Figure sizing');
  const map = createMap(session.id, { name: 'Active map' });
  setActiveMap(session.id, map.id);
  const character = createCharacter(session.id, { name: 'Druk' });
  const token = createToken({ mapId: map.id, kind: 'pc', refId: character.id, x: 200, y: 150 });
  return { session, map, character, token };
}

describe('character figure resizing permissions', () => {
  it('allows the owner and DM to save widths and fit to five feet without changing position', () => {
    const f = fixture(), player = client(f.session.id, f.map.id, 'player'), dm = client(f.session.id, f.map.id, 'dm');
    claimCharacter(f.character.id, player.id);
    player.resize(f.token.id, 7.5);
    expect(getToken(f.token.id)).toMatchObject({ widthFt: 7.5, size: 1.5, x: 200, y: 150 });
    dm.resize(f.token.id, 8);
    expect(getToken(f.token.id)?.widthFt).toBe(8);
    player.resize(f.token.id, 5);
    expect(getToken(f.token.id)).toEqual(f.token);
  });
  it('rejects unjoined, unclaimed, other-character, monster, hidden, staged and cross-session edits', () => {
    const f = fixture(), other = fixture();
    const player = client(f.session.id, f.map.id, 'player');
    const unclaimed = client(f.session.id, f.map.id, 'player');
    const outsider = client(other.session.id, other.map.id, 'dm');
    const stranger = client(f.session.id, f.map.id, null);
    claimCharacter(f.character.id, player.id);
    for (const sender of [unclaimed, outsider, stranger]) sender.resize(f.token.id, 20);
    expect(getToken(f.token.id)?.widthFt).toBe(5);
    const staged = createMap(f.session.id, { name: 'Staged map' });
    const stagedToken = createToken({ mapId: staged.id, kind: 'pc', refId: f.character.id, x: 0, y: 0 });
    const different = createCharacter(f.session.id, { name: 'Varis' });
    const differentToken = createToken({ mapId: f.map.id, kind: 'pc', refId: different.id, x: 0, y: 0 });
    const summon = createSummon(f.session.id, f.map.id, 0, 0, 'Companion', '🐺');
    setTokenHidden(f.token.id, true);
    for (const token of [f.token, stagedToken, differentToken, summon, other.token]) {
      player.resize(token.id, 20);
      expect(getToken(token.id)?.widthFt).toBe(token.widthFt);
    }
    // DM can still size a hidden/staged token within this campaign.
    const dm = client(f.session.id, f.map.id, 'dm');
    dm.resize(stagedToken.id, 10);
    expect(getToken(stagedToken.id)?.widthFt).toBe(10);
    dm.resize(other.token.id, 20);
    expect(getToken(other.token.id)?.widthFt).toBe(5);
  });
  it('retains finite limits and rejects malformed widths without mutating the token', () => {
    const f = fixture(), player = client(f.session.id, f.map.id, 'player');
    claimCharacter(f.character.id, player.id);
    for (const width of [null, '10', NaN, Infinity, -Infinity, {}, []]) player.resize(f.token.id, width);
    expect(getToken(f.token.id)).toEqual(f.token);
    player.resize(f.token.id, -50); expect(getToken(f.token.id)?.widthFt).toBe(0.5);
    player.resize(f.token.id, 1000); expect(getToken(f.token.id)?.widthFt).toBe(120);
    player.resize(f.token.id, 7.3); expect(getToken(f.token.id)?.widthFt).toBe(7.5);
  });
});
