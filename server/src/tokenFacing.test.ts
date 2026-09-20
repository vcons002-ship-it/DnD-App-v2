import { describe, expect, it } from 'vitest';
import { facingAfterMove } from '../../shared/tokenFacing.js';
import { createSession, createMap, createCharacter, createToken, getToken, moveToken, duplicateToken } from './sessions.js';

describe('persisted miniature facing', () => {
  it.each([[0, 10, 0], [10, 0, Math.PI / 2], [0, -10, Math.PI], [-10, 0, -Math.PI / 2], [10, 10, Math.PI / 4]])(
    'faces movement (%s, %s) in the map plane', (x, y, angle) => {
      expect(facingAfterMove(0, 0, x, y)).toBeCloseTo(angle);
    },
  );
  it('persists the server-derived heading and preserves it for stationary moves and duplicates', () => {
    const session = createSession('Facing');
    const map = createMap(session.id, { name: 'Field' });
    const character = createCharacter(session.id, { name: 'Druk' });
    const token = createToken({ mapId: map.id, kind: 'pc', refId: character.id, x: 100, y: 100 });
    expect(token.facing).toBe(0);
    expect(moveToken(token.id, 160, 100)?.facing).toBeCloseTo(Math.PI / 2);
    expect(getToken(token.id)?.facing).toBeCloseTo(Math.PI / 2);
    expect(moveToken(token.id, 160, 100)?.facing).toBeCloseTo(Math.PI / 2);
    expect(duplicateToken(token.id)?.facing).toBeCloseTo(Math.PI / 2);
    expect(moveToken(token.id, 160, 40)?.facing).toBeCloseTo(Math.PI);
    expect(moveToken('missing', 0, 0)).toBeNull();
  });
});
