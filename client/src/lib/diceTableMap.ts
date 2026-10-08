import * as THREE from 'three';
import type {StateSnapshot} from '../../../shared/types';
import {wallVisibilityPolygon} from '../../../shared/mapWalls';
import {fogVisionContains,lightCoverage,usesMapVision,usesTokenVision} from '../../../shared/playerVision';
import {tokenVisibleAt} from '../../../shared/fog';

const images=new Map<string,Promise<HTMLImageElement|null>>();
function image(url:string){
 let pending=images.get(url);
 if(!pending){pending=new Promise<HTMLImageElement|null>(resolve=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=url;});images.set(url,pending);}
 return pending;
}

/** A small map on the table, built only from this viewer's role-shaped snapshot.
 * No second renderer, model downloads, or full-resolution screenshot readback. */
export function createDiceTableMap(){
 const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=900;
 const ctx=canvas.getContext('2d')!,texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 let revision=0,disposed=false;
 ctx.fillStyle='#080b0c';ctx.fillRect(0,0,1400,900);
 return {texture,
  update(snapshot:StateSnapshot,viewerId?:string){
   const generation=++revision,map=snapshot.map;
   void (async()=>{
    const tiles=snapshot.mapImages;
    const urls=[...(map?.imagePath?[map.imagePath]:[]),...tiles.map(t=>t.imagePath)];
    const loaded=await Promise.all(urls.map(image));if(disposed||generation!==revision)return;
    const base=map?.imagePath?loaded[0]:null;
    const x0=Math.min(0,...tiles.map(t=>t.x)),y0=Math.min(0,...tiles.map(t=>t.y));
    const w=Math.max(base?.naturalWidth??0,...tiles.map(t=>t.x+t.w))-x0||1200;
    const h=Math.max(base?.naturalHeight??0,...tiles.map(t=>t.y+t.h))-y0||700;
    const scale=Math.min(1360/w,860/h),ox=(1400-w*scale)/2,oy=(900-h*scale)/2;
    const terrain=document.createElement('canvas');terrain.width=1400;terrain.height=900;const paint=terrain.getContext('2d')!;
    paint.fillStyle='#20282b';paint.fillRect(0,0,1400,900);paint.translate(ox-x0*scale,oy-y0*scale);paint.scale(scale,scale);
    if(base)paint.drawImage(base,0,0);
    tiles.forEach((t,i)=>{const img=loaded[i+(map?.imagePath?1:0)];if(img)paint.drawImage(img,t.x,t.y,t.w,t.h);});
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#090c0e';ctx.fillRect(0,0,1400,900);
    const vision=snapshot.role==='player'?snapshot.playerVision:undefined;
    const transform=()=>{ctx.translate(ox-x0*scale,oy-y0*scale);ctx.scale(scale,scale);};
    const terrainCopy=()=>{ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(terrain,0,0);};
    if(vision&&(usesMapVision(map)||vision.heavy)){
     if(snapshot.exploredTerrain?.length){ctx.save();transform();ctx.beginPath();for(const polygon of snapshot.exploredTerrain)for(const ring of polygon){ring.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}ctx.clip('evenodd');ctx.filter='grayscale(1) brightness(.32)';terrainCopy();ctx.restore();}
     ctx.save();transform();ctx.beginPath();
     const walls=usesMapVision(map)?vision.walls??[]:[];
     for(const origin of vision.origins){const points=wallVisibilityPolygon(origin,walls,Math.hypot(w,h)*2);points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}ctx.clip();
     if(vision.heavy){ctx.beginPath();for(const origin of vision.origins){ctx.moveTo(origin.x+vision.radius,origin.y);ctx.arc(origin.x,origin.y,vision.radius,0,Math.PI*2);}for(const light of vision.lights){let low=0,high=light.radius*2;for(let i=0;i<20;i++){const mid=(low+high)/2;if(lightCoverage(mid,light)>.10)low=mid;else high=mid;}if(low<=0)continue;const points=wallVisibilityPolygon(light,vision.walls??[],low);points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}ctx.clip();}
     terrainCopy();ctx.restore();
    }else ctx.drawImage(terrain,0,0);
    ctx.save();transform();
    if(snapshot.role==='player'&&map?.mapFogEnabled){const revealed=new Set(map.mapFogRevealed),g=map.gridSizePx;ctx.fillStyle='#050608';for(let y=Math.floor(y0/g);y<Math.ceil((y0+h)/g);y++)for(let x=Math.floor(x0/g);x<Math.ceil((x0+w)/g);x++)if(!revealed.has(`${x},${y}`))ctx.fillRect(x*g,y*g,g,g);}
    const mapFog=map?.mapFogEnabled?new Set(map.mapFogRevealed):null,tokenFog=map?.tokenFogEnabled?new Set(map.tokenFogRevealed):null;
    for(const t of snapshot.tokens){
     const character=t.kind==='pc'?snapshot.characters.find(c=>c.id===t.refId):undefined;
     const owned=!!viewerId&&character?.claimedBy===viewerId;
     if(!tokenVisibleAt({role:snapshot.role,hidden:t.isHidden,owned,foe:t.kind==='monster',mapFog,tokenFog,grid:map?.gridSizePx??50,x:t.x,y:t.y}))continue;
     if(!t.sharedSightOnly&&!owned&&vision&&!fogVisionContains(vision,t.x,t.y,usesTokenVision(map)))continue;
     const r=Math.max(7/scale,t.widthFt*(map?.gridSizePx??50)/(map?.feetPerSquare??5)/2);
     ctx.beginPath();ctx.arc(t.x,t.y,r,0,Math.PI*2);ctx.fillStyle=t.sharedSightOnly?'#8d9299':t.kind==='pc'?'#253f32':'#592f37';ctx.fill();ctx.strokeStyle=t.sharedSightOnly?'#c1c5cc':t.kind==='pc'?'#87c9a1':'#e39988';ctx.lineWidth=2/scale;ctx.stroke();
     const name=character?.name??snapshot.monsters.find(m=>m.id===t.refId)?.name??'?';ctx.fillStyle='#fff3d4';ctx.font=`bold ${Math.max(10/scale,r*1.1)}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name.slice(0,1),t.x,t.y);
    }
    ctx.restore();ctx.strokeStyle='#ad8751';ctx.lineWidth=5;ctx.strokeRect(4,4,1392,892);texture.needsUpdate=true;
   })();
  },
  dispose(){disposed=true;revision++;},
 };
}
