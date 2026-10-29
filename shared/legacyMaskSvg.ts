import type {LegacyGeometry} from './legacyVision.js';
import clipping from 'polygon-clipping';
/** Clip global sight rays to the image to keep SVG coordinates and paths bounded. */
const boundedCache=new Map<string,string[]>();
function boundedPaths(paths:string[],o:{width:number;height:number;x:number;y:number;scale:number}){
 const x=o.x,y=o.y,r=x+o.width/o.scale,b=y+o.height/o.scale;
 const box:clipping.Polygon=[[[x,y],[r,y],[r,b],[x,b],[x,y]]];
 return paths.flatMap(path=>{
  const cacheKey=`${x},${y},${r},${b}:${path}`,hit=boundedCache.get(cacheKey);if(hit)return hit;
  const rings=(path.match(/M[^Z]+Z/g)??[]).map(r=>[...r.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(p=>[Number(p[1]),Number(p[2])] as [number,number]));
  // Hand-authored/compatibility paths may use H/V commands rather than the
  // generated Mx,yLx,y form. Leave those small paths to the SVG renderer.
  if(!rings.length||rings.some(r=>r.length<3))return [path];
  const clipped=rings.every(ring=>ring.every(([px,py])=>px>=x&&px<=r&&py>=y&&py<=b))?[path]:clipping.intersection(rings,box).map(p=>p.map(r=>'M'+r.map(([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`).join('L')+'Z').join(''));
  if(boundedCache.size>=1024)boundedCache.delete(boundedCache.keys().next().value!);
  boundedCache.set(cacheKey,clipped);return clipped;
 });
}
/** Same compositing rules as LegacyVisionOverlay, painted once by the server. */
export function legacyMaskSvg(g:LegacyGeometry,options:{width:number;height:number;x:number;y:number;scale:number;wallFog:boolean;heavy:boolean;daylight:boolean;keepRevealed:boolean;graded?:boolean}){
 const {width:w,height:h,x,y,scale:k,wallFog,heavy,daylight,keepRevealed}=options;
 const paths=(a:string[])=>a.map(d=>`<path d="${d}" fill-rule="evenodd"/>`).join('');
 const transform=`translate(${-x*k} ${-y*k}) scale(${k})`,sight=boundedPaths(g.sight,options),memory=boundedPaths(g.memory,options);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>
 <clipPath id="s" transform="${transform}">${paths(sight)}</clipPath>
 <mask id="l" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/><g transform="${transform}" fill="black">${paths(g.lights)}</g></mask>
 <g id="v">${!wallFog&&!heavy?'<rect width="100%" height="100%"/>':heavy?`<g transform="${transform}">${paths(g.near)}</g><g ${wallFog?'clip-path="url(#s)"':''}><g transform="${transform}">${paths(g.lights)}</g></g>`:`<g transform="${transform}">${paths(sight)}</g>`}</g>
 <mask id="c" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/><g transform="${transform}" fill="${keepRevealed?'black':options.graded?'#ccc':'#aaa'}">${paths(memory)}</g><use href="#v" fill="black"/></mask></defs>
 <rect width="100%" height="100%" fill="#050608" mask="url(#c)"/>
 ${daylight?'':`<g ${wallFog?'clip-path="url(#s)"':''}><rect width="100%" height="100%" fill="black" opacity="${options.graded?.08:heavy?.6:.3}" mask="url(#l)"/></g>`}</svg>`;
}

/** Alpha-only illumination mask for server grading of map artwork. */
export function legacyLightSvg(g:LegacyGeometry,o:{width:number;height:number;x:number;y:number;scale:number;wallFog:boolean;daylight:boolean}){
 const paths=(a:string[])=>a.map(d=>`<path d="${d}" fill-rule="evenodd"/>`).join(''),transform=`translate(${-o.x*o.scale} ${-o.y*o.scale}) scale(${o.scale})`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}"><defs><clipPath id="s" transform="${transform}">${paths(boundedPaths(g.sight,o))}</clipPath></defs>${o.daylight?'<rect width="100%" height="100%" fill="white"/>':`<g ${o.wallFog?'clip-path="url(#s)"':''}><g fill="white" transform="${transform}">${paths(g.lights)}</g></g>`}</svg>`;
}
