import { describe, it, expect, vi, afterEach } from 'vitest';
import { creatureSize, defaultMonsterWidthFt, miniatureBaseWidthFt, monsterTint, normalizeVisualTags, normalizeModelType, resolveMonsterModelType } from '../../shared/monsterAppearance.js';
import { createSession, createMap, setActiveMap, createMonsterTemplate, instantiateMonster, copyMonster, createToken, updateMonster, getMonster, setFogLayer, setFogRevealed, moveToken, duplicateToken, resizeToken, resizeMiniature, createCharacter, claimCharacter } from './sessions.js';
import { buildSnapshot } from './visibility.js';
import { saveLibraryCreature, getLibraryCreature } from './library.js';
import { broadcastTokenDrag, setConn, dropConn, type IOServer } from './connections.js';
import { aiFillCreature } from './creatures/fill.js';
import { lookupCreatureAI } from './creatures/gemini.js';
import { generateJson } from './ai/gateway.js';
vi.mock('./ai/gateway.js', () => ({ aiAvailable: () => true, generateJson: vi.fn() }));
afterEach(() => { dropConn('appearance-player'); dropConn('appearance-dm'); vi.clearAllMocks(); });

describe('monster appearance', () => {
  it('separates rule-sized space from compact miniature bases and respects dragon age', () => {
    expect(creatureSize({modelType:'goblin'})).toBe('small');
    expect(creatureSize({modelType:'wolf'})).toBe('medium');
    expect(defaultMonsterWidthFt({name:'Giant Spider',modelType:'spider'})).toBe(10);
    expect(defaultMonsterWidthFt({name:'Large Constricting Snake',modelType:'snake'})).toBe(10);
    expect(defaultMonsterWidthFt({name:'Giant Constrictor Snake',modelType:'snake'})).toBe(15);
    expect(defaultMonsterWidthFt({name:'Spider',modelType:'spider'})).toBe(2.5);
    for (const [name, width] of [['Red Dragon Wyrmling',5],['Young Red Dragon',10],['Adult Red Dragon',15],['Ancient Red Dragon',20]] as const) {
      expect(defaultMonsterWidthFt({name,modelType:'dragon'})).toBe(width);
    }
    expect(defaultMonsterWidthFt({name:'Young dragon',modelType:'dragon',creatureType:'Huge dragon'})).toBe(15);
    expect(miniatureBaseWidthFt({kind:'pc',widthFt:5})).toBe(4);
    for (const modelType of ['goblin','wolf']) expect(miniatureBaseWidthFt({kind:'monster',widthFt:5},{modelType})).toBe(3);
    expect(miniatureBaseWidthFt({kind:'monster',widthFt:10},{modelType:'troll'})).toBe(6.72);
    expect(miniatureBaseWidthFt({kind:'monster',widthFt:15},{modelType:'dragon'})).toBe(10.08);
    expect(miniatureBaseWidthFt({kind:'pc',widthFt:5,miniatureWidthFt:5})).toBe(5);
  });
  it('starts known large families at proportional footprints and preserves manual sizes when duplicating', () => {
    const session = createSession('Family sizes');
    const map = createMap(session.id, { name: 'Sizes' });
    for (const [modelType, widthFt] of [['human-guard', 5], ['goblin', 5], ['troll', 10], ['stone-golem', 10], ['werebear', 10], ['dragon', 15], ['two-headed-dragon', 15], ['treant', 15], ['unknown', 5]] as const) {
      const template = createMonsterTemplate(session.id, { name: 'Custom creature', modelType, maxHp: 10 });
      const token = createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(template.id)!.id, x: 100, y: 100 });
      expect(token.widthFt).toBe(widthFt);
      expect(token.size).toBe(widthFt / 5);
      resizeToken(token.id, 5);
      resizeMiniature(token.id, 3.5);
      expect(duplicateToken(token.id)).toMatchObject({widthFt:5, miniatureWidthFt:3.5});
    }
    const prop = createMonsterTemplate(session.id, { name: 'Dragon statue', modelType: 'dragon', objectKind: 'other', maxHp: 1 });
    expect(createToken({ mapId: map.id, kind: 'monster', refId: instantiateMonster(prop.id)!.id, x: 0, y: 0 }).widthFt).toBe(5);
  });
  it('matches physical families with safe 2D fallbacks and keeps PCs separate', () => {
    expect(resolveMonsterModelType({ name: 'Fire Skeleton 4' })).toBe('skeleton');
    expect(resolveMonsterModelType({ name: 'Ashfang', modelType: 'wolf' })).toBe('wolf');
    expect(resolveMonsterModelType({ name: 'Unknown', creatureType: 'Skeleton' })).toBe('skeleton');
    for (const name of ['Wolf Spider', 'Goblin Statue', 'Elephant', 'Druk']) expect(resolveMonsterModelType({ name })).toBe('');
    expect(resolveMonsterModelType({ name: 'Skeleton', modelType: 'none' })).toBe('none');
    expect(resolveMonsterModelType({ name: 'Goblin', objectKind: 'chest' })).toBe('none');
    expect(resolveMonsterModelType({ modelType: 'elephant', name: 'Wolf' })).toBe('elephant');
  });
  it('normalizes bracket tags and gives explicit color field priority without combat effects', () => {
    expect(normalizeVisualTags('[Fire], BLUE, [undead]')).toEqual(['fire', 'blue', 'undead']);
    expect(monsterTint({ visualTags: ['red', 'blue', 'red'] })).toBe(monsterTint({ visualTags: ['red'] }));
    expect(monsterTint({ name: 'Skeleton [fire]', visualTags: ['blue'] })).toBe('#80b7ff');
    expect(monsterTint({ visualTags: ['blue'], modelColor: 'red' })).toBe('#ff7970');
    expect(monsterTint({ modelColor: 'natural', visualTags: ['fire'] })).toBe('#ffffff');
    expect(monsterTint({ visualTags: ['unknown'] })).toBeUndefined();
    expect(monsterTint({ visualTags: ['constructor'] })).toBeUndefined();
    expect(monsterTint({ visualTags: ['bronze'] })).toBe('#dca875');
    expect(monsterTint({ visualTags: ['gold', 'silver'], modelColor: 'natural' })).toBe('#ffffff');
    expect(normalizeModelType({ bad: true })).toBe('');
    expect(normalizeVisualTags(Array(100).fill('fire'))).toEqual(['fire']);
  });
  it('persists, copies, spawns and library-roundtrips cosmetic fields', () => {
    const s = createSession('Appearance');
    const t = createMonsterTemplate(s.id, { name: 'Ash', maxHp: 20, creatureType: 'undead', modelType: ' Skeleton ', modelColor: 'Blue', visualTags: ['[FIRE]'] });
    for (const m of [getMonster(t.id), copyMonster(t.id), instantiateMonster(t.id)]) expect(m).toMatchObject({ creatureType: 'undead', modelType: 'skeleton', modelColor: 'blue', visualTags: ['fire'] });
    updateMonster(t.id, { visualTags: ['poison'], modelColor: 'natural' });
    expect(getMonster(t.id)).toMatchObject({ maxHp: 20, resistances: [], modelColor: 'natural', visualTags: ['poison'] });
    saveLibraryCreature({ ...getMonster(t.id)!, name: `Library ${t.id}` }, true);
    expect(getLibraryCreature(`Library ${t.id}`)).toMatchObject({ modelType: 'skeleton', modelColor: 'natural', visualTags: ['poison'] });
  });
  it('AI supplies family and color, includes DM context, and fill preserves existing choices', async () => {
    vi.mocked(generateJson).mockResolvedValue(JSON.stringify({ name: 'Azure Bones', creatureType: 'undead', modelType: 'skeleton', modelColor: 'blue', visualTags: ['ice'], maxHp: 12 }));
    const lookup = await lookupCreatureAI('Blue skeleton', { visualTags: ['ice'] });
    expect(lookup).toMatchObject({ modelType: 'skeleton', modelColor: 'blue', visualTags: ['ice'] });
    expect(vi.mocked(generateJson).mock.calls[0][0]).toContain('"modelColor":string');
    expect(vi.mocked(generateJson).mock.calls[0][0]).toContain('Existing DM appearance choices');
    expect(vi.mocked(generateJson).mock.calls[0][0]).toContain('royal-archmage');
    expect(vi.mocked(generateJson).mock.calls[0][0]).toContain('two-headed-dragon');
    const s = createSession('Fill appearance'), m = createMonsterTemplate(s.id, { name: 'Blue skeleton', maxHp: 1 });
    expect((await aiFillCreature(m.id)).ok).toBe(true);
    expect(getMonster(m.id)).toMatchObject({ modelType: 'skeleton', modelColor: 'blue' });
    updateMonster(m.id, { modelType: 'wolf', modelColor: 'natural', visualTags: ['poison'] });
    await aiFillCreature(m.id);
    expect(getMonster(m.id)).toMatchObject({ modelType: 'wolf', modelColor: 'natural', visualTags: ['poison'] });
  });
  it('hides the whole token at its base cell and redacts combat stats from public appearance', () => {
    const s = createSession('Fog models'), map = createMap(s.id, { name: 'Fog' });setActiveMap(s.id,map.id);
    const m = instantiateMonster(createMonsterTemplate(s.id,{name:'Bones',maxHp:20,modelType:'skeleton',modelColor:'blue'}).id)!;
    const t = createToken({ mapId: map.id, kind:'monster', refId:m.id,x:25,y:25 });
    setFogLayer(map.id,'map',true);setFogRevealed(map.id,'map',['0,0']);
    const visible=buildSnapshot(s.id,'player',null,'appearance-player')!;
    expect(visible.monsters[0]).toMatchObject({modelType:'skeleton',modelColor:'blue'});
    expect(visible.monsters[0]).not.toHaveProperty('maxHp');
    moveToken(t.id,75,25);
    expect(buildSnapshot(s.id,'player')!.tokens).toHaveLength(0);
    expect(buildSnapshot(s.id,'player')!.monsters).toHaveLength(0);
    expect(buildSnapshot(s.id,'dm',map.id)!.tokens).toHaveLength(1);
    expect(duplicateToken(t.id)?.facing).toBeCloseTo(Math.PI/2);
  });
  it('conceals a live preview without leaking its fogged coordinates and respects ally exemptions', () => {
    const s=createSession('Drag conceal'),map=createMap(s.id,{name:'Fog'});setActiveMap(s.id,map.id);
    const pc=createCharacter(s.id,{name:'Druk'}),t=createToken({mapId:map.id,kind:'pc',refId:pc.id,x:25,y:25});
    setConn('appearance-player',{sessionId:s.id,role:'player',viewMapId:null,playerId:null});
    const sent: unknown[]=[];const io={to:()=>({emit:(_e:string,p:unknown)=>sent.push(p)})} as unknown as IOServer;
    setFogLayer(map.id,'map',true);setFogRevealed(map.id,'map',['0,0']);
    broadcastTokenDrag(io,s.id,'appearance-dm',t,777,888);
    expect(sent).toEqual([{tokenId:t.id,x:25,y:25,hidden:true}]);
    sent.length=0;claimCharacter(pc.id,'appearance-player');
    broadcastTokenDrag(io,s.id,'appearance-dm',t,777,888);
    expect(sent).toEqual([{tokenId:t.id,x:777,y:888}]);
    setFogLayer(map.id,'map',false);setFogLayer(map.id,'tokens',true);sent.length=0;
    broadcastTokenDrag(io,s.id,'appearance-dm',t,777,888);
    expect(sent).toHaveLength(1);
  });
});
