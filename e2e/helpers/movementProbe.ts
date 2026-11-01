import type {Page} from '@playwright/test';
export async function probe(page:Page,role:string,rate:number,timing=false,blockWebgl=true,motionMetrics=false){
 await page.addInitScript(({role,rate,timing,blockWebgl,motionMetrics})=>{
  const w=window as any;const stamp=()=>performance.timeOrigin+performance.now();
  const p=w.__move={role,rate,throttled:false,phase:'Startup',webgl:0,longTasks:[],samples:[],active:null,watching:false,frames:[],resources:[]};
  if(timing){
   const frames=new Map<string,any>();
   w.__dndMovementTiming=(phase:string,at:number,data:any)=>{
    if(phase==='maskCommit'){const f=[...p.frames].reverse().find((f:any)=>f.maskKey===data.maskKey);if(f)f.maskCommitAt=at;return;}
    const key=`${data.id}:${data.revision}`;let f=frames.get(key);
    if(!f){f={id:data.id,revision:data.revision,images:{}};frames.set(key,f);p.frames.push(f);if(p.frames.length>128){const old=p.frames.shift();frames.delete(`${old.id}:${old.revision}`);}}
    if(phase==='imageStart'||phase==='imageReady'){const image=f.images[data.key]??(f.images[data.key]={});image[`${phase}At`]=at;}
    else{f[`${phase}At`]=at;if(data.server)f.server=data.server;if(data.maskKey)f.maskKey=data.maskKey;if(phase==='imagesPlanned')f.imageCounts={total:data.total,cached:data.cached,inflight:data.inflight};}
   };
   const send=WebSocket.prototype.send;
   WebSocket.prototype.send=function(data){
    if(typeof data==='string'&&data.startsWith('42')&&p.watching&&p.active){const at=data.indexOf('[');if(at>=0){try{const packet=JSON.parse(data.slice(at));if(packet[0]==='token:move'&&packet[1].tokenId===p.active.id){packet[1].performanceId=p.active.performanceId;p.active.moveSentAt=stamp();data=data.slice(0,at)+JSON.stringify(packet);}}catch{}}}
    return send.call(this,data);
   };
   performance.setResourceTimingBufferSize(4000);
   new PerformanceObserver(list=>{for(const e of list.getEntries() as PerformanceResourceTiming[]){if(!e.name.includes('/api/render/'))continue;p.resources.push({key:new URL(e.name).pathname.split('/').pop(),startAt:performance.timeOrigin+e.startTime,requestAt:performance.timeOrigin+e.requestStart,responseAt:performance.timeOrigin+e.responseStart,endAt:performance.timeOrigin+e.responseEnd,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize});if(p.resources.length>4000)p.resources.shift();}}).observe({type:'resource',buffered:true});
  }
  if(blockWebgl){const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:any[]){if(kind.includes('webgl')){p.webgl++;return null;}return (original as any).call(this,kind,...args);} as any;
  if(typeof OffscreenCanvas!=='undefined'){const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(this:OffscreenCanvas,kind:string,...args:any[]){if(kind.includes('webgl')){p.webgl++;return null;}return (get as any).call(this,kind,...args);} as any;}}
  new PerformanceObserver(list=>{for(const e of list.getEntries())p.longTasks.push({at:performance.timeOrigin+e.startTime,ms:e.duration,phase:p.phase});}).observe({entryTypes:['longtask']});
  const node=(id:string)=>w.Konva?.stages.flatMap((s:any)=>s.find('.token')).find((n:any)=>n.getAttr('tokenId')===id);
  const sight=()=>{
   if(motionMetrics){const el=document.querySelector('[data-testid=legacy-motion-mask] img')??document.querySelector('[data-testid=legacy-vision]'),index=el?.getAttribute('data-frame');
    if(index!=null)return Number(index)>0?`pose:${el?.getAttribute('src')??'svg'}:${index}`:p.active?.beforeSight;
   }
   return document.querySelector('[data-testid="legacy-vision"]')?.getAttribute('data-raster-key')||[...document.querySelectorAll('[data-testid="legacy-vision"] clipPath path')].map(n=>n.getAttribute('d')).join('|');
  };
  let watchedNode:any=null,watchedLayer:any=null,observed:Element|null=null;
  const tokenDrawn=()=>{
   const a=p.active;
   if(p.watching&&a&&(role==='DM'||a.observe||a.releasedAt)){
    const n=watchedNode;
    const art=n?.findOne('.token-art'),x=n?.x()+(art?.x()??0),y=n?.y()+(art?.y()??0);
    if(motionMetrics&&!a.firstMotionAt&&!a.motionPending&&n&&Math.hypot(x-a.from.x,y-a.from.y)>1){a.motionPending=true;a.firstMotionDrawAt=stamp();requestAnimationFrame(()=>requestAnimationFrame(()=>a.firstMotionAt=stamp()));}
    if(!a.tokenPaintAt&&!a.tokenPending&&n&&Math.abs(x-a.x)<4&&Math.abs(y-a.y)<4){a.tokenPending=true;a.tokenDrawAt=stamp();requestAnimationFrame(()=>requestAnimationFrame(()=>a.tokenPaintAt=stamp()));}
   }
  };
  const observer=new MutationObserver(()=>{const a=p.active;
   if(motionMetrics&&p.watching&&a&&(role==='DM'||a.observe||a.releasedAt)&&!a.visionPending&&document.querySelector('[data-testid=legacy-vision]')?.getAttribute('data-draw-count')!==a.beforeVisionDraw){a.visionPending=true;requestAnimationFrame(()=>requestAnimationFrame(()=>a.visionPaintAt=stamp()));}
   if(p.watching&&a&&(role==='DM'||a.observe||a.releasedAt)&&sight()!==a.beforeSight){const key=sight();if(key!==a.latestMaskKey){a.latestMaskKey=key;requestAnimationFrame(()=>requestAnimationFrame(()=>a.latestMaskPaintAt=stamp()));
   if(motionMetrics){const index=(document.querySelector('[data-testid=legacy-motion-mask] img')??document.querySelector('[data-testid=legacy-vision]'))?.getAttribute('data-frame');if(index!=null)a.maskPoses.push({at:stamp(),index:Number(index)});}
  }if(!a.sightPaintAt&&!a.sightPending){a.sightPending=true;a.maskMutationAt=stamp();a.sightFrameKey=key;requestAnimationFrame(()=>{a.firstRafAt=stamp();requestAnimationFrame(()=>a.sightPaintAt=stamp());});}}});
  p.start=()=>{p.watching=true;};
  p.stop=()=>{p.watching=false;};
  p.arm=(data:any)=>{watchedLayer?.off('draw.legacyMovementProbe');watchedNode=node(data.id);watchedLayer=watchedNode?.getLayer();watchedLayer?.on('draw.legacyMovementProbe',tokenDrawn);const el=document.querySelector('[data-testid="legacy-vision"]');if(el!==observed){observer.disconnect();if(el)observer.observe(el,{subtree:true,childList:true,attributes:true,attributeFilter:motionMetrics?['d','data-raster-key','data-frame','data-draw-count']:['d','data-raster-key']});observed=el;}const art=watchedNode?.findOne('.token-art');p.active={...data,...(motionMetrics?{from:{x:watchedNode.x()+(art?.x()??0),y:watchedNode.y()+(art?.y()??0)},maskPoses:[],beforeVisionDraw:el?.getAttribute('data-draw-count')}:{}),beforeSight:sight(),armedAt:stamp()};p.samples.push(p.active);};
  document.addEventListener('pointerup',e=>{if(e.button===0&&p.active&&role==='Player'&&(e.target as Element)?.closest('.konvajs-content'))p.active.releasedAt=stamp();},true);
  document.addEventListener('DOMContentLoaded',()=>{
   const el=document.createElement('div');el.id='movement-caption';el.style.cssText='position:fixed;bottom:12px;left:16px;z-index:99999;background:#111e;color:#ffe3a8;border:1px solid #b99453;border-radius:5px;padding:10px 14px;font:14px system-ui;pointer-events:none';document.body.append(el);
   p.label=(phase:string)=>{p.phase=phase;el.textContent=`${role} · Legacy · ${p.throttled?`CPU ${rate}×`:'Unthrottled setup'} · GPU disabled · ${phase}`;};p.label('143 tokens / 48 lights / 28 wall pieces');
  });
 },{role,rate,timing,blockWebgl,motionMetrics});
}
export const xy=(page:Page,id:string,x?:number,y?:number)=>page.evaluate(({id,x,y})=>{
 const stage=(window as any).Konva.stages.find((s:any)=>s.find('.token').length),n=stage.find('.token').find((n:any)=>n.getAttr('tokenId')===id),r=stage.getContent().getBoundingClientRect();
 const p=x===undefined?n.getAbsolutePosition():n.getParent().getAbsoluteTransform().point({x,y});return{x:r.left+p.x,y:r.top+p.y};
},{id,x,y});
