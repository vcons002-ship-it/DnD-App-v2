import {it,expect} from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from './config.js';
import {archesFromMask} from './archMask.js';
import {passageWalls} from '../../shared/archGeometry.js';
import {hasLineOfSight,stopAtWalls,wallVisibilityPolygon,type MapWall} from '../../shared/mapWalls.js';
import {createSession,createMap,getMap,listTokens} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {geometrySource} from './mapGeometryDraft.js';
import {applyMapSetupDraft} from './mapSetupDraft.js';

const wall:MapWall={id:'wall',kind:'rectangle',ax:20,ay:100,bx:350,by:130};
const arch:MapWall={id:'arch',kind:'rectangle',ax:100,ay:100,bx:180,by:130,arch:true};
const a={x:140,y:70},b={x:140,y:170};
it('saved arch overlays open sight, light and movement, retain supports, and restore blocking when removed',()=>{
 const walls=[wall,arch];expect(passageWalls(walls)).toBe(passageWalls(walls));
 expect(hasLineOfSight(a,b,walls)).toBe(true);expect(stopAtWalls(a,b,10,walls)).toEqual(b);
 expect(wallVisibilityPolygon(a,walls,300).some(p=>p.y>200&&Math.abs(p.x-140)<1)).toBe(true);
 expect(hasLineOfSight({x:105,y:70},{x:105,y:170},walls)).toBe(false);
 expect(stopAtWalls({x:105,y:70},{x:105,y:170},5,walls).y).toBeLessThan(100);
 expect(hasLineOfSight(a,b,[wall])).toBe(false);expect(walls).toEqual([wall,arch]);
});
it('rotating an arch and wall together preserves the passage and both supports',()=>{
 const solid={...wall,ax:0,bx:280,rotation:35},opening={...arch,rotation:35};
 // Both rectangles share a center; rotate the approach points into that frame.
 const rotate=(x:number,y:number)=>{const angle=35*Math.PI/180;return {x:140+(x-140)*Math.cos(angle)-(y-115)*Math.sin(angle),y:115+(x-140)*Math.sin(angle)+(y-115)*Math.cos(angle)};};
 expect(hasLineOfSight(rotate(140,70),rotate(140,170),[solid,opening])).toBe(true);
 expect(stopAtWalls(rotate(140,70),rotate(140,170),5,[solid,opening])).toEqual(rotate(140,170));
 expect(hasLineOfSight(rotate(105,70),rotate(105,170),[solid,opening])).toBe(false);
});
it('an arch does not bypass a closed door or change window movement blocking',()=>{
 const door:MapWall={id:'door',door:true,ax:112,ay:100,bx:168,by:130,kind:'rectangle'};
 expect(hasLineOfSight(a,b,[wall,arch,door])).toBe(false);
 expect(stopAtWalls(a,b,5,[wall,arch,door])).not.toEqual(b);
 expect(hasLineOfSight(a,b,[wall,arch,{...door,open:true}])).toBe(true);
 const win:MapWall={id:'window',window:true,ax:200,ay:99,bx:230,by:131,kind:'rectangle'};
 expect(hasLineOfSight({x:215,y:70},{x:215,y:170},[wall,arch,win])).toBe(true);
 expect(stopAtWalls({x:215,y:70},{x:215,y:170},5,[wall,arch,win])).not.toEqual({x:215,y:170});
});
it('extracts only newly painted magenta arches and keeps orange candidates separate',async()=>{
 const svg=(color:string,left:number)=>({input:Buffer.from(`<svg width="400" height="300"><rect x="${left}" y="100" width="80" height="30" fill="${color}"/></svg>`)});
 const source=await sharp({create:{width:400,height:300,channels:3,background:'#222'}}).composite([svg('#ff00ff',270)]).png().toBuffer();
 const mask=await sharp(source).composite([svg('#ff00ff',50),svg('#ff8800',160)]).png().toBuffer();
 const result=await archesFromMask(mask,source,400,300,48);
 expect(result.arches).toHaveLength(1);expect(result.arches[0].ax).toBeCloseTo(50,0);expect(result.arches[0].bx).toBeCloseTo(130,0);
 expect(result.uncertain).toHaveLength(1);expect(await archesFromMask(source,source,400,300,48)).toEqual({arches:[],uncertain:[]});
 await expect(archesFromMask(await sharp(mask).resize(300,300).png().toBuffer(),source,400,300,48)).rejects.toThrow('framing');
});
async function fixture(){
 const session=createSession('Arch production integration'),name=`arch-${session.id}.png`;
 await fs.mkdir(config.uploadsDir,{recursive:true});await sharp({create:{width:400,height:300,channels:3,background:'#222'}}).png().toFile(path.join(config.uploadsDir,name));
 const map=createMap(session.id,{name:'Arches',imagePath:'/uploads/'+name});editMapWalls(session.id,map.id,{add:wall});
 const {source}=await geometrySource(map.id);
 const draft={version:1 as const,id:'arch-test',source,maskImagePath:map.imagePath!,arches:[{...arch,id:'ai-arch-1',arch:undefined}],uncertain:[{...arch,id:'uncertain-arch-1',arch:undefined}]};
 return {session,map,draft};
}
it('real Apply saves an editable arch without replacing walls or creating a door object; moving and deletion update the passage',async()=>{
 const {session,map,draft}=await fixture();
 expect(await applyMapSetupDraft(map.id,{arches:draft},{walls:[],doors:[],lights:[],arches:['ai-arch-1']})).toEqual({walls:0,doors:0,lights:0,arches:1});
 const saved=getMap(map.id)!.walls!,opening=saved.find(w=>w.arch)!;
 expect(saved[0]).toEqual(wall);expect(listTokens(map.id)).toEqual([]);expect(hasLineOfSight(a,b,saved)).toBe(true);
 expect(editMapWalls(session.id,map.id,{update:{...opening,arch:false,ax:220,bx:300}})).toBeNull();
 const moved=getMap(map.id)!.walls!;expect(moved.find(w=>w.id===opening.id)!.arch).toBe(true);
 expect(hasLineOfSight(a,b,moved)).toBe(false);expect(hasLineOfSight({x:260,y:70},{x:260,y:170},moved)).toBe(true);
 editMapWalls(session.id,map.id,{removeId:opening.id});expect(getMap(map.id)!.walls).toEqual([wall]);
});
it('uncertain, stale and unfitted arches cannot be applied and leave the map untouched',async()=>{
 const {map,draft}=await fixture(),selected={walls:[],doors:[],lights:[],arches:['uncertain-arch-1']};
 await expect(applyMapSetupDraft(map.id,{arches:draft},selected)).rejects.toThrow('Select arches');
 selected.arches=['ai-arch-1'];draft.arches[0].ay=20;draft.arches[0].by=50;
 await expect(applyMapSetupDraft(map.id,{arches:draft},selected)).rejects.toThrow('No wall crosses');
 draft.source={...draft.source,imageHash:'stale'};
 await expect(applyMapSetupDraft(map.id,{arches:draft},selected)).rejects.toThrow('changed');expect(getMap(map.id)!.walls).toEqual([wall]);
});
