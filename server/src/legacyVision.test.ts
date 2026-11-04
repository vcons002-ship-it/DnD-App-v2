import {it,expect} from 'vitest';
import {createLegacyVisionGeometry} from '../../client/src/canvas/legacyVision.js';
import {boundedPaths} from '../../shared/legacyMaskSvg.js';
import {pointInRing} from '../../shared/wallGeometry.js';
import {createSceneVision,fogVisionContains,type PlayerVision} from '../../shared/playerVision.js';
import type {MapState,Token} from '../../shared/types.js';

const ring=(path:string)=>[...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m=>({x:Number(m[1]),y:Number(m[2])}));
const contains=(paths:string[],x:number,y:number)=>paths.some(p=>pointInRing({x,y},ring(p)));
it.each([true,false])('basic masks keep wall and heavy-darkness boundaries (wall fog %s)',wallFog=>{
 const geometry=createLegacyVisionGeometry();
 const vision:PlayerVision={origins:[{id:'pc',x:100,y:100}],rangeFt:60,radius:60,heavy:true,daylight:false,
   walls:[{id:'wall',kind:'rectangle',ax:200,ay:-500,bx:215,by:500}],lights:[{id:'torch',x:300,y:100,radius:40,height:10,strength:1}]};
 const paths=geometry(vision,wallFog);
 const visible=(x:number,y:number)=>contains(paths.near,x,y)||(contains(paths.lights,x,y)&&(!wallFog||contains(paths.sight,x,y)));
 for(const [x,y] of [[110,110],[180,180],[300,100],[400,100],[100,400]])expect(visible(x,y)).toBe(fogVisionContains(vision,x,y,wallFog));
});
it('reuses static source outlines, invalidates changed walls, and excludes decorative flashes',()=>{
 const geometry=createLegacyVisionGeometry();
 const vision:PlayerVision={origins:[{id:'pc',x:10,y:10}],rangeFt:60,radius:60,heavy:false,daylight:true,walls:[],lights:[]};
 const first=geometry(vision,true),again=geometry({...vision,walls:[]},true);expect(again.sight).toEqual(first.sight);
 const changed=geometry({...vision,walls:[{id:'block',kind:'rectangle',ax:30,ay:-500,bx:40,by:500}]},true);
 expect(contains(first.sight,100,10)).toBe(true);expect(contains(changed.sight,100,10)).toBe(false);
 expect(geometry({...vision,lights:[{id:'flash',x:10,y:10,radius:100,height:10,strength:1,transient:true}]},true).lights).toEqual([]);
});
it('bounds global sight rays so zoomed SVG clipPaths stay within rasterizer coordinate limits while preserving wall occlusion',()=>{
 const geometry=createLegacyVisionGeometry();
 const vision:PlayerVision={origins:[{id:'pc',x:300,y:300}],rangeFt:60,radius:192,heavy:true,daylight:false,
  walls:[{id:'door-wall',ax:500,ay:0,bx:500,by:1000}],lights:[{id:'behind-wall',x:700,y:300,radius:100,height:20,strength:1}]};
 const raw=geometry(vision,true);
 const rawCoords=raw.sight.flatMap(p=>ring(p).flatMap(pt=>[Math.abs(pt.x),Math.abs(pt.y)]));
 expect(Math.max(...rawCoords)).toBeLessThanOrEqual(8192);
 const clipped=boundedPaths(raw.sight,{x:-512,y:-512,width:3072,height:3072,scale:1});
 const coords=clipped.flatMap(p=>ring(p).flatMap(pt=>[Math.abs(pt.x),Math.abs(pt.y)]));
 expect(Math.max(...coords)).toBeLessThanOrEqual(2560);
 expect(contains(clipped,400,300)).toBe(true);
 expect(contains(clipped,700,300)).toBe(false);
});
it('builds scene lighting vision for DM scene mode in legacy darkness without hiding terrain behind player sight',()=>{
 const baseMap={id:'m1',name:'Dungeon',imagePath:'/map.png',gridSizePx:50,feetPerSquare:5,mapWidthFt:100,mapFogEnabled:false,tokenFogEnabled:false,mapFogRevealed:[],tokenFogRevealed:[],walls:[{id:'w1',ax:100,ay:0,bx:100,by:200}]} as unknown as MapState;
 const tokens=[
  {id:'pc1',mapId:'m1',kind:'pc',refId:'c1',x:50,y:50,size:1,widthFt:5,initiative:null,isHidden:false,carriedLantern:true},
  {id:'hidden-npc',mapId:'m1',kind:'monster',refId:'m1',x:150,y:50,size:1,widthFt:5,initiative:null,isHidden:true,carriedLantern:true},
 ] as unknown as Token[];
 expect(createSceneVision({...baseMap,environment:{...baseMap.environment!,enabled:true,lighting:'day',lights:[{id:'l1',x:200,y:200,radiusFt:30,heightFt:8,intensity:1,color:'warm',flicker:true,visibleTorch:true}]}},tokens)).toBeUndefined();
 const scene=createSceneVision({...baseMap,environment:{...baseMap.environment!,enabled:true,lighting:'dungeon',heavyDarkness:true,lights:[{id:'l1',x:200,y:200,radiusFt:30,heightFt:8,intensity:1,color:'warm',flicker:true,visibleTorch:true}]}},tokens);
 expect(scene).toBeDefined();
 expect(scene!.heavy).toBe(false);
 expect(scene!.daylight).toBe(false);
 expect(scene!.origins).toEqual([]);
 expect(scene!.lights.map(l=>l.id)).toEqual(['l1','pc1']);
 expect(scene!.walls).toEqual(baseMap.walls);
});
