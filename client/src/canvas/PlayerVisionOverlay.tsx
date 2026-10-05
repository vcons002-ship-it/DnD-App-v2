import {LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import {forwardRef,useEffect,useId,useImperativeHandle,useLayoutEffect,useRef} from 'react';
import {lightCoverage,type VisionLight,type PlayerVision} from '../../../shared/playerVision';
import {groundYScale,groundPerspectiveCss,perspectiveSlope,type BattlefieldView} from './miniatureProjection';
import type {ExploredTerrain} from '../../../shared/exploration';
import {wallVisibilityPolygon,SIGHT_EXTENT,type WallPoint} from '../../../shared/mapWalls';
import type {TokenPresentation} from './tokenPresentation';
import type {MapEnvironment} from '../../../shared/mapEnvironment';
import {exploredTerrainBrightness,HEAVY_DARKVISION_DESATURATION,REGULAR_DARKVISION_DESATURATION} from '../../../shared/terrainLighting';
type Camera={view:BattlefieldView;tilt:number;rotation:number;width:number;height:number};
const circleVertices=Array.from({length:96},(_,i)=>({x:Math.cos(i*Math.PI/48),y:Math.sin(i*Math.PI/48)}));
export type PlayerVisionHandle={memoryCanvas:()=>HTMLCanvasElement|null;frame:()=>void;lights:(lights:VisionLight[])=>void;camera:(c:Partial<Camera>)=>void;move:(id:string,x:number,y:number)=>void};
/** Terrain visibility stays below lifted miniature pixels; darkvision
 * desaturation remains above both. Never disabled by effect quality. */
type TerrainTile={url:string;x:number;y:number;w:number;h:number};
type MemoryTerrain={environment?:MapEnvironment;explored?:ExploredTerrain;tiles:TerrainTile[];bounds:{x:number;y:number;w:number;h:number};grid?:{size:number;x:number;y:number}};
export const PlayerVisionOverlay=forwardRef<PlayerVisionHandle,Camera&{vision:PlayerVision;mapFogOfWar?:boolean;terrain?:MemoryTerrain;presentation?:TokenPresentation}>(function PlayerVisionOverlay(props,ref){
 const shade=useRef<HTMLDivElement>(null);
 const root=useRef<HTMLDivElement>(null);
 const lightPaths=useRef<SVGGElement>(null),originPaths=useRef<SVGGElement>(null);
 const spellPaths=useRef<SVGGElement>(null);
 const sightPaths=useRef<SVGClipPathElement>(null),lightClips=useRef<SVGGElement>(null);
 const memoryPaths=useRef<SVGClipPathElement>(null),memoryPlane=useRef<HTMLDivElement>(null),memoryMap=useRef<HTMLDivElement>(null);
 const memoryCanvas=useRef<HTMLCanvasElement>(null);
 const memoryProjection=useRef<{geometry:ExploredTerrain|undefined;camera:string}|null>(null);
 const polygonCache=useRef(new Map<string,{key:string;points:WallPoint[]}>());
 const id=useId().replace(/:/g,'');
 const lightId=`vision-lights-${id}`,shadeId=`vision-shade-${id}`,coverId=`vision-cover-${id}`;
 const sightId=`vision-sight-${id}`;
 const memoryId=`vision-memory-${id}`;
 useLayoutEffect(()=>{
  const parent=root.current?.parentElement;
  parent?.style.setProperty('--player-vision-cover',props.mapFogOfWar===false?'none':`url(#${coverId})`);
  return ()=>{parent?.style.removeProperty('--player-vision-cover');};
 },[coverId,props.mapFogOfWar]);
 const state=useRef(props);const live=useRef(new Map<string,{x:number;y:number}>());
 const renderedLights=useRef<VisionLight[]|null>(null);
 const pendingDraw=useRef(0);
 const draw=()=>{
  if(!shade.current||!lightPaths.current||!originPaths.current||!sightPaths.current||!lightClips.current)return;
  const {vision,view,tilt,rotation,width,height}=state.current;
  const sy=groundYScale(tilt),a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),k=perspectiveSlope(width,height,tilt);
  const wallsKey=JSON.stringify(vision.walls??[]);
  const activeKeys=new Set<string>();
  const polygon=(point:{id:string;x:number;y:number},radius:number)=>{
   const slot=point.id+':'+radius;activeKeys.add(slot);
   const key=`${point.x},${point.y}:${wallsKey}`;
   const cached=polygonCache.current.get(slot);
   if(cached?.key===key)return cached.points;
   const points=wallVisibilityPolygon(point,vision.walls??[],radius);
   polygonCache.current.set(slot,{key,points});return points;
  };
  const project=(vertices:WallPoint[])=>{
   let poly=vertices.map(vertex=>{
    const dx=view.x+vertex.x*view.scale-width/2;
    const dy=view.y+vertex.y*view.scale*sy-height/2;
    const x=c*dx-s*dy/sy,y=s*dx*sy+c*dy;return {x,y,w:1-y*k};});
   // Clip behind-camera vertices before perspective division, including deep zoom.
   const clipped:typeof poly=[];
   for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],pin=p.w>=.01,qin=q.w>=.01;
    if(pin)clipped.push(p);if(pin!==qin){const t=(.01-p.w)/(q.w-p.w);clipped.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,w:.01});}}
   poly=clipped;
   return poly.length?'M'+poly.map(p=>`${(width/2+p.x/p.w).toFixed(2)},${(height/2+p.y/p.w).toFixed(2)}`).join('L')+'Z':'';
  };
  const path=(point:{id:string;x:number;y:number},radius:number,actual=false,occlude=false)=>{
   const p=actual?point:state.current.presentation?.position(point.id)??live.current.get(point.id)??point;
   return project(occlude?polygon({...p,id:point.id},radius):circleVertices.map(v=>({x:p.x+v.x*radius,y:p.y+v.y*radius})));
  };
  // Reproject remembered terrain only when history or camera changes, never for
  // every light flicker. It contains map images/grid only, not a live scene copy.
  const geometry=state.current.presentation?state.current.presentation.explored():state.current.terrain?.explored,camera=JSON.stringify([view,tilt,rotation,width,height]);
  if(memoryPaths.current&&(memoryProjection.current?.geometry!==geometry||memoryProjection.current?.camera!==camera)){
   memoryPaths.current.innerHTML=(geometry??[]).map(p=>`<path clip-rule="evenodd" d="${p.map(r=>project(r.map(([x,y])=>({x,y})))).join('')}"/>`).join('');
   memoryProjection.current={geometry,camera};
   if(memoryPlane.current)memoryPlane.current.style.transform=groundPerspectiveCss(width,height,tilt,rotation);
   if(memoryMap.current)memoryMap.current.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale},${view.scale*sy})`;
  }
  const circles=vision.origins.map(o=>`<path fill="black" d="${path(o,vision.daylight?SIGHT_EXTENT:vision.radius,false,!!vision.walls?.length)}"/>`).join('');
  sightPaths.current.innerHTML=vision.origins.map(o=>`<path d="${path(o,SIGHT_EXTENT,false,true)}"/>`).join('');
  // Nested bands sample the renderer's smooth attenuation, including source height,
  // intensity, flicker radius and the actual animated hip anchor. No hard color disk.
  const clips:string[]=[],spellBands:string[]=[];
  const lights=(renderedLights.current??vision.lights).map((l,index)=>{
   let previous=0;const bands:string[]=[];
   for(let i=48;i>=1;i--){const radius=l.radius*LIGHT_SPILL_MULTIPLIER*i/48;
    const coverage=lightCoverage(radius-l.radius/64,l);
    const alpha=Math.max(0,(coverage-previous)/Math.max(.00001,1-previous));previous=coverage;
    if(alpha>.0001)bands.push(`<path fill="black" fill-opacity="${alpha.toFixed(4)}" d="${path(l,radius,!!renderedLights.current)}"/>`);
   }
   if(!vision.walls?.length){if(l.transient){spellBands.push(bands.join(''));return '';}return bands.join('');}
   const clip=`vision-lamp-${id}-${index}`;
   clips.push(`<clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><path d="${path(l,SIGHT_EXTENT,!!renderedLights.current,true)}"/></clipPath>`);
   const result=`<g clip-path="url(#${clip})">${bands.join('')}</g>`;
   if(l.transient){spellBands.push(result);return '';}
   return result;
  }).join('');
  lightClips.current.innerHTML=clips.join('');
  for(const slot of polygonCache.current.keys())if(!activeKeys.has(slot))polygonCache.current.delete(slot);
  // Keep the SVG mask in the DOM and share light geometry between both masks.
  // Encoding/decoding two large SVG image URLs per frame caused mobile stalls.
  originPaths.current.innerHTML=circles;
  lightPaths.current.innerHTML=lights;
  // Cosmetic flashes restore color only inside already-visible terrain. They
  // never enter the sight-cover mask or authorize/persist exploration.
  if(spellPaths.current)spellPaths.current.innerHTML=spellBands.join('');
  const filter=vision.daylight?'none':`grayscale(${vision.heavy?HEAVY_DARKVISION_DESATURATION:REGULAR_DARKVISION_DESATURATION})`;
  shade.current.style.backdropFilter=filter;
  shade.current.style.setProperty('-webkit-backdrop-filter',filter);
 };
 // Movement, camera following and flickering lights can all update in one
 // frame. Rebuild the SVG masks once using the final state, not for every event.
 const schedule=()=>{if(!pendingDraw.current)pendingDraw.current=requestAnimationFrame(()=>{pendingDraw.current=0;draw();});};
 useEffect(()=>()=>cancelAnimationFrame(pendingDraw.current),[]);
 useImperativeHandle(ref,()=>({memoryCanvas:()=>memoryCanvas.current,frame(){cancelAnimationFrame(pendingDraw.current);pendingDraw.current=0;draw();},lights(next){renderedLights.current=next;schedule();},camera(next){state.current={...state.current,...next};schedule();},move(id,x,y){if(!state.current.vision.origins.some(o=>o.id===id)&&!state.current.vision.lights.some(l=>l.id===id))return;live.current.set(id,{x,y});schedule();}}),[]);
 useLayoutEffect(()=>{state.current=props;renderedLights.current=null;
  for(const [id,p] of live.current){const next=props.vision.origins.find(o=>o.id===id)??props.vision.lights.find(o=>o.id===id);if(!next||(next.x===p.x&&next.y===p.y))live.current.delete(id);}
  schedule();},[props]);
 const terrain=props.terrain,b=terrain?.bounds,g=terrain?.grid;
 return <><div ref={root} data-testid="player-vision" data-explored-regions={terrain?.explored?.length??0} data-wall-count={props.vision.walls?.length??0} data-range-ft={props.vision.daylight?'unlimited':props.vision.rangeFt} data-heavy={String(props.vision.heavy)} data-origin-count={props.vision.origins.length}
  style={{position:'absolute',inset:0,zIndex:2,pointerEvents:'none',overflow:'hidden'}}>
  <svg width={props.width} height={props.height} style={{position:'absolute',inset:0}} aria-hidden="true"><defs>
   <clipPath id={sightId} clipPathUnits="userSpaceOnUse" ref={sightPaths}/><g ref={lightClips}/>
   <clipPath id={memoryId} clipPathUnits="userSpaceOnUse" ref={memoryPaths}/>
   <g id={lightId} ref={lightPaths}/>
   <mask id={shadeId} maskUnits="userSpaceOnUse" x="0" y="0" width={props.width} height={props.height}>
    <rect width={props.width} height={props.height} fill="white"/><use href={`#${lightId}`}/><g ref={spellPaths}/>
   </mask>
   <mask id={coverId} maskUnits="userSpaceOnUse" x="0" y="0" width={props.width} height={props.height}>
    <rect width={props.width} height={props.height} fill="white"/><g ref={originPaths}/>{props.vision.origins.length>0&&<g clipPath={`url(#${sightId})`}><use href={`#${lightId}`}/></g>}
   </mask>
  </defs></svg>
  <div data-testid="automatic-map-fog" style={{display:props.mapFogOfWar===false?'none':undefined,position:'absolute',inset:0,background:'#050608',maskImage:`url(#${coverId})`}}>
   {terrain&&b&&<div data-testid="explored-terrain" style={{position:'absolute',inset:0,clipPath:`url(#${memoryId})`}}>
    <div ref={memoryPlane} data-testid="explored-terrain-grade" style={{position:'absolute',width:props.width,height:props.height,transformOrigin:'50% 50%',filter:`grayscale(1) brightness(${exploredTerrainBrightness(terrain.environment,props.vision.heavy)})`}}>
     <div ref={memoryMap} style={{position:'absolute',transformOrigin:'0 0'}}>
      {!terrain.tiles.length&&<div style={{position:'absolute',left:b.x,top:b.y,width:b.w,height:b.h,background:'#2a2f3a'}}/>}
      {terrain.tiles.map((t,i)=><img key={`${t.url}:${i}`} src={t.url} alt="" draggable={false} style={{position:'absolute',left:t.x,top:t.y,width:t.w,height:t.h,maxWidth:'none'}}/>)}
      {g&&g.size>0&&<div style={{position:'absolute',left:b.x,top:b.y,width:b.w,height:b.h,backgroundImage:'linear-gradient(to right,#ffffff50 1px,transparent 1px),linear-gradient(to bottom,#ffffff50 1px,transparent 1px)',backgroundSize:`${g.size}px ${g.size}px`,backgroundPosition:`${g.x-b.x}px ${g.y-b.y}px`}}/>}
     </div>
    </div>
    {props.vision.heavy&&<canvas ref={memoryCanvas} data-testid="darkvision-memory-terrain" aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>}
   </div>}
  </div>
 </div>
  <div ref={shade} data-testid="player-vision-shade" style={{position:'absolute',inset:0,zIndex:4,pointerEvents:'none',maskImage:`url(#${shadeId})`}}/>
 </>;
});
