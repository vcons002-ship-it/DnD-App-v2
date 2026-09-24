import { exportSession, importSession } from './backup.js';
import { getSessionByCode } from './sessions.js';
import { describe, it, expect } from 'vitest';
import { db } from './db.js';
import { buildSnapshot } from './visibility.js';
import { createSession, createMap, createMonsterTemplate, instantiateMonster, createToken,
  setActiveMap, setTokenHidden, setFogLayer, setFogRevealed, deleteToken, updateMonster, createCharacter } from './sessions.js';

function setup() {
  const s = createSession('Tracking');
  const map = createMap(s.id, { name: 'Prep' });
  const template = createMonsterTemplate(s.id, { name: 'Goblin', maxHp: 10 });
  const spawn = (x = 25, hidden = false) => {
    const monster = instantiateMonster(template.id)!;
    return createToken({ mapId: map.id, kind: 'monster', refId: monster.id, x, y: 25, isHidden: hidden });
  };
  const dm = () => buildSnapshot(s.id, 'dm', map.id)!;
  const player = () => buildSnapshot(s.id, 'player')!;
  return { s, map, spawn, dm, player };
}
describe('encounter reveal tags', () => {
  it('leaves first-map prep untracked, then matches DM numbers on complete activation', () => {
    const f = setup(); const a = f.spawn(), b = f.spawn();
    expect(f.dm().activeMapId).toBeNull();
    expect(f.dm().tokens.map(t => t.revealTag)).toEqual(['U', 'U']);
    expect(f.player().tokens).toEqual([]);
    setActiveMap(f.s.id, f.map.id);
    expect(f.dm().tokens.map(t => t.revealTag)).toEqual(['G1', 'G2']);
    expect(f.player().tokens.map(t => t.revealTag)).toEqual(['G1', 'G2']);
    expect(f.dm().monsters.filter(m => [a.refId,b.refId].includes(m.id)).map(m => m.name)).toEqual(['Goblin 1','Goblin 2']);
    expect(f.player().monsters.map(m => m.name)).toEqual(['Goblin','Goblin']);
  });
  it('ignores PC placement and late prep fog; follows reveal order and never reuses a deleted tag', () => {
    const f = setup(); const a = f.spawn(25), b = f.spawn(75), c = f.spawn(125, true);
    const pc = createCharacter(f.s.id, { name: 'Hero' });
    createToken({ mapId:f.map.id,kind:'pc',refId:pc.id,x:25,y:25 });
    f.dm();
    setFogLayer(f.map.id, 'tokens', true);
    setFogRevealed(f.map.id, 'tokens', ['1,0']);
    setActiveMap(f.s.id, f.map.id);
    expect(f.player().tokens.find(t=>t.id===b.id)?.revealTag).toBe('G1');
    expect(f.dm().tokens.find(t=>t.id===a.id)?.revealTag).toBe('U');
    setFogRevealed(f.map.id, 'tokens', ['0,0','1,0','2,0']);
    expect(f.player().tokens.find(t=>t.id===a.id)?.revealTag).toBe('G2');
    expect(f.player().tokens.some(t=>t.id===c.id)).toBe(false);
    setTokenHidden(b.id,true); f.dm(); setTokenHidden(b.id,false);
    expect(f.player().tokens.find(t=>t.id===b.id)?.revealTag).toBe('G1');
    deleteToken(a.id); setTokenHidden(c.id,false);
    expect(f.player().tokens.find(t=>t.id===c.id)?.revealTag).toBe('G3');
    expect(db.prepare('SELECT COUNT(*) AS n FROM encounter_tags WHERE map_id=?').get(f.map.id)).toEqual({n:3});
  });
  it('retains tags while inactive and resumes; new visible spawns get the next tag', () => {
    const f=setup(); const a=f.spawn(); setActiveMap(f.s.id,f.map.id); f.dm();
    const other=createMap(f.s.id,{name:'Other'}); setActiveMap(f.s.id,other.id);
    const b=f.spawn(); expect(f.dm().tokens.find(t=>t.id===b.id)?.revealTag).toBe('U');
    expect(f.dm().tokens.find(t=>t.id===a.id)?.revealTag).toBe('G1');
    setActiveMap(f.s.id,f.map.id); expect(f.player().tokens.find(t=>t.id===b.id)?.revealTag).toBe('G2');
    const c=f.spawn(); expect(f.player().tokens.find(t=>t.id===c.id)?.revealTag).toBe('G3');
    updateMonster(c.refId,{name:'Renamed beast 99'});
    expect(f.player().tokens.find(t=>t.id===c.id)?.revealTag).toBe('G3');
  });
  it('matches nonsequential DM suffixes only on an initial complete reveal; avoids prefix collisions', () => {
    const f=setup();const a=f.spawn(),b=f.spawn();
    updateMonster(a.refId,{name:'Goblin 4'});updateMonster(b.refId,{name:'Goblin 9'});
    const guard=instantiateMonster(createMonsterTemplate(f.s.id,{name:'Guard',maxHp:10}).id)!;
    const g=createToken({mapId:f.map.id,kind:'monster',refId:guard.id,x:25,y:25});
    setActiveMap(f.s.id,f.map.id);
    expect(f.dm().tokens.find(t=>t.id===a.id)?.revealTag).toBe('G4');
    expect(f.dm().tokens.find(t=>t.id===b.id)?.revealTag).toBe('G9');
    expect(f.dm().tokens.find(t=>t.id===g.id)?.revealTag).toBe('GU1');
    const c=f.spawn(); expect(f.player().tokens.find(t=>t.id===c.id)?.revealTag).toBe('G10');
  });
  it('uses both fog layers and friendly exemption, and tracks without a player connected',()=>{
    const f=setup();const a=f.spawn(),b=f.spawn(75);updateMonster(b.refId,{disposition:'friendly'});
    setFogLayer(f.map.id,'tokens',true);setActiveMap(f.s.id,f.map.id);
    expect(f.dm().tokens.find(t=>t.id===a.id)?.revealTag).toBe('U');
    expect(f.dm().tokens.find(t=>t.id===b.id)?.revealTag).toBe('G1');
    setFogLayer(f.map.id,'map',true);
    expect(f.player().tokens).toEqual([]);
    expect(f.dm().tokens.find(t=>t.id===b.id)?.revealTag).toBe('G1');
  });
});

it('preserves assigned and retired tags through backup/restore',()=>{
 const f=setup();const a=f.spawn(),b=f.spawn();setActiveMap(f.s.id,f.map.id);f.dm();deleteToken(a.id);
 const restored=importSession(exportSession(f.s.code)!);
 const session=getSessionByCode(restored.code)!;
 const snap=buildSnapshot(session.id,'dm')!;
 expect(snap.tokens.map(t=>t.revealTag)).toEqual(['G2']);
 expect(db.prepare('SELECT number FROM encounter_tags WHERE map_id=? ORDER BY number').all(snap.map!.id)).toEqual([{number:1},{number:2}]);
});
