import {it,expect} from 'vitest';
import clipping from 'polygon-clipping';
import {visibleTerrain,unionTerrain} from '../../shared/explorationSight.js';
import {wallVisibilityPolygon,SIGHT_EXTENT} from '../../shared/mapWalls.js';
import {lightCoverage,type PlayerVision} from '../../shared/playerVision.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
function reference(vision:PlayerVision){
 const polygon=(p:{x:number;y:number},r:number):ExploredTerrain=>[[wallVisibilityPolygon(p,vision.walls??[],r).map(p=>[Math.round(p.x*64)/64,Math.round(p.y*64)/64])]];
 const sight=unionTerrain(vision.origins.map(o=>polygon(o,SIGHT_EXTENT)));if(!vision.heavy)return sight;
 const nearby=unionTerrain(vision.origins.map(o=>polygon(o,vision.radius)));
 const lights=unionTerrain(vision.lights.map(l=>{let lo=0,hi=l.radius*1.5;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(lightCoverage(mid,l)>.10)lo=mid;else hi=mid;}return polygon(l,lo);}));
 return unionTerrain([nearby,...(lights.length?[clipping.intersection(sight,lights)]:[])]);
}
it('preserves explored terrain for contained lanterns, distant lights, walls and multiple viewers',()=>{
 const origin={id:'pc',x:0,y:0},lantern={...origin,id:'lantern',radius:15,height:6,strength:1};
 for(const walls of [[],[{id:'divider',ax:25,ay:-200,bx:25,by:200}]])for(const origins of [[origin],[origin,{id:'second',x:90,y:0}]])for(const heavy of [true,false])for(const lights of [[],[lantern],[{...lantern,x:5}],[{...lantern,x:90,radius:100}],[lantern,{...lantern,id:'distant',x:120,radius:100}]]){
  const vision:PlayerVision={rangeFt:60,radius:60,heavy,origins,walls,lights};
  expect(clipping.xor(visibleTerrain(vision,new Map()),reference(vision))).toEqual([]);
 }
});
