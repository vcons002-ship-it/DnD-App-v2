import {LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import {forwardRef,useId,useImperativeHandle,useLayoutEffect,useRef} from 'react';
import {lightCoverage,type VisionLight,type PlayerVision} from '../../../shared/playerVision';
import {groundYScale,perspectiveSlope,type BattlefieldView} from './miniatureProjection';
type Camera={view:BattlefieldView;tilt:number;rotation:number;width:number;height:number};
export type PlayerVisionHandle={lights:(lights:VisionLight[])=>void;camera:(c:Partial<Camera>)=>void;move:(id:string,x:number,y:number)=>void};
/** A screen-space mask above BOTH renderers. Never disabled by effect quality. */
export const PlayerVisionOverlay=forwardRef<PlayerVisionHandle,Camera&{vision:PlayerVision}>(function PlayerVisionOverlay(props,ref){
 const filterId='darkvision-detail-'+useId().replace(/:/g,'');
 const shade=useRef<HTMLDivElement>(null),cover=useRef<HTMLDivElement>(null);
 const state=useRef(props);const live=useRef(new Map<string,{x:number;y:number}>());
 const renderedLights=useRef<VisionLight[]|null>(null);
 const draw=(lightOnly=false)=>{
  if(!shade.current||!cover.current)return;
  const {vision,view,tilt,rotation,width,height}=state.current;
  const sy=groundYScale(tilt),a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),k=perspectiveSlope(width,height,tilt);
  const path=(point:{id:string;x:number;y:number},radius:number,actual=false)=>{
   const p=actual?point:live.current.get(point.id)??point;
   let poly=Array.from({length:96},(_,i)=>{const t=i*Math.PI/48;
    const dx=view.x+(p.x+Math.cos(t)*radius)*view.scale-width/2;
    const dy=view.y+(p.y+Math.sin(t)*radius)*view.scale*sy-height/2;
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
  const mask=(shapes:string)=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><mask id="m"><rect width="100%" height="100%" fill="white"/>${shapes}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#m)"/></svg>`)}")`;
  if(!lightOnly)cover.current.style.maskImage=mask(circles);
  shade.current.style.maskImage=mask(lights);
  shade.current.style.backdropFilter=vision.heavy?`url("#${filterId}")`:'none';
  shade.current.style.setProperty('-webkit-backdrop-filter',vision.heavy?`url("#${filterId}")`:'none');
 };
 useImperativeHandle(ref,()=>({lights(next){renderedLights.current=next;draw(true);},camera(next){state.current={...state.current,...next};draw();},move(id,x,y){if(!state.current.vision.origins.some(o=>o.id===id)&&!state.current.vision.lights.some(l=>l.id===id))return;live.current.set(id,{x,y});draw();}}),[]);
 useLayoutEffect(()=>{state.current=props;renderedLights.current=null;
  for(const [id,p] of live.current){const next=props.vision.origins.find(o=>o.id===id)??props.vision.lights.find(o=>o.id===id);if(!next||(next.x===p.x&&next.y===p.y))live.current.delete(id);}
  draw();},[props]);
 return <div data-testid="player-vision" data-range-ft={props.vision.rangeFt} data-heavy={String(props.vision.heavy)} data-origin-count={props.vision.origins.length}
  style={{position:'absolute',inset:0,zIndex:2,pointerEvents:'none',overflow:'hidden'}}>
  <svg aria-hidden="true" width="0" height="0" style={{position:'absolute'}}><defs>
   <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
    <feColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray"/>
    <feGaussianBlur in="gray" stdDeviation="0.65" result="softDetail"/>
    <feConvolveMatrix in="softDetail" order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" divisor="1" bias="0" preserveAlpha="true" result="edges"/>
    <feComponentTransfer in="edges" result="faintEdges">
     <feFuncR type="linear" slope="3"/><feFuncG type="linear" slope="3"/><feFuncB type="linear" slope="3"/>
    </feComponentTransfer>
    <feComposite in="faintEdges" in2="gray" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
   </filter>
  </defs></svg>
  <div ref={shade} style={{position:'absolute',inset:0}}/>
  <div ref={cover} style={{position:'absolute',inset:0,background:'#050608'}}/>
 </div>;
});
