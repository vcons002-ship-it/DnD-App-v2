import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {resolveToken} from '../../shared/tokenDisplay.js';
import {COMBAT_ROLE_ICON} from '../../shared/combatRole.js';
import type {StateSnapshot} from '../../shared/types.js';
import {grantCachedAsset,rasterAsset} from './renderAssets.js';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const portraits=new Map<string,Promise<string|null>>();
const spritePairCache=new Map<string,NonNullable<StateSnapshot['tokenSprites']>[string]>();
/** Uploaded raster portraits only: no URL fetching, SVG scripts or filesystem traversal. */
async function portrait(url:string){
 if(!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(url))return null;
 let cached=portraits.get(url);if(cached)return cached;
 cached=(async()=>{try{
  const file=path.join(config.uploadsDir,url.slice('/uploads/'.length));
  const stat=await fs.stat(file);if(stat.size>32*1024*1024)return null;
  const buffer=await sharp(file,{limitInputPixels:40_000_000}).resize(384,384,{fit:'fill'}).png().toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
 }catch{return null;}})();
 if(portraits.size>=256)portraits.delete(portraits.keys().next().value!);
 portraits.set(url,cached);return cached;
}
const svg=(box:{x:number;y:number;width:number;height:number},content:string)=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${box.width}" height="${box.height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" font-family="Arial, Segoe UI Emoji, sans-serif">${content}</svg>`;
const text=(value:string,x:number,y:number,size:number,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" ${extra}>${escape(value)}</text>`;
const hasEmoji=(s:string)=>/[^\x00-\x7F]/.test(s);
/** Authorized snapshots are the sole source of sprites, including visible HP and death flags.
 * Body and upright HUD remain separate so local pan/rotation/selection require no round trip. */
export async function tokenSprites(id:string,snapshot:StateSnapshot,preShade=false):Promise<NonNullable<StateSnapshot['tokenSprites']>>{
 if(!snapshot.map||!snapshot.tokens.length)return {};
 const map=snapshot.map,result:NonNullable<StateSnapshot['tokenSprites']>={},px=map.gridSizePx/map.feetPerSquare;
 const entityIndex={characters:new Map(snapshot.characters.map(c=>[c.id,c])),monsters:new Map(snapshot.monsters.map(m=>[m.id,m]))};
 const affinitySet=snapshot.legacyGeometry?new Set(snapshot.legacyGeometry.affinity):undefined;
 // Bounded concurrency (4 tokens at a time) parallelizes cold rooms across the
 // worker pool without flooding the worker queue on 140+ token encounters.
 let cursor=0;
 const worker=async()=>{
  while(cursor<snapshot.tokens.length){
   const t=snapshot.tokens[cursor++];
   const d=resolveToken(snapshot,t,entityIndex),r=Math.max(1,Math.min(512,t.widthFt*px/2)),size=Math.ceil(Math.max(256,r*8));
   // Oversized tokens use the exact client fallback rather than allocating unbounded rasters.
   if(size>2048)continue;
   const affinityVisible=!!(d.disposition&&!t.sharedSightOnly&&(affinitySet?affinitySet.has(t.id):true));
   const grayscale=preShade&&!!t.sharedSightOnly&&!!snapshot.playerVision?.heavy&&map.explorationMode!=='revealed'&&(!d.icon||!!d.dead||!hasEmoji(d.icon));
   const hasHunterMark=!!(t.markLabels?.some(label=>/hunter.s mark/i.test(label))&&!t.sharedSightOnly);
   const cacheKey=`${px}:${map.gridSizePx}:${t.kind}:${t.widthFt}:${t.shape??'circle'}:${t.invisible?1:0}:${d.icon}:${d.name}:${d.curHp??''}:${d.maxHp??''}:${d.tempHp??''}:${d.dead?1:0}:${t.revealTag??''}:${affinityVisible?d.disposition:''}:${t.combatRole??''}:${hasHunterMark?1:0}:${grayscale?1:0}`;
   const cachedPair=spritePairCache.get(cacheKey);
   if(cachedPair&&grantCachedAsset(id,cachedPair.body)&&grantCachedAsset(id,cachedPair.hud)){
    spritePairCache.delete(cacheKey);spritePairCache.set(cacheKey,cachedPair);
    result[t.id]=cachedPair;
    continue;
   }
   const image=await portrait(d.icon);
   // Preserve external / bundled portraits through the existing client renderer.
   if((d.icon.startsWith('/')||d.icon.startsWith('http'))&&!image)continue;
   const fill=t.kind==='pc'?'#2d6cdf':'#b1432f',shape=t.shape??'circle';
   const silhouette=(attrs:string)=>shape==='square'||(shape==='image'&&image)?`<rect x="${-r}" y="${-r}" width="${r*2}" height="${r*2}" ${attrs}/>`:shape==='diamond'?`<path d="M0 ${-r*1.3}L${r*1.3} 0L0 ${r*1.3}L${-r*1.3} 0Z" ${attrs}/>`:shape==='triangle'?`<path d="M0 ${-r}L${r*.87} ${r*.5}L${-r*.87} ${r*.5}Z" ${attrs}/>`:`<circle r="${r}" ${attrs}/>`;
   const opacity=t.invisible?.28:d.dead?.5:1;
   const clip=shape==='square'?`<rect x="${-r}" y="${-r}" width="${2*r}" height="${2*r}"/>`:shape==='diamond'?`<path d="M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z"/>`:silhouette('');
   const body=image?`<defs><clipPath id="p">${clip}</clipPath></defs><image xlink:href="${image}" x="${-r}" y="${-r}" width="${r*2}" height="${r*2}" opacity="${opacity}" ${shape==='image'?'':'clip-path="url(#p)"'}/>${shape==='image'?'':silhouette('fill="none" stroke="#111111" stroke-opacity=".53" stroke-width="2"')}`:`${silhouette(`fill="${fill}" opacity="${opacity}" stroke="#111111" stroke-opacity=".53" stroke-width="2"`)}${d.icon&&!d.dead&&!hasEmoji(d.icon)?text(d.icon,0,r*.36,r*1.1):''}`;
   const font=t.kind==='pc'?Math.max(11,Math.min(18,r*.4)):Math.max(10,Math.min(14,map.gridSizePx*.14));
   const roleR=Math.max(11,r*.36),hasHp=d.maxHp&&d.maxHp>0&&d.curHp!==undefined;
   const labelY=t.kind==='pc'?r+4:r+Math.max(hasHp?14:4,t.combatRole?roleR-r*.28+4:4);
   const labelWidth=t.kind==='pc'?r*4:Math.max(64,Math.min(130,r*2.6));
   const chars=Math.max(3,Math.floor(labelWidth/(font*.55)));
   const words=d.name.split(/\s+/);const lines:string[]=[];
   if(t.kind==='pc'){let line='';for(const word of words){if(line&&(line+' '+word).length>chars){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);}
   else lines.push(d.name.length>chars?d.name.slice(0,chars-1)+'…':d.name);
   const tag=t.revealTag??'',tagW=tag?(tag.length+2)*font*.65:0,nameW=Math.min(labelWidth,d.name.length*font*.55+2);
   let hud=d.dead?'':lines.map((line,i)=>text(line,t.kind==='pc'?0:-tagW/2,labelY+font*(.85+i*1.1),font,'fill="white" stroke="black" stroke-width="3" paint-order="stroke" stroke-linejoin="round"')).join('');
   if(!d.dead&&hasHp){const frac=Math.max(0,Math.min(1,d.curHp!/d.maxHp!)),y=r+(t.kind==='pc'?font+8:4);hud+=`<rect x="${-r}" y="${y}" width="${2*r}" height="6" rx="3" fill="black" fill-opacity=".53"/><rect x="${-r}" y="${y}" width="${2*r*frac}" height="6" rx="3" fill="${frac>.5?'#39c46b':frac>.25?'#f5c518':'#e23b3b'}"/>`;if(d.tempHp)hud+=text(`+${d.tempHp}`,r+3+String(d.tempHp).length*3,y+9,Math.max(10,r*.4),'fill="#5ce1ff" font-weight="bold"');}
   if(!d.dead&&tag)hud+=text(tag,(nameW+tagW)/2,labelY+font*.85,font,'fill="white" stroke="black" stroke-width="3" paint-order="stroke" font-weight="bold"');
   if(affinityVisible)hud+=`<circle cx="${-r*.8}" cy="${-r*.8}" r="${Math.max(5,r*.16)}" fill="${{friendly:'#39c46b',neutral:'#f5c518',enemy:'#e23b3b'}[d.disposition!]}" stroke="black"/>`;
   if(!d.dead&&t.kind!=='pc'&&t.combatRole)hud+=`<g transform="translate(${-r*.72} ${r*.72})"><circle r="${roleR}" fill="#0b0d12" stroke="white" stroke-width="1.5"/></g>`;

   if(hasHunterMark)hud+=`<g transform="translate(0 ${-r-22})"><path d="M0 -14L14 0L0 14L-14 0Z" fill="#352106" stroke="#ffe7a1" stroke-width="2"/><circle r="4" fill="#fff5d2"/></g>`;
   const edge=Math.ceil(r*1.3+4),hudEdge=Math.ceil(Math.max(r*2+20,nameW/2+tagW+16)),top=Math.ceil(r+52),bottom=Math.ceil(labelY+font*(lines.length+1)+24);
   const bodyBox={x:-edge,y:-edge,width:edge*2,height:edge*2,scale:1};
   const hudBox={x:-hudEdge,y:-top,width:hudEdge*2,height:top+bottom,scale:1};
   // Match the client's shared-sight grayscale transform once per reusable sprite,
   // rather than allocating/filtering a separate canvas for every shared token.
   const bodyArt=grayscale?`<defs><filter id="dark" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=" .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/></filter></defs><g filter="url(#dark)">${body}</g>`:body;
   const [bodyAsset,hudAsset]=await Promise.all([rasterAsset(id,svg(bodyBox,bodyArt),bodyBox),rasterAsset(id,svg(hudBox,hud),hudBox)]);
   const pair={body:bodyAsset,hud:hudAsset,...(grayscale?{grayscale:true}:{})};
   if(spritePairCache.size>=2048)spritePairCache.delete(spritePairCache.keys().next().value!);
   spritePairCache.set(cacheKey,pair);
   result[t.id]=pair;
  }
 };
 await Promise.all(Array.from({length:Math.min(4,snapshot.tokens.length)},()=>worker()));
 return result;
}
