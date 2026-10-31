import type {LegacyGeometry} from './legacyVision.js';
import {legacyPath} from './legacyVision.js';
import type {PlayerVision} from './playerVision.js';
import {lightCoverage} from './playerVision.js';
import {SIGHT_EXTENT} from './mapWalls.js';
import type {RasterAsset} from './serverRendering.js';

/** Three opaque grayscale panels: current coverage, remembered coverage, near
 * darkvision. Colors remain a client concern. Coordinates are map-space. */
export function separatedVisionSvg(g:LegacyGeometry,v:PlayerVision,b:Omit<RasterAsset,'key'>,wallFog:boolean,retained:boolean){
 const {width:w,height:h,x,y,scale}=b;
 const paths=(a:string[])=>a.map(d=>`<path d="${d}" fill-rule="evenodd"/>`).join('');
 const circle=(p:{x:number;y:number},r:number)=>`<circle cx="${p.x}" cy="${p.y}" r="${r}"/>`;
 const outline=(p:{id:string;x:number;y:number},r:number)=>{
  const shape=g.outlines?.shapes[`${p.id}:${r}`];
  if(!shape||shape.x!==p.x||shape.y!==p.y)throw Error('Separated masks require matching server outlines');
  return `<path d="${legacyPath(shape.points)}"/>`;
 };
 const origin=(radius:number)=>v.origins.map(p=>wallFog?outline(p,radius):circle(p,radius)).join('');
 const sight=origin(SIGHT_EXTENT),range=v.origins.map(p=>circle(p,v.radius)).join('');
 const lamps=v.lights.filter(l=>!l.transient).map((l,i)=>{
  let previous=0;const bands:string[]=[];
  for(let n=48;n>=1;n--){const coverage=lightCoverage(l.radius*n/32-l.radius/64,l),alpha=Math.max(0,(coverage-previous)/Math.max(.00001,1-previous));previous=coverage;
   if(alpha>.0001)bands.push(`<circle cx="${l.x}" cy="${l.y}" r="${l.radius*n/32}" fill-opacity="${alpha.toFixed(4)}"/>`);
  }
  return `<defs><clipPath id="lamp-${i}">${outline(l,SIGHT_EXTENT)}</clipPath></defs><g clip-path="url(#lamp-${i})">${bands.join('')}</g>`;
 }).join('');
 const transform=`translate(${-x*scale} ${-y*scale}) scale(${scale})`;
 const panel=(i:number,content:string)=>`<svg x="${i*w}" width="${w}" height="${h}" overflow="hidden"><rect width="100%" height="100%" fill="black"/><g transform="${transform}" fill="white">${content}</g></svg>`;
 const visible=`${origin(v.heavy?v.radius:SIGHT_EXTENT)}<g clip-path="url(#sight)">${lamps}</g>`;
 const memory=retained&&v.heavy?`<g clip-path="url(#range)">${paths(g.memory)}</g>`:paths(g.memory);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w*3}" height="${h}"><defs><clipPath id="sight">${sight}</clipPath><clipPath id="range">${range}</clipPath></defs>${panel(0,visible)}${panel(1,memory)}${panel(2,!v.daylight&&!v.heavy?origin(v.radius):'')}</svg>`;
}
