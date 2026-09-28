import {LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import {forwardRef,useEffect,useId,useImperativeHandle,useLayoutEffect,useRef} from 'react';
import {lightCoverage,type VisionLight,type PlayerVision} from '../../../shared/playerVision';
import {groundYScale,perspectiveSlope,type BattlefieldView} from './miniatureProjection';
type Camera={view:BattlefieldView;tilt:number;rotation:number;width:number;height:number};
const circleVertices=Array.from({length:96},(_,i)=>({x:Math.cos(i*Math.PI/48),y:Math.sin(i*Math.PI/48)}));
export type PlayerVisionHandle={lights:(lights:VisionLight[])=>void;camera:(c:Partial<Camera>)=>void;move:(id:string,x:number,y:number)=>void};
/** A screen-space mask above BOTH renderers. Never disabled by effect quality. */
export const PlayerVisionOverlay=forwardRef<PlayerVisionHandle,Camera&{vision:PlayerVision}>(function PlayerVisionOverlay(props,ref){
 const shade=useRef<HTMLDivElement>(null);
 const lightPaths=useRef<SVGGElement>(null),originPaths=useRef<SVGGElement>(null);
 const id=useId().replace(/:/g,'');
 const lightId=`vision-lights-${id}`,shadeId=`vision-shade-${id}`,coverId=`vision-cover-${id}`;
 const state=useRef(props);const live=useRef(new Map<string,{x:number;y:number}>());
 const renderedLights=useRef<VisionLight[]|null>(null);
 const pendingDraw=useRef(0);
 const draw=()=>{
  if(!shade.current||!lightPaths.current||!originPaths.current)return;
  const {vision,view,tilt,rotation,width,height}=state.current;
  const sy=groundYScale(tilt),a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),k=perspectiveSlope(width,height,tilt);
  const path=(point:{id:string;x:number;y:number},radius:number,actual=false)=>{
   const p=actual?point:live.current.get(point.id)??point;
   let poly=circleVertices.map(vertex=>{
    const dx=view.x+(p.x+vertex.x*radius)*view.scale-width/2;
    const dy=view.y+(p.y+vertex.y*radius)*view.scale*sy-height/2;
    const x=c*dx-s*dy/sy,y=s*dx*sy+c*dy;return {x,y,w:1-y*k};});
   // Clip behind-camera vertices before perspective division, including deep zoom.
   const clipped:typeof poly=[];
   for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],pin=p.w>=.01,qin=q.w>=.01;
    if(pin)clipped.push(p);if(pin!==qin){const t=(.01-p.w)/(q.w-p.w);clipped.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,w:.01});}}
   poly=clipped;
   return poly.length?'M'+poly.map(p=>`${(width/2+p.x/p.w).toFixed(2)},${(height/2+p.y/p.w).toFixed(2)}`).join('L')+'Z':'';
  };
  const circles=vision.origins.map(o=>`<path fill="black" d="${path(o,vision.radius)}"/>`).join('');
  // Nested bands sample the renderer's smooth attenuation, including source height,
  // intensity, flicker radius and the actual animated hip anchor. No hard color disk.
  const lights=(renderedLights.current??vision.lights).map(l=>{
   let previous=0;const bands:string[]=[];
   for(let i=48;i>=1;i--){const radius=l.radius*LIGHT_SPILL_MULTIPLIER*i/48;
    const coverage=lightCoverage(radius-l.radius/64,l);
    const alpha=Math.max(0,(coverage-previous)/Math.max(.00001,1-previous));previous=coverage;
    if(alpha>.0001)bands.push(`<path fill="black" fill-opacity="${alpha.toFixed(4)}" d="${path(l,radius,!!renderedLights.current)}"/>`);
   }return bands.join('');
  }).join('');
  // Keep the SVG mask in the DOM and share light geometry between both masks.
  // Encoding/decoding two large SVG image URLs per frame caused mobile stalls.
  originPaths.current.innerHTML=circles;
  lightPaths.current.innerHTML=lights;
  shade.current.style.backdropFilter=vision.heavy?'grayscale(1)':'none';
  shade.current.style.setProperty('-webkit-backdrop-filter',vision.heavy?'grayscale(1)':'none');
 };
 // Movement, camera following and flickering lights can all update in one
 // frame. Rebuild the SVG masks once using the final state, not for every event.
 const schedule=()=>{if(!pendingDraw.current)pendingDraw.current=requestAnimationFrame(()=>{pendingDraw.current=0;draw();});};
 useEffect(()=>()=>cancelAnimationFrame(pendingDraw.current),[]);
 useImperativeHandle(ref,()=>({lights(next){renderedLights.current=next;schedule();},camera(next){state.current={...state.current,...next};schedule();},move(id,x,y){if(!state.current.vision.origins.some(o=>o.id===id)&&!state.current.vision.lights.some(l=>l.id===id))return;live.current.set(id,{x,y});schedule();}}),[]);
 useLayoutEffect(()=>{state.current=props;renderedLights.current=null;
  for(const [id,p] of live.current){const next=props.vision.origins.find(o=>o.id===id)??props.vision.lights.find(o=>o.id===id);if(!next||(next.x===p.x&&next.y===p.y))live.current.delete(id);}
  schedule();},[props]);
 return <div data-testid="player-vision" data-range-ft={props.vision.rangeFt} data-heavy={String(props.vision.heavy)} data-origin-count={props.vision.origins.length}
  style={{position:'absolute',inset:0,zIndex:2,pointerEvents:'none',overflow:'hidden'}}>
  <svg width={props.width} height={props.height} style={{position:'absolute',inset:0}} aria-hidden="true"><defs>
   <g id={lightId} ref={lightPaths}/>
   <mask id={shadeId} maskUnits="userSpaceOnUse" x="0" y="0" width={props.width} height={props.height}>
    <rect width={props.width} height={props.height} fill="white"/><use href={`#${lightId}`}/>
   </mask>
   <mask id={coverId} maskUnits="userSpaceOnUse" x="0" y="0" width={props.width} height={props.height}>
    <rect width={props.width} height={props.height} fill="white"/><g ref={originPaths}/>{props.vision.origins.length>0&&<use href={`#${lightId}`}/>}
   </mask>
  </defs></svg>
  <div ref={shade} style={{position:'absolute',inset:0,maskImage:`url(#${shadeId})`}}/>
  <div style={{position:'absolute',inset:0,background:'#050608',maskImage:`url(#${coverId})`}}/>
 </div>;
});
