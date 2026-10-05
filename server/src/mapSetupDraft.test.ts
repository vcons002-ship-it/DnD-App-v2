import {it,expect} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {createSession,createMap,getMap,listTokens,getMonster,updateMapEnvironment} from './sessions.js';
import {geometrySource} from './mapGeometryDraft.js';
import {lightDraftSource} from './mapLightDraft.js';
import {applyMapSetupDraft} from './mapSetupDraft.js';
import {editMapWalls,setWallDoor} from './mapWalls.js';
import {parseGeometrySuggestions} from '../../shared/mapGeometryDraft.js';
import {hasLineOfSight,stopAtWalls} from '../../shared/mapWalls.js';
import type {MapSetupDrafts,MapSetupSelection} from '../../shared/mapSetupDraft.js';
import {db} from './db.js';
import {wallEdgeCount} from '../../shared/mapWalls.js';
import {benchmarkLayout} from '../../tools/wall-benchmark.js';

async function fixture(){
  const session=createSession('Combined map setup'),name=`setup-${session.id}.png`;
  await fs.mkdir(config.uploadsDir,{recursive:true});
  await sharp({create:{width:400,height:300,channels:3,background:'#222'}}).png().toFile(path.join(config.uploadsDir,name));
  const map=createMap(session.id,{name:'Setup',imagePath:`/uploads/${name}`});
  updateMapEnvironment(session.id,map.id,{mist:false,lightLevel:.15});
  const {source}=await geometrySource(map.id);
  const drafts:MapSetupDrafts={
    walls:{version:1,id:'walls-test',source,items:parseGeometrySuggestions({items:[
      {kind:'wall',label:'Left jamb',ax:0,ay:140/300,bx:.4,by:160/300,heightFt:10,confidence:1},
      {kind:'wall',label:'Right jamb',ax:.6,ay:140/300,bx:1,by:160/300,heightFt:10,confidence:1},
    ]})},
    doors:{version:1,id:'doors-test',source,maskImagePath:'/uploads/doors.png',doors:[{id:'ai-door-1',ax:160,ay:150,bx:240,by:150,thickness:6,issue:'No saved walls yet'}]},
    lights:{version:1,id:'lights-test',source:lightDraftSource(source,[]),maskImagePath:'/uploads/lights.png',lights:[{id:'ai-light-1',x:100,y:220,radiusFt:60,heightFt:8,color:'cool',intensity:1,flicker:false,visibleTorch:true}]},
  };
  const selected:MapSetupSelection={walls:['item-0','item-1'],doors:['ai-door-1'],lights:['ai-light-1']};
  return {session,map,drafts,selected};
}
it('fits doors to the selected new walls and saves all three workflows together',async()=>{
  const f=await fixture();expect(getMap(f.map.id)!.walls).toEqual([]);
  expect(await applyMapSetupDraft(f.map.id,f.drafts,f.selected)).toEqual({walls:2,doors:1,lights:1});
  const map=getMap(f.map.id)!,door=map.walls!.find(w=>w.door)!,tokens=listTokens(map.id);
  expect(map.walls).toHaveLength(3);expect(tokens).toHaveLength(1);expect(door.tokenId).toBe(tokens[0].id);expect(getMonster(tokens[0].refId)!.objectKind).toBe('door');
  expect(map.imagePath).toBe(f.map.imagePath);expect(map.environment).toMatchObject({mist:false,lightLevel:.15});
  expect(map.environment!.lights).toHaveLength(1);expect(map.environment!.lights[0]).toMatchObject({radiusFt:20,color:'warm',flicker:true});expect(map.environment!.lights[0].visibleTorch).not.toBe(true);
  const a={x:200,y:80},b={x:200,y:220};expect(hasLineOfSight(a,b,map.walls)).toBe(false);expect(stopAtWalls(a,b,10,map.walls).y).toBeLessThan(150);
  expect(setWallDoor(f.session.id,map.id,door.id,true)).toBeNull();expect(hasLineOfSight(a,b,getMap(map.id)!.walls)).toBe(true);expect(stopAtWalls(a,b,10,getMap(map.id)!.walls)).toEqual(b);
  await expect(applyMapSetupDraft(f.map.id,f.drafts,f.selected)).rejects.toThrow('changed');expect(listTokens(map.id)).toHaveLength(1);
});

it('combined Apply saves reviewed door connections and creates only one door object',async()=>{
 const f=await fixture();f.drafts.walls!.items[0].bx=110/400;f.drafts.walls!.items[1].ax=290/400;
 f.drafts.doors!.doors=[{id:'ai-door-1',ax:200,ay:164,bx:200,by:194,thickness:14,footprint:[{x:160,y:164},{x:240,y:164},{x:240,y:194},{x:160,y:194}]}];
 expect(await applyMapSetupDraft(f.map.id,f.drafts,f.selected)).toEqual({walls:4,doors:1,lights:1});
 const saved=getMap(f.map.id)!.walls!,door=saved.find(w=>w.door)!;expect(saved).toHaveLength(5);expect(listTokens(f.map.id)).toHaveLength(1);
 const a={x:200,y:80},b={x:200,y:220};expect(hasLineOfSight(a,b,saved)).toBe(false);setWallDoor(f.session.id,f.map.id,door.id,true);
 expect(hasLineOfSight(a,b,getMap(f.map.id)!.walls)).toBe(true);expect(stopAtWalls(a,b,5,getMap(f.map.id)!.walls)).toEqual(b);
});
it('applies windows to new walls without cutting saved movement geometry, and removing a window restores the view barrier',async()=>{
 const f=await fixture(),source=f.drafts.walls!.source;
 f.drafts.windows={version:1,id:'windows-test',source,maskImagePath:'/uploads/windows.png',windows:[{id:'ai-window-1',kind:'rectangle',ax:80,ay:150,bx:110,by:180}]};
 f.selected.windows=['ai-window-1'];
 expect(await applyMapSetupDraft(f.map.id,f.drafts,f.selected)).toEqual({walls:2,doors:1,windows:1,lights:1});
 const saved=getMap(f.map.id)!.walls!,win=saved.find(w=>w.window)!;
 const a={x:95,y:80},b={x:95,y:220};
 expect(hasLineOfSight(a,b,saved)).toBe(true);expect(stopAtWalls(a,b,10,saved).y).toBeLessThan(140);
 expect(editMapWalls(f.session.id,f.map.id,{removeId:win.id})).toBeNull();
 expect(hasLineOfSight(a,b,getMap(f.map.id)!.walls)).toBe(false);expect(listTokens(f.map.id)).toHaveLength(1);
});
it('invalid windows reject the entire combined setup before any map writes',async()=>{
 const f=await fixture();
 f.drafts.windows={version:1,id:'windows-test',source:f.drafts.walls!.source,maskImagePath:'/uploads/windows.png',windows:[{id:'ai-window-1',kind:'rectangle',ax:50,ay:20,bx:70,by:40}]};f.selected.windows=['ai-window-1'];
 await expect(applyMapSetupDraft(f.map.id,f.drafts,f.selected)).rejects.toThrow('No nearby wall');
 expect(getMap(f.map.id)!.walls).toEqual([]);expect(listTokens(f.map.id)).toEqual([]);
});
it('applies walls, linked doors and lights above the former edge cap without dropping existing geometry',async()=>{
 const f=await fixture(),existing=benchmarkLayout(4096,'rooms').map(w=>({...w,ay:w.ay+10000,by:w.by+10000}));
 db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify(existing),f.map.id);
 const {source}=await geometrySource(f.map.id);
 f.drafts.walls!.source=source;f.drafts.doors!.source=source;f.drafts.lights!.source=lightDraftSource(source,[]);
 expect(await applyMapSetupDraft(f.map.id,f.drafts,f.selected)).toEqual({walls:2,doors:1,lights:1});
 const saved=getMap(f.map.id)!.walls!;
 expect(saved.slice(0,existing.length)).toEqual(existing);
 expect(wallEdgeCount(saved)).toBeGreaterThan(4096);
 expect(listTokens(f.map.id)).toHaveLength(1);
});
it('rejects an unsupported selected door before saving any walls or lights',async()=>{
  const f=await fixture();f.selected.walls=['item-0'];
  await expect(applyMapSetupDraft(f.map.id,f.drafts,f.selected)).rejects.toThrow('jambs');
  expect(getMap(f.map.id)!.walls).toEqual([]);expect(getMap(f.map.id)!.environment!.lights).toEqual([]);expect(listTokens(f.map.id)).toEqual([]);
});
it('does not leave walls or linked door objects behind when light validation fails',async()=>{
  const f=await fixture();f.drafts.lights!.lights[0].x=-1;
  await expect(applyMapSetupDraft(f.map.id,f.drafts,f.selected)).rejects.toThrow('Invalid light');
  expect(getMap(f.map.id)!.walls).toEqual([]);expect(getMap(f.map.id)!.environment!.lights).toEqual([]);expect(listTokens(f.map.id)).toEqual([]);
});
it('can apply successful workflows without a failed analysis, retaining unrelated settings',async()=>{
  const f=await fixture();delete f.drafts.doors;f.selected.doors=[];
  expect(await applyMapSetupDraft(f.map.id,f.drafts,f.selected)).toEqual({walls:2,doors:0,lights:1});
  expect(listTokens(f.map.id)).toEqual([]);expect(getMap(f.map.id)!.environment!.mist).toBe(false);
});
it('rejects drafts from changed walls or lights, and validates selections',async()=>{
  const f=await fixture();editMapWalls(f.session.id,f.map.id,{add:{id:'new-wall',ax:10,ay:10,bx:50,by:10}});
  await expect(applyMapSetupDraft(f.map.id,f.drafts,f.selected)).rejects.toThrow('changed');expect(listTokens(f.map.id)).toEqual([]);
  const g=await fixture();updateMapEnvironment(g.session.id,g.map.id,{lights:[{id:'manual',x:50,y:50,radiusFt:10,heightFt:5,color:'cool',intensity:1,flicker:false}]});
  await expect(applyMapSetupDraft(g.map.id,g.drafts,g.selected)).rejects.toThrow('changed');expect(getMap(g.map.id)!.walls).toEqual([]);
  await expect(applyMapSetupDraft(g.map.id,g.drafts,{walls:[],doors:[],lights:[]})).rejects.toThrow('Select at least');
  await expect(applyMapSetupDraft(g.map.id,g.drafts,{walls:['item-0','item-0'],doors:[],lights:[]})).rejects.toThrow('Invalid');
});
