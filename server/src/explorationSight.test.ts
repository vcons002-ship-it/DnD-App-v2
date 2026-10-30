import {it,expect} from 'vitest';
import clipping from 'polygon-clipping';
import {visibleTerrain,unionTerrain,walkingTerrain} from '../../shared/explorationSight.js';
import {wallVisibilityPolygon,SIGHT_EXTENT} from '../../shared/mapWalls.js';
import {createPlayerVision,lightCoverage,type PlayerVision} from '../../shared/playerVision.js';
import type {ExploredTerrain} from '../../shared/exploration.js';
import type {MapState,Token} from '../../shared/types.js';
function reference(vision:PlayerVision){
 const polygon=(p:{x:number;y:number},r:number):ExploredTerrain=>[[wallVisibilityPolygon(p,vision.walls??[],r).map(p=>[Math.round(p.x*64)/64,Math.round(p.y*64)/64])]];
 const sight=unionTerrain(vision.origins.map(o=>polygon(o,SIGHT_EXTENT)));if(!vision.heavy)return sight;
 const nearby=unionTerrain(vision.origins.map(o=>polygon(o,vision.radius)));
 const lights=unionTerrain(vision.lights.map(l=>{let lo=0,hi=l.radius*1.5;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(lightCoverage(mid,l)>.10)lo=mid;else hi=mid;}return polygon(l,lo);}));
 return unionTerrain([nearby,...(lights.length?[clipping.intersection(sight,lights)]:[])]);
}
function area(shape:ExploredTerrain){
 let sum=0;
 for(const poly of shape)for(const [ri,ring] of poly.entries()){
  let a=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)a+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
  sum+=(ri===0?1:-1)*Math.abs(a)/2;
 }
 return sum;
}
it('preserves explored terrain for contained lanterns, distant lights, walls and multiple viewers',()=>{
 const origin={id:'pc',x:0,y:0},lantern={...origin,id:'lantern',radius:15,height:6,strength:1};
 for(const walls of [[],[{id:'divider',ax:25,ay:-200,bx:25,by:200}]])for(const origins of [[origin],[origin,{id:'second',x:90,y:0}]])for(const heavy of [true,false])for(const lights of [[],[lantern],[{...lantern,x:5}],[{...lantern,x:90,radius:100}],[lantern,{...lantern,id:'distant',x:120,radius:100}]]){
  const vision:PlayerVision={rangeFt:60,radius:60,heavy,origins,walls,lights};
  expect(clipping.xor(visibleTerrain(vision,new Map()),reference(vision))).toEqual([]);
 }
});
it('batches walking terrain across static and carried lights within sub-pixel quantization tolerance of step-by-step unions',()=>{
 for(const carriedLantern of [false,true])for(const heavyDarkness of [true,false]){
  const map={id:'walk-map',sessionId:'s',name:'Walk',imagePath:null,slidesUrl:null,gridSizePx:50,feetPerSquare:5,widthFt:0,mapFogEnabled:false,tokenFogEnabled:false,mapVisionEnabled:true,tokenVisionEnabled:true,explorationMode:'remembered',mapFogRevealed:[],tokenFogRevealed:[],walls:[{id:'w1',ax:250,ay:0,bx:250,by:180}],environment:{enabled:true,lighting:'dungeon',heavyDarkness,weather:'none',weatherIntensity:0,windDirection:0,ambientSound:'none',ambientVolume:0,lights:[{id:'torch',x:420,y:120,radiusFt:30,heightFt:6,color:'warm',intensity:1,flicker:false,visibleTorch:true}]}} as unknown as MapState;
  const tokens=[{id:'pc1',mapId:'walk-map',kind:'pc',refId:'c1',x:100,y:100,widthFt:5,isHidden:false,carriedLantern},{id:'pc2',mapId:'walk-map',kind:'pc',refId:'c2',x:80,y:260,widthFt:5,isHidden:false}] as unknown as Token[];
  const from={x:100,y:100},to={x:340,y:220};
  const actual=walkingTerrain({walkSight:{map,tokens,tokenId:'pc1',from,to}});
  const steps=actual.samples-1,owned=new Set(['c1','c2']),parts:ExploredTerrain[]=[];let refHalf:ExploredTerrain=[];
  for(let i=0;i<=steps;i++){
   const t=i/steps,at=tokens.map(token=>token.id==='pc1'?{...token,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t}:token);
   const vision=createPlayerVision(map,at,owned)!;
   parts.push(reference(vision));if(i===steps/2)refHalf=unionTerrain(parts);
  }
  const refSeen=unionTerrain(parts);
  expect(area(clipping.xor(actual.half,refHalf))/area(refHalf)).toBeLessThan(1e-6);
  expect(area(clipping.xor(actual.seen,refSeen))/area(refSeen)).toBeLessThan(1e-6);
 }
});
