import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {createSession,createMap,getMap,getToken,getMonster,listTokens,updateMapEnvironment,setCondition,clearCondition} from './sessions.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
import {generateApiImage} from './ai/imageGateway.js';
import {suggestMapDoors,applyDoorDraft} from './mapDoorDraft.js';
import {fitDoorMarker} from '../../shared/doorMaskFit.js';
import {hasLineOfSight,stopAtWalls} from '../../shared/mapWalls.js';
import {translateWall} from '../../shared/wallGeometry.js';
vi.mock('./ai/imageGateway.js',()=>({generateApiImage:vi.fn()}));
const oldKey=config.geminiApiKey;
afterEach(()=>{config.geminiApiKey=oldKey;vi.resetAllMocks();});
async function fixture(){
  config.geminiApiKey='test';const session=createSession('Door draft'),name=`doors-${session.id}`;
  await fs.mkdir(config.uploadsDir,{recursive:true});
  await sharp({create:{width:400,height:300,channels:3,background:'#222'}}).png().toFile(path.join(config.uploadsDir,name+'.png'));
  await sharp(Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="#222"/><path d="M160 150H240" stroke="#00ffff" stroke-width="6"/></svg>')).png().toFile(path.join(config.uploadsDir,name+'-mask.png'));
  vi.mocked(generateApiImage).mockResolvedValue({path:`/uploads/${name}-mask.png`});
  const map=createMap(session.id,{name:'Doors',imagePath:`/uploads/${name}.png`});
  editMapWalls(session.id,map.id,{add:{id:'left',kind:'rectangle',ax:0,ay:140,bx:160,by:160}});
  editMapWalls(session.id,map.id,{add:{id:'right',kind:'rectangle',ax:240,ay:140,bx:400,by:160}});
  return {session,map};
}
it('uses a separate mask request, saves working linked doors, and leaves map art, walls and lights intact',async()=>{
  const {session,map}=await fixture();
  updateMapEnvironment(session.id,map.id,{lightLevel:.2,lights:[{id:'lamp',x:100,y:75,radiusFt:20,heightFt:8,color:'warm',intensity:1,flicker:true}]});
  const before=getMap(map.id)!,draft=await suggestMapDoors(map.id);
  expect(vi.mocked(generateApiImage).mock.calls[0][0]).toContain('cyan');expect(vi.mocked(generateApiImage).mock.calls[0][0]).not.toContain('yellow');
  expect(vi.mocked(generateApiImage).mock.calls[0][2]).toHaveLength(1);
  expect(draft.doors).toHaveLength(1);expect(draft.doors[0].issue).toBeUndefined();
  expect(getMap(map.id)!.walls).toEqual(before.walls);expect(listTokens(map.id)).toHaveLength(0);
  // Client-provided open state and shape are never trusted when creating a door.
  draft.doors[0].wall={id:'fake',ax:0,ay:0,bx:1,by:1,door:true,open:true,tokenId:'fake'};
  expect(await applyDoorDraft(map.id,draft,[draft.doors[0].id])).toBe(1);
  const saved=getMap(map.id)!,door=saved.walls!.find(w=>w.door)!,token=getToken(door.tokenId!)!,object=getMonster(token.refId)!;
  expect(saved.walls!.slice(0,2)).toEqual(before.walls);expect(saved.imagePath).toBe(before.imagePath);expect(saved.environment).toEqual(before.environment);
  expect(door.open).toBe(false);expect(object.objectKind).toBe('door');expect(object.conditions).toEqual([]);
  const a={x:200,y:80},b={x:200,y:220};
  expect(hasLineOfSight(a,b,saved.walls)).toBe(false);expect(stopAtWalls(a,b,10,saved.walls).y).toBeLessThan(150);
  setCondition('monster',object.id,{id:'lock',label:'Locked',aura:'red',isConcentration:false});
  expect(setWallDoor(session.id,map.id,door.id,true)).toContain('locked');clearCondition('monster',object.id,'lock');
  expect(setWallDoor(session.id,map.id,door.id,true)).toBeNull();
  expect(hasLineOfSight(a,b,getMap(map.id)!.walls)).toBe(true);expect(stopAtWalls(a,b,10,getMap(map.id)!.walls)).toEqual(b);
  expect(setWallDoor(session.id,map.id,door.id,false)).toBeNull();expect(hasLineOfSight(a,b,getMap(map.id)!.walls)).toBe(false);
  await expect(applyDoorDraft(map.id,draft,[draft.doors[0].id])).rejects.toThrow('changed');expect(listTokens(map.id)).toHaveLength(1);
  const next=await suggestMapDoors(map.id);expect(next.doors[0].issue).toContain('already exists');
  const moved=translateWall(door,20,0);expect(editMapWalls(session.id,map.id,{update:moved})).toBeNull();expect(getToken(token.id)!.x).toBeCloseTo(220);
});
it('validates the entire selection before creating any objects and rejects stale drafts',async()=>{
  const {session,map}=await fixture(),draft=await suggestMapDoors(map.id);
  draft.doors.push({...draft.doors[0],id:'ai-door-2',ay:50,by:50});
  await expect(applyDoorDraft(map.id,draft,draft.doors.map(d=>d.id))).rejects.toThrow('jambs');
  expect(listTokens(map.id)).toHaveLength(0);expect(getMap(map.id)!.walls).toHaveLength(2);
  await expect(applyDoorDraft(map.id,{...draft,doors:[null]},['ai-door-1'])).rejects.toThrow('Invalid door draft');
  editMapWalls(session.id,map.id,{add:{id:'elsewhere',ax:20,ay:20,bx:40,by:20}});
  await expect(applyDoorDraft(map.id,draft,['ai-door-1'])).rejects.toThrow('changed');
  vi.mocked(generateApiImage).mockResolvedValue({error:'API unavailable'});
  await expect(suggestMapDoors(map.id)).rejects.toThrow('API unavailable');expect(listTokens(map.id)).toHaveLength(0);
});
it('fits an angled doorway and refuses distant jambs or a solid wall through its center',()=>{
  const marker={id:'ai-door-1',ax:100,ay:100,bx:180,by:180,thickness:8};
  const walls=[{id:'a',ax:60,ay:60,bx:100,by:100,thickness:12},{id:'b',ax:180,ay:180,bx:220,by:220,thickness:12}];
  const {wall,issue}=fitDoorMarker(marker,walls,50);expect(issue).toBeUndefined();expect(wall).toBeTruthy();
  const a={x:110,y:170},b={x:170,y:110};expect(hasLineOfSight(a,b,[...walls,wall!])).toBe(false);
  expect(stopAtWalls(a,b,5,[...walls,{...wall!,open:true}])).toEqual(b);
  expect(fitDoorMarker(marker,[],50).issue).toContain('jambs');
  expect(fitDoorMarker(marker,[{id:'solid',ax:60,ay:60,bx:220,by:220,thickness:12}],50).issue).toContain('covers');
});
it('projects a complete door face onto nearby wall caps, preserving closed/open collision and sight',()=>{
 const walls=[{id:'left',kind:'rectangle' as const,ax:0,ay:100,bx:160,by:120},{id:'right',kind:'rectangle' as const,ax:200,ay:100,bx:400,by:120}];
 const marker={id:'ai-door-1',ax:180,ay:124,bx:180,by:170,thickness:14,footprint:[{x:160,y:124},{x:200,y:124},{x:200,y:170},{x:160,y:170}]};
 const fit=fitDoorMarker(marker,walls,50);expect(fit.issue).toBeUndefined();expect(fit.wall).toBeTruthy();
 const a={x:180,y:70},b={x:180,y:180};expect(hasLineOfSight(a,b,[...walls,fit.wall!])).toBe(false);expect(stopAtWalls(a,b,5,[...walls,fit.wall!])).not.toEqual(b);
 expect(hasLineOfSight(a,b,[...walls,{...fit.wall!,open:true}])).toBe(true);expect(stopAtWalls(a,b,5,[...walls,{...fit.wall!,open:true}])).toEqual(b);
 expect(fitDoorMarker({...marker,footprint:marker.footprint.map(p=>({x:p.x,y:p.y+150}))},walls,50).wall).toBeUndefined();
 expect(fitDoorMarker(marker,[{id:'solid',kind:'rectangle',ax:0,ay:100,bx:400,by:120}],50).wall).toBeUndefined();
});
it('rejects invalid filled footprints before applying any door',async()=>{
 const {map}=await fixture(),draft=await suggestMapDoors(map.id);draft.doors[0].footprint=[{x:-1,y:100},{x:200,y:100},{x:200,y:170}];
 await expect(applyDoorDraft(map.id,draft,[draft.doors[0].id])).rejects.toThrow('footprint');expect(listTokens(map.id)).toHaveLength(0);
});

it('connects under-masked wall ends without widening the door or leaving leaks beside it',async()=>{
 const {session,map}=await fixture();
 editMapWalls(session.id,map.id,{update:{id:'left',kind:'rectangle',ax:0,ay:140,bx:110,by:160}});
 editMapWalls(session.id,map.id,{update:{id:'right',kind:'rectangle',ax:290,ay:140,bx:400,by:160}});
 const {geometrySource}=await import('./mapGeometryDraft.js'),{source}=await geometrySource(map.id),original=getMap(map.id)!.walls!;
 const marker={id:'ai-door-1',ax:200,ay:164,bx:200,by:194,thickness:14,footprint:[{x:160,y:164},{x:240,y:164},{x:240,y:194},{x:160,y:194}]};
 const fit=fitDoorMarker(marker,original,50);expect(fit.extensions).toHaveLength(2);expect(fit.wall!.bx-fit.wall!.ax).toBeLessThan(85);
 const draft={version:1,id:'connection-test',source,maskImagePath:'/uploads/doors.png',doors:[{...marker,extensions:[{id:'injected',ax:0,ay:0,bx:400,by:300}]}]};
 expect(await applyDoorDraft(map.id,draft,[marker.id])).toBe(1);
 const saved=getMap(map.id)!.walls!,door=saved.find(w=>w.door)!;
 expect(saved.slice(0,2)).toEqual(original);expect(saved).toHaveLength(5);expect(saved.some(w=>w.id==='injected')).toBe(false);expect(listTokens(map.id)).toHaveLength(1);
 const start={x:200,y:80},end={x:200,y:220};expect(hasLineOfSight(start,end,saved)).toBe(false);expect(stopAtWalls(start,end,5,saved)).not.toEqual(end);
 setWallDoor(session.id,map.id,door.id,true);const opened=getMap(map.id)!.walls!;
 expect(hasLineOfSight(start,end,opened)).toBe(true);expect(stopAtWalls(start,end,5,opened)).toEqual(end);
 for(const x of [112,135,158,242,265,288]){const a={x,y:80},b={x,y:220};expect(hasLineOfSight(a,b,opened)).toBe(false);expect(stopAtWalls(a,b,2,opened)).not.toEqual(b);}
 expect(fitDoorMarker(marker,[original[0]],50).wall).toBeUndefined();
 expect(fitDoorMarker(marker,original,40).wall).toBeUndefined();
 expect(fitDoorMarker(marker,[...original,{id:'other-opening',ax:135,ay:90,bx:135,by:210,door:true,open:true}],50).wall).toBeUndefined();
});
