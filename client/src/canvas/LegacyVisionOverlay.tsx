import {forwardRef,memo,useId,useImperativeHandle,useLayoutEffect,useEffect,useMemo,useRef,useState} from 'react';
import type {PlayerVisionHandle} from './PlayerVisionOverlay';
import type {PlayerVision} from '../../../shared/playerVision';
import type {ExploredTerrain} from '../../../shared/exploration';
import type {BattlefieldView} from './miniatureProjection';
import {legacyPath,createLegacyVisionGeometry} from './legacyVision';
import type {LegacyGeometry} from '../../../shared/legacyVision';
import type {RasterAsset,RasterTiles} from '../../../shared/serverRendering';
import {renderedImage} from '../lib/renderImages';
import {movementTiming} from '../lib/movementTiming';
import type {LegacyPlayback} from '../../../shared/legacyMotion';
import {legacyMotionIndex} from '../../../shared/legacyMotion';
import {SeparatedTerrainPlane} from './SeparatedTerrainPlane';
import type {LegacyMotionAtlas} from '../../../shared/legacyMotion';
import {LegacyRasterPlane,type RasterPlaneHandle} from './LegacyRasterPlane';
import type {TokenPresentation} from './tokenPresentation';

type Props={separatedMask?:LegacyMotionAtlas;vision:PlayerVision;presentation?:TokenPresentation;raster?:RasterAsset|null;tiles?:RasterTiles;terrainRaster?:RasterAsset;motion?:LegacyPlayback;geometry?:LegacyGeometry|null;view:BattlefieldView;width:number;height:number;mapFogOfWar:boolean;explored?:ExploredTerrain;keepRevealed?:boolean};
const MaskTile=memo(function MaskTile({asset}:{asset:RasterAsset}){
 const picture=renderedImage(asset.key);
 return picture?<img data-mask-tile={asset.key} src={picture.src} alt="" draggable={false} style={{position:'absolute',left:asset.x,top:asset.y,width:asset.width/asset.scale,height:asset.height/asset.scale,maxWidth:'none'}}/>:null;
});
function rasterCover(bounds:Omit<RasterAsset,'key'>,view:BattlefieldView,width:number,height:number){
 const left=view.x+bounds.x*view.scale,top=view.y+bounds.y*view.scale;
 const clampX=(v:number)=>Math.max(0,Math.min(width,v)),clampY=(v:number)=>Math.max(0,Math.min(height,v));
 const l=clampX(left),r=clampX(left+bounds.width/bounds.scale*view.scale),t=clampY(top),b=clampY(top+bounds.height/bounds.scale*view.scale);
 return [{left:0,top:0,width,height:t},{left:0,top:b,width,height:height-b},{left:0,top:t,width:l,height:b-t},{left:r,top:t,width:width-r,height:b-t}];
}
/** Visibility refresh is bounded; camera placement updates synchronously using
 * the existing pixels/paths, so panning cannot expose ground behind the mask. */
export const LegacyVisionOverlay=forwardRef<PlayerVisionHandle,Props>(function LegacyVisionOverlay(props,ref){
 const atlasMask=useRef<RasterPlaneHandle>(null),atlasTerrain=useRef<RasterPlaneHandle>(null),baseTerrain=useRef<RasterPlaneHandle>(null),separatedTerrain=useRef<RasterPlaneHandle>(null),motion=useRef(props.motion);motion.current=props.motion;
 const svg=useRef<SVGSVGElement>(null),maskRoot=useRef<HTMLDivElement>(null),tileWorld=useRef<HTMLDivElement>(null),edges=useRef<(HTMLDivElement|null)[]>([]),paintCamera=useRef<(view:BattlefieldView)=>void>(()=>{});
 const [bufferedFrame,setFrame]=useState(props),latest=useRef(props),previousView=useRef(props.view);
 const placedView=useRef(props.view);
 // Publish server mask and token positions in the same React commit; only the
 // camera needs imperative buffering. A second mask state commit adds latency.
 const content=props.geometry!==undefined||props.presentation?props:bufferedFrame,frame={...content,view:latest.current.view};
 const displayedKey=frame.tiles?.key??frame.raster?.key;
 useLayoutEffect(()=>{if(displayedKey)movementTiming('maskCommit',{maskKey:displayedKey});},[displayedKey]);
 const draws=useRef(0),drawCount=useMemo(()=>++draws.current,[content]);
 const timer=useRef<ReturnType<typeof setTimeout>>(),lastDraw=useRef(performance.now());
 const schedule=()=>{if(timer.current!==undefined)return;timer.current=setTimeout(()=>{
   timer.current=undefined;lastDraw.current=performance.now();setFrame({...latest.current});
 },Math.max(0,500-(performance.now()-lastDraw.current)));};
 useLayoutEffect(()=>{
   const previous=previousView.current,same=props.view.x===previous.x&&props.view.y===previous.y&&props.view.scale===previous.scale;
   latest.current={...props,view:same?latest.current.view:props.view};previousView.current=props.view;
   if(props.geometry===undefined&&!props.presentation)schedule();
 },[props]);
 useLayoutEffect(()=>paintCamera.current(latest.current.view));
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const paintLocal=useRef(()=>{}),live=useRef(new Map<string,{x:number;y:number}>());
 useLayoutEffect(()=>{live.current.clear();paintLocal.current();},[props.vision,props.presentation]);
 useImperativeHandle(ref,()=>({cover:()=>undefined,memoryCanvas:()=>null,frame:(now=performance.now())=>{const m=motion.current;if(m?.atlas){const index=legacyMotionIndex(now,m.start,m.durationMs,m.atlas.count);atlasMask.current?.frame(index);atlasTerrain.current?.frame(index);separatedTerrain.current?.frame(index);}else paintLocal.current();},prepareLights:()=>{},lights:()=>{},move:(id,x,y)=>{live.current.set(id,{x,y});paintLocal.current();},camera:camera=>{
   if(camera.view){latest.current={...latest.current,view:camera.view};paintCamera.current(camera.view);}
 }}),[]);
 const geometry=useRef(createLegacyVisionGeometry()).current;
 const localVision=frame.presentation?.personalVision()??frame.vision;
 const localMemory=frame.presentation?frame.presentation.explored():frame.explored;
 const paths=useMemo(()=>frame.geometry!==undefined?frame.geometry??{sight:[],near:[],lights:[]}:geometry(localVision,frame.mapFogOfWar),[frame.geometry,localVision,frame.mapFogOfWar,geometry]);
 const memory=useMemo(()=>frame.geometry!==undefined?frame.geometry?.memory??[]:(localMemory??[]).map(p=>p.map(r=>legacyPath(r.map(([x,y])=>({x,y})))).join('')),[frame.geometry,localMemory]);
 const markup=useRef(new WeakMap<Element,string>()),drawn=useRef<{vision:PlayerVision;memory:ExploredTerrain|undefined}>();
 const memoryPaths=useRef<{source:ExploredTerrain|undefined;paths:string[]}>();
 paintLocal.current=()=>{
  if(frame.geometry!==undefined||!svg.current)return;
  let vision=frame.presentation?.personalVision()??frame.vision;
  const explored=frame.presentation?frame.presentation.explored():frame.explored;
  if(live.current.size)vision={...vision,origins:vision.origins.map(o=>({...o,...live.current.get(o.id)})),lights:vision.lights.map(l=>({...l,...live.current.get(l.id)}))};
  if(drawn.current?.vision===vision&&drawn.current.memory===explored)return;
  drawn.current={vision,memory:explored};
  const paths=geometry(vision,frame.mapFogOfWar);
  if(!memoryPaths.current||memoryPaths.current.source!==explored)memoryPaths.current={source:explored,paths:(explored??[]).map(p=>p.map(r=>legacyPath(r.map(([x,y])=>({x,y})))).join(''))};
  const values={...paths,memory:memoryPaths.current.paths};
  // Only the small SVG sight paths change during local movement. Camera and
  // map pixels stay retained; the shared token clock supplies the exact pose.
  for(const node of svg.current.querySelectorAll<SVGGElement>('[data-legacy-paths]')){
   const key=node.dataset.legacyPaths as keyof typeof values;
   const html=values[key].map(d=>`<path d="${d}" fill-rule="evenodd"/>`).join('');
   if(markup.current.get(node)!==html){node.innerHTML=html;markup.current.set(node,html);}
  }
 };
 useLayoutEffect(()=>{drawn.current=undefined;paintLocal.current();});
 const id=useId().replace(/:/g,''),sight=`legacy-sight-${id}`,visible=`legacy-visible-${id}`,lit=`legacy-lit-${id}`,cover=`legacy-cover-${id}`;
 const transform=`translate(${frame.view.x} ${frame.view.y}) scale(${frame.view.scale})`;
 // Local groups are owned by paintLocal; React owns server-supplied paths.
 const shapes=(values:string[])=>frame.geometry===undefined&&frame.presentation?null:values.map((d,i)=><path key={i} d={d} fillRule="evenodd"/>);
 const all=!frame.mapFogOfWar&&!frame.vision.heavy;
 const atlas=props.motion?.atlas??props.separatedMask,raster=atlas?.mask??frame.raster,picture=renderedImage(raster?.key),tiles=atlas?undefined:frame.tiles;
 const terrainAsset=atlas?.terrain??frame.terrainRaster,terrainBounds=atlas?.terrainBounds??atlas?.bounds??frame.terrainRaster;
 const bounds=atlas?.bounds??tiles?.bounds??raster;
 paintCamera.current=view=>{
  const root=svg.current??maskRoot.current;if(root){for(const [key,value] of Object.entries({cameraX:view.x,cameraY:view.y,cameraScale:view.scale}))if(root.dataset[key]!==String(value))root.dataset[key]=String(value);}
  const same=(a:BattlefieldView,b:BattlefieldView)=>a.x===b.x&&a.y===b.y&&a.scale===b.scale;
  if(same(placedView.current,view)&&same(frame.view,view))return;
  placedView.current=view;
  const transform=`translate(${view.x} ${view.y}) scale(${view.scale})`;
  svg.current?.querySelectorAll('[data-legacy-world]').forEach(g=>g.setAttribute('transform',transform));
  for(const plane of [atlasMask.current,atlasTerrain.current,baseTerrain.current,separatedTerrain.current])plane?.camera(view);
  if(tileWorld.current)tileWorld.current.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  if(bounds)rasterCover(bounds,view,frame.width,frame.height).forEach((rect,i)=>{const edge=edges.current[i];if(edge)for(const [key,value] of Object.entries(rect))edge.style.setProperty(key,`${value}px`);});
 };
 const terrain=atlas?.colorBase?<div data-testid="legacy-terrain" data-grading="local-color" data-motion-layout="shared-base" style={{position:'absolute',inset:0,zIndex:0,pointerEvents:'none',overflow:'hidden'}}><SeparatedTerrainPlane ref={separatedTerrain} atlas={atlas} view={frame.view}/></div>:terrainAsset&&terrainBounds?<div data-testid="legacy-terrain" data-grading="server" data-motion-layout={atlas?.base?'shared-base':'full'} style={{position:'absolute',inset:0,zIndex:0,pointerEvents:'none',overflow:'hidden'}}>
  {atlas?.base&&<LegacyRasterPlane ref={baseTerrain} asset={atlas.base} bounds={atlas.base} view={frame.view} testId="legacy-motion-base"/>}
  <LegacyRasterPlane ref={atlasTerrain} asset={terrainAsset} bounds={terrainBounds} view={frame.view} columns={atlas?.columns} frameWidth={atlas?.terrainBounds?.width??atlas?.frameWidth} frameHeight={atlas?.terrainBounds?.height??atlas?.frameHeight} testId={atlas?'legacy-motion-terrain':undefined}/>
 </div>:null;
 if(tiles||raster&&picture){
  const cover=rasterCover(bounds!,frame.view,frame.width,frame.height);
  return <>{terrain}<div ref={maskRoot} data-testid="legacy-vision" data-geometry-source="server" data-render-source="server-raster" data-raster-key={tiles?.key??raster!.key} data-mask-tiles={tiles?Object.keys(tiles.tiles).length:undefined} data-draw-count={drawCount} data-refresh-ms={atlas?'33':'500'} data-wall-count={frame.vision.walls?.length??0} data-origin-count={frame.vision.origins.length} data-heavy={String(frame.vision.heavy)} style={{position:'absolute',inset:0,zIndex:2,pointerEvents:'none',overflow:'hidden'}} aria-hidden="true">
   {cover.map((rect,i)=><div key={i} ref={el=>{edges.current[i]=el;}} data-legacy-edge={i} style={{position:'absolute',...rect,background:'#050608'}}/>)}
   {atlas?<LegacyRasterPlane ref={atlasMask} asset={atlas.mask} bounds={atlas.bounds} view={frame.view} columns={atlas.columns} frameWidth={atlas.frameWidth} frameHeight={atlas.frameHeight} testId="legacy-motion-mask"/>:tiles?<div ref={tileWorld} data-testid="legacy-mask-world" style={{position:'absolute',left:0,top:0,transformOrigin:'0 0',transform:`translate(${frame.view.x}px,${frame.view.y}px) scale(${frame.view.scale})`}}>{Object.entries(tiles.tiles).map(([id,asset])=><MaskTile key={id} asset={asset}/>)}</div>:<LegacyRasterPlane ref={atlasMask} asset={raster!} bounds={raster!} view={frame.view} testId="legacy-mask-image"/>}
  </div></>;
 }
 return <svg key={frame.geometry===undefined?'client':'server'} ref={svg} data-testid="legacy-vision" data-geometry-source={frame.geometry===undefined?'client':frame.geometry===null?'pending':'server'} data-draw-count={drawCount} data-refresh-ms={frame.geometry===undefined&&frame.presentation?'16':'500'} data-wall-count={frame.vision.walls?.length??0} data-origin-count={frame.vision.origins.length} data-heavy={String(frame.vision.heavy)}
   width={frame.width} height={frame.height} style={{position:'absolute',inset:0,zIndex:2,pointerEvents:'none'}} aria-hidden="true">
   <defs>
     <clipPath id={sight}><g data-legacy-paths="sight" data-legacy-world="" transform={transform}>{shapes(paths.sight)}</g></clipPath>
     <mask id={lit} maskUnits="userSpaceOnUse" x="0" y="0" width={frame.width} height={frame.height}>
       <rect width="100%" height="100%" fill="white"/>
       <g data-legacy-paths="lights" data-legacy-world="" transform={transform} fill="black">{shapes(paths.lights)}</g>
     </mask>
     <g id={visible}>{all?<rect width={frame.width} height={frame.height}/>:frame.vision.heavy?<>
       <g data-legacy-paths="near" data-legacy-world="" transform={transform}>{shapes(paths.near)}</g>
       <g clipPath={frame.mapFogOfWar?`url(#${sight})`:undefined}><g data-legacy-paths="lights" data-legacy-world="" transform={transform}>{shapes(paths.lights)}</g></g>
     </>:<g data-legacy-paths="sight" data-legacy-world="" transform={transform}>{shapes(paths.sight)}</g>}</g>
     <mask id={cover} maskUnits="userSpaceOnUse" x="0" y="0" width={frame.width} height={frame.height}>
       <rect width="100%" height="100%" fill="white"/>
       <g data-legacy-paths="memory" data-legacy-world="" transform={transform} fill={frame.keepRevealed?'black':'#aaa'}>{shapes(memory)}</g>
       <use href={`#${visible}`} fill="black"/>
     </mask>
   </defs>
   <rect data-testid="legacy-fog-cover" width="100%" height="100%" fill="#050608" mask={`url(#${cover})`}/>
   {!frame.vision.daylight&&<g clipPath={frame.mapFogOfWar?`url(#${sight})`:undefined}>
     <rect width="100%" height="100%" fill="#000" opacity={frame.vision.heavy?.6:.3} mask={`url(#${lit})`}/>
   </g>}
 </svg>;
});
