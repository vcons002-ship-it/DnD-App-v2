import {useCallback,useEffect,useMemo,useRef,useState,type PointerEvent,type ButtonHTMLAttributes} from 'react';
import {createRoot} from 'react-dom/client';
import clipping from 'polygon-clipping';
import {MiniatureLayer,type MiniatureLayerHandle,type MiniatureToken} from '../canvas/MiniatureLayer';
import {PlayerVisionOverlay,type PlayerVisionHandle} from '../canvas/PlayerVisionOverlay';
import {MINIATURES} from '../lib/miniatures';
import {useStore} from '../state/socket';
import {groundYScale,projectGround,unprojectGround,screenToMap,type BattlefieldView} from '../canvas/miniatureProjection';
import type {EnvironmentPreviewSettings} from '../canvas/battlefieldEnvironment';
import {DEFAULT_MAP_ENVIRONMENT} from '../../../shared/mapEnvironment';
import {createPlayerVision,visionContains,visionLit,lightCoverage,type PlayerVision,type VisionLight} from '../../../shared/playerVision';
import {stopAtWalls,wallCollisionRadiusFt,wallVisibilityPolygon,SIGHT_EXTENT,type MapWall} from '../../../shared/mapWalls';
import {facingAfterMove} from '../../../shared/tokenFacing';
import type {ExploredTerrain} from '../../../shared/exploration';
import type {MapState,Token,StateSnapshot} from '../../../shared/types';
import scene from './scene.json';
import './preview.css';

const walls=scene.walls as MapWall[],W=scene.width,H=scene.height,px=64/5,start={x:400,y:190};
const image=new URL('./courtyard.png',location.href).href;
const parameters=new URLSearchParams(location.search);
parameters.set('archArt','1');parameters.set('archData',new URL('./scene.json',location.href).pathname);
history.replaceState(null,'',location.pathname+'?'+parameters);
useStore.setState({snapshot:{map:{id:scene.mapId}} as StateSnapshot});
const asset=(url:string)=>new URL('.'+url,location.href).href;
const definition=(id:string)=>{const d=MINIATURES[id];return {...d,url:asset(d.url),baseTextureUrl:d.baseTextureUrl?asset(d.baseTextureUrl):undefined};};
const druk=definition('druk'),goblin=definition('goblin');
type Point={x:number;y:number};
type Camera={view:BattlefieldView;tilt:number;rotation:number};
type Level='day'|'dark'|'heavy';
const polygon=(v:PlayerVision,p:Point,r:number):ExploredTerrain=>[[wallVisibilityPolygon(p,v.walls??[],r).map(q=>[Math.round(q.x*64)/64,Math.round(q.y*64)/64])]];
/** Same wall-clipped nearby/distant-light exploration geometry as the server. */
function seenTerrain(v:PlayerVision):ExploredTerrain {
 const sight=polygon(v,v.origins[0],SIGHT_EXTENT);
 if(v.daylight)return sight;
 const nearby=polygon(v,v.origins[0],v.radius),lights=v.lights.map(l=>{
  let lo=0,hi=l.radius*1.5;
  for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(lightCoverage(mid,l)>.10)lo=mid;else hi=mid;}
  return polygon(v,l,lo);
 });
 return lights.length?clipping.union(nearby,clipping.intersection(sight,clipping.union(lights[0],...lights.slice(1)))):nearby;
}

/** Activate touch controls on release; do not depend on a delayed synthetic click. */
function PreviewButton({onPress,...props}:Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onClick'>&{onPress:()=>void}){
 const lastTouch=useRef(-Infinity),touchStart=useRef<Point|null>(null);
 return <button {...props} onPointerDown={e=>{if(e.pointerType==='touch')touchStart.current={x:e.clientX,y:e.clientY};}}
  onPointerCancel={()=>{touchStart.current=null;}}
  onPointerUp={e=>{const p=touchStart.current;touchStart.current=null;if(e.pointerType!=='touch'||!p)return;
   const b=e.currentTarget.getBoundingClientRect();
   if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>12||e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)return;
   lastTouch.current=performance.now();onPress();}}
  onClick={e=>{if(e.detail===0||performance.now()-lastTouch.current>700)onPress();}}/>;
}

function Preview(){
 const stage=useRef<HTMLDivElement>(null),layer=useRef<MiniatureLayerHandle>(null),cover=useRef<PlayerVisionHandle>(null);
 const [size,setSize]=useState({width:412,height:600}),[position,setPosition]=useState(start),[facing,setFacing]=useState(0);
 const live=useRef({...start}),[level,setLevel]=useState<Level>('heavy'),[lantern,setLantern]=useState(true);
 const [mode,setMode]=useState<'move'|'pan'|'rotate'>('move'),[ready,setReady]=useState(0);
 const [memory,setMemory]=useState<ExploredTerrain>([]),memoryRef=useRef<ExploredTerrain>([]),memoryAt=useRef(0);
 const [notice,setNotice]=useState('Tap a destination to walk. Drag Druk’s base to preview a move.');
 const [ghost,setGhost]=useState<Point|null>(null);
 const [camera,setCamera]=useState<Camera>({view:{x:0,y:0,scale:1},tilt:0,rotation:0}),cameraRef=useRef(camera);
 const motion=useRef(0),cameraMotion=useRef(0),lightsAt=useRef(0);
 const environment=useMemo(()=>({...DEFAULT_MAP_ENVIRONMENT,enabled:true,lighting:level==='day'?'day' as const:'dungeon' as const,
  heavyDarkness:level==='heavy',mist:false,shadows:true,lights:[]}),[level]);
 const token=useMemo(()=>({id:'druk',refId:'druk',kind:'pc',x:position.x,y:position.y,carriedLantern:lantern,isHidden:false,widthFt:5}) as Token,[position,lantern]);
 const map=useMemo<MapState>(()=>({id:scene.mapId,sessionId:'preview',name:'Ruined courtyard',imagePath:image,slidesUrl:null,
  environment,walls,gridSizePx:64,feetPerSquare:5,mapWidthFt:95,gridOffsetX:0,gridOffsetY:0,gridLocked:true,gridHidden:false,
  mapFogEnabled:false,tokenFogEnabled:false,mapFogRevealed:[],tokenFogRevealed:[]}),[environment]);
 const vision=useMemo(()=>createPlayerVision(map,[token],new Set(['druk']))!,[map,token]);
 const visionRef=useRef(vision);visionRef.current=vision;
 const settings=useMemo<EnvironmentPreviewSettings>(()=>({...environment,scenery:false,mapUrl:image,mapWidth:W,mapHeight:H,pixelsPerFoot:px,
  walls,shadowDirectionDegrees:55,shadowLength:1.05,shadowOpacity:.8,mistQuality:'auto',mistOpacity:0,
  darkvisionTerrain:level==='heavy'?[{url:image,x:0,y:0,w:W,h:H}]:undefined,darkvisionGrid:{size:64,x:0,y:0}}),[environment,level]);
 const visibleAt=useCallback((id:string,x:number,y:number)=>id==='druk'||visionContains(visionRef.current,x,y),[]);
 const lights=useCallback((next:VisionLight[])=>{const now=performance.now();if(now-lightsAt.current<66)return;lightsAt.current=now;cover.current?.lights(next);},[]);
 const reportReady=useCallback((ids:ReadonlySet<string>)=>setReady(ids.size),[]);
 const memoryCanvas=useCallback(()=>cover.current?.memoryCanvas()??null,[]);
 useEffect(()=>{
  if(performance.now()-memoryAt.current<70)return;
  memoryAt.current=performance.now();
  try{const seen=seenTerrain(vision),next=memoryRef.current.length?clipping.union(memoryRef.current,seen):seen;memoryRef.current=next;setMemory(next);}
  catch{setNotice('Exploration will update on the next movement.');}
 },[vision]);
 useEffect(()=>{
  const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize({width:Math.round(r.width),height:Math.round(r.height)});});
  observer.observe(stage.current!);return()=>observer.disconnect();
 },[]);
 const apply=useCallback((c:Camera)=>{cameraRef.current=c;setCamera(c);layer.current?.setProjection(c.tilt,c.rotation,c.view);cover.current?.camera({view:c.view,tilt:c.tilt,rotation:c.rotation});},[]);
 const centered=useCallback((tilt=0,whole=false):Camera=>{
  const scale=whole?Math.min(size.width/(W*1.4),size.height/(H*1.4)) : Math.min(1.25,size.width/560);
  const p=whole?{x:W/2,y:H/2}:live.current;
  return {tilt,rotation:0,view:{scale,x:size.width/2-p.x*scale,y:size.height*.44-p.y*scale*groundYScale(tilt)}};
 },[size]);
 useEffect(()=>{apply(centered());},[centered,apply]);
 useEffect(()=>()=>{cancelAnimationFrame(motion.current);cancelAnimationFrame(cameraMotion.current);},[]);
 const transition=(next:Camera)=>{
  cancelAnimationFrame(cameraMotion.current);const from=cameraRef.current,t0=performance.now();
  const tick=(now:number)=>{const t=Math.min(1,(now-t0)/420),e=t*t*(3-2*t);
   apply({tilt:from.tilt+(next.tilt-from.tilt)*e,rotation:from.rotation+(next.rotation-from.rotation)*e,
    view:{x:from.view.x+(next.view.x-from.view.x)*e,y:from.view.y+(next.view.y-from.view.y)*e,scale:from.view.scale+(next.view.scale-from.view.scale)*e}});
   if(t<1)cameraMotion.current=requestAnimationFrame(tick);
  };cameraMotion.current=requestAnimationFrame(tick);
 };
 const ground=(p:Point,c=cameraRef.current)=>{const q=unprojectGround(p.x,p.y,size.width,size.height,c.tilt,c.rotation);return screenToMap(q.x,q.y,c.view,c.tilt);};
 const screen=(p:Point)=>projectGround(camera.view.x+p.x*camera.view.scale,camera.view.y+p.y*camera.view.scale*groundYScale(camera.tilt),size.width,size.height,camera.tilt,camera.rotation);
 const local=(e:PointerEvent)=>{const r=stage.current!.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 const destination=(p:Point)=>stopAtWalls(live.current,{x:Math.max(0,Math.min(W,p.x)),y:Math.max(0,Math.min(H,p.y))},wallCollisionRadiusFt(5)*px,walls);
 const walk=(requested:Point)=>{
  cancelAnimationFrame(motion.current);const from={...live.current},to=destination(requested),distance=Math.hypot(to.x-from.x,to.y-from.y);
  layer.current?.previewMove('druk',null);setGhost(null);
  if(distance<1){setNotice('The wall blocks that move. Go through an arch opening.');return;}
  const heading=facingAfterMove(from.x,from.y,to.x,to.y,facing),t0=performance.now(),duration=Math.min(1100,Math.max(350,distance/480*1000));let committed=0;
  setNotice(Math.hypot(to.x-requested.x,to.y-requested.y)>3?'Druk stops before the wall.':'Walking — explored terrain stays in memory.');
  const tick=(now:number)=>{const t=Math.min(1,(now-t0)/duration),e=t*t*(3-2*t),p={x:from.x+(to.x-from.x)*e,y:from.y+(to.y-from.y)*e};
   live.current=p;visionRef.current.origins[0].x=p.x;visionRef.current.origins[0].y=p.y;
   cover.current?.move('druk',p.x,p.y);layer.current?.moveToken('druk',p.x,p.y,t===1,heading);
   if(t===1||now-committed>60){committed=now;setPosition(p);setFacing(heading);}
   if(t<1)motion.current=requestAnimationFrame(tick);
  };motion.current=requestAnimationFrame(tick);
 };
 const drag=useRef<{id:number;start:Point;camera:Camera;kind:'token'|'pan'|'rotate'|'tap'}|null>(null);
 const pointers=useRef(new Map<number,Point>()),pinch=useRef<{distance:number;center:Point;camera:Camera}|null>(null);
 const down=(e:PointerEvent<HTMLDivElement>)=>{
  const p=local(e);pointers.current.set(e.pointerId,p);stage.current!.setPointerCapture(e.pointerId);cancelAnimationFrame(cameraMotion.current);
  if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},camera:cameraRef.current};drag.current=null;layer.current?.previewMove('druk',null);setGhost(null);return;}
  const onBase=Math.hypot(ground(p).x-live.current.x,ground(p).y-live.current.y)<=32;
  drag.current={id:e.pointerId,start:p,camera:cameraRef.current,kind:mode==='rotate'||e.button===2?'rotate':mode==='pan'?'pan':onBase?'token':'tap'};
 };
 const move=(e:PointerEvent<HTMLDivElement>)=>{
  const p=local(e);if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,p);
  if(pinch.current&&pointers.current.size===2){const [a,b]=[...pointers.current.values()],g=pinch.current,c=g.camera,center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
   const scale=Math.max(.15,Math.min(3,c.view.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,g.distance))),before=ground(g.center,c);
   const next={...c,view:{...c.view,scale}},after=ground(center,next);
   next.view.x+=(after.x-before.x)*scale;next.view.y+=(after.y-before.y)*scale*groundYScale(c.tilt);apply(next);return;
  }
  const d=drag.current;if(!d||d.id!==e.pointerId)return;
  if(d.kind==='token'){const p2=destination(ground(p)),heading=facingAfterMove(live.current.x,live.current.y,p2.x,p2.y,facing);setGhost(p2);layer.current?.previewMove('druk',{...p2,facing:heading});return;}
  if(d.kind==='tap'&&Math.hypot(p.x-d.start.x,p.y-d.start.y)>12)d.kind='pan';
  if(d.kind==='pan'){const a=ground(d.start,d.camera),b=ground(p,d.camera),c=d.camera;apply({...c,view:{...c.view,x:c.view.x+(b.x-a.x)*c.view.scale,y:c.view.y+(b.y-a.y)*c.view.scale*groundYScale(c.tilt)}});}
  if(d.kind==='rotate')apply({...d.camera,rotation:d.camera.rotation+(p.x-d.start.x)*.3});
 };
 const up=(e:PointerEvent<HTMLDivElement>)=>{
  const d=drag.current,p=local(e);pointers.current.delete(e.pointerId);
  if(pinch.current){if(!pointers.current.size)pinch.current=null;drag.current=null;return;}
  if(d?.id===e.pointerId&&(d.kind==='tap'||d.kind==='token')&&e.type!=='pointercancel')walk(ground(p));
  drag.current=null;layer.current?.previewMove('druk',null);setGhost(null);
  if(stage.current?.hasPointerCapture(e.pointerId))stage.current.releasePointerCapture(e.pointerId);
 };
 const zoom=(factor:number)=>{const c=cameraRef.current,scale=Math.max(.15,Math.min(3,c.view.scale*factor));transition({...c,view:{scale,x:size.width/2-(size.width/2-c.view.x)*scale/c.view.scale,y:size.height/2-(size.height/2-c.view.y)*scale/c.view.scale}});};
 const tokens:MiniatureToken[]=[{id:'druk',...position,diameter:64,hidden:false,facing,carriedLantern:lantern,definition:druk,outline:visionLit(vision,position.x,position.y)?'#70ae77':undefined},
  {id:'goblin',x:810,y:370,diameter:43,hidden:false,facing:Math.PI,definition:goblin,outline:visionLit(vision,810,370)?'#c96654':undefined}];
 const reset=()=>{cancelAnimationFrame(motion.current);live.current={...start};setPosition({...start});setFacing(0);layer.current?.moveToken('druk',start.x,start.y,true);memoryRef.current=[];memoryAt.current=0;setMemory([]);transition({...centered(),view:{...centered().view,x:size.width/2-start.x*centered().view.scale,y:size.height*.44-start.y*centered().view.scale}});setNotice('Fresh exploration. Tap a destination or drag Druk’s base.');};
 const label=screen(position),ghostLabel=ghost?screen(ghost):null;
 return <main><header><strong>Darkness exploration</strong><span>Your own preview</span></header>
  <nav aria-label="Darkness and lantern"><label>Lighting <select aria-label="Darkness level" value={level} onChange={e=>setLevel(e.target.value as Level)}><option value="day">Daylight</option><option value="dark">Regular darkness</option><option value="heavy">Heavy darkness</option></select></label>
   <PreviewButton aria-pressed={lantern} onPress={()=>setLantern(v=>!v)}>Lantern {lantern?'on':'off'}</PreviewButton><PreviewButton onPress={reset}>Reset</PreviewButton></nav>
  <div className="exploration-stage" ref={stage} data-testid="exploration-stage" data-position={JSON.stringify(position)} data-camera={JSON.stringify(camera)} data-width={size.width} data-height={size.height} data-mode={mode} data-goblin-visible={String(visionContains(vision,810,370))}
   onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={e=>e.preventDefault()} onWheel={e=>zoom(e.deltaY<0?1.14:1/1.14)}>
   <MiniatureLayer ref={layer} tokens={tokens} personalVision view={camera.view} tiltDegrees={camera.tilt} rotationDegrees={camera.rotation} width={size.width} height={size.height} onReady={reportReady} isVisibleAt={visibleAt} onVisionLights={lights} memoryTerrainCanvas={memoryCanvas} environmentPreview={settings}/>
   <PlayerVisionOverlay ref={cover} vision={vision} view={camera.view} tilt={camera.tilt} rotation={camera.rotation} width={size.width} height={size.height}
    terrain={{environment,explored:memory,tiles:[{url:image,x:0,y:0,w:W,h:H}],bounds:{x:0,y:0,w:W,h:H},grid:{size:64,x:0,y:0}}}/>
   <span className="token-label" style={{left:label.x,top:label.y+35*camera.view.scale}}>Druk</span>
   {ghostLabel&&<span className="distance" style={{left:ghostLabel.x,top:ghostLabel.y+20}}>{(Math.hypot(ghost!.x-live.current.x,ghost!.y-live.current.y)/px).toFixed(0)} ft</span>}
   {ready<2&&<div className="loading">Loading miniatures… {ready}/2<small>First load downloads the models. They are cached by your browser.</small></div>}
  </div>
  <nav aria-label="Camera and movement"><PreviewButton aria-pressed={mode==='move'} onPress={()=>setMode('move')}>Move</PreviewButton><PreviewButton aria-pressed={mode==='pan'} onPress={()=>setMode('pan')}>Pan</PreviewButton><PreviewButton aria-pressed={mode==='rotate'} onPress={()=>setMode('rotate')}>Rotate</PreviewButton>
   <PreviewButton aria-pressed={camera.tilt===0} onPress={()=>transition(centered(0))}>Overhead</PreviewButton><PreviewButton aria-pressed={camera.tilt===45} onPress={()=>transition(centered(45))}>45°</PreviewButton>
   <PreviewButton aria-label="Zoom out" onPress={()=>zoom(1/1.25)}>−</PreviewButton><PreviewButton aria-label="Zoom in" onPress={()=>zoom(1.25)}>+</PreviewButton><PreviewButton onPress={()=>transition(centered(camera.tilt,true))}>Fit map</PreviewButton><PreviewButton onPress={()=>transition(centered(camera.tilt))}>Follow Druk</PreviewButton></nav>
  <footer><p role="status">{notice}</p><details><summary>How to use</summary><p>In Move mode, tap a destination or drag Druk’s base and release. Walls stop movement; arch centers remain open. Switch to Pan to drag the view or Rotate to turn it. Pinch to zoom. Reset clears exploration and returns Druk to the start. Switching darkness preserves what you have explored.</p><p>This runs locally in your browser using the current app renderer, wall rules and darkness effects. It does not join or change a campaign. Reloading starts fresh.</p></details></footer>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
