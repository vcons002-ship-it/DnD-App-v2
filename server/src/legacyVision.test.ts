import {it,expect} from 'vitest';
import {createLegacyVisionGeometry} from '../../client/src/canvas/legacyVision.js';
import {pointInRing} from '../../shared/wallGeometry.js';
import {fogVisionContains,type PlayerVision} from '../../shared/playerVision.js';

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
