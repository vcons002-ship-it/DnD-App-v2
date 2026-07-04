import { describe, it, expect } from 'vitest';
import {
  captureTokenDelete,
  captureCreatureDelete,
  captureFogCover,
  popUndo,
  peekUndo,
} from './undo.js';
import {
  createSession,
  createMap,
  createCharacter,
  createMonsterTemplate,
  instantiateMonster,
  createToken,
  deleteToken,
  deleteMonster,
  listTokens,
  listMonsters,
  setFogLayer,
  paintFog,
  coverFog,
  setFogRevealed,
  getMap,
} from './sessions.js';

describe('undo stack', () => {
  it('restores a deleted token with its original id', () => {
    const s = createSession('Undo T');
    const map = createMap(s.id, { name: 'M' });
    const c = createCharacter(s.id, { name: 'Hero', maxHp: 10 });
    const tok = createToken({ mapId: map.id, kind: 'pc', refId: c.id, x: 5, y: 5 });

    captureTokenDelete(s.id, tok.id);
    deleteToken(tok.id);
    expect(listTokens(map.id)).toHaveLength(0);
    expect(peekUndo(s.id)).toBe('Delete token');

    popUndo(s.id)!.run();
    const back = listTokens(map.id);
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe(tok.id);
    expect(peekUndo(s.id)).toBeNull();
  });

  it('restores a deleted creature together with its placed tokens', () => {
    const s = createSession('Undo C');
    const map = createMap(s.id, { name: 'M' });
    const tmpl = createMonsterTemplate(s.id, { name: 'Orc', maxHp: 12 });
    const orc = instantiateMonster(tmpl.id)!;
    const tok = createToken({ mapId: map.id, kind: 'monster', refId: orc.id, x: 1, y: 1 });

    captureCreatureDelete(s.id, 'monster', orc.id);
    deleteMonster(orc.id);
    expect(listMonsters(s.id).some((m) => m.id === orc.id)).toBe(false);
    expect(listTokens(map.id).some((t) => t.id === tok.id)).toBe(false);

    popUndo(s.id)!.run();
    expect(listMonsters(s.id).some((m) => m.id === orc.id)).toBe(true);
    expect(listTokens(map.id).some((t) => t.id === tok.id)).toBe(true);
  });

  it('restores fog cells wiped by a cover-all', () => {
    const s = createSession('Undo F');
    const map = createMap(s.id, { name: 'M', imagePath: '/u/x.png' });
    setFogLayer(map.id, 'map', true);
    paintFog(map.id, 'map', ['1,1', '2,2'], true);
    const before = getMap(map.id)!.mapFogRevealed;
    expect(before.length).toBe(2);

    captureFogCover(s.id, () => setFogRevealed(map.id, 'map', before));
    coverFog(map.id, 'map');
    expect(getMap(map.id)!.mapFogRevealed).toHaveLength(0);

    popUndo(s.id)!.run();
    expect(getMap(map.id)!.mapFogRevealed.sort()).toEqual(['1,1', '2,2']);
  });

  it('is empty by default', () => {
    const s = createSession('Undo E');
    expect(peekUndo(s.id)).toBeNull();
    expect(popUndo(s.id)).toBeUndefined();
  });
});
