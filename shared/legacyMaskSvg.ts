import type {LegacyGeometry} from './legacyVision.js';
/** Clip global sight rays to the image to keep SVG coordinates and paths bounded. */
const boundedCache=new Map<string,string[]>();
function clipRingRect(ring:[number,number][],minX:number,minY:number,maxX:number,maxY:number):[number,number][]{
 let pts=ring.length>1&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1]?ring.slice(0,-1):ring;
 const clipEdge=(inside:(p:[number,number])=>boolean,intersect:(a:[number,number],b:[number,number])=>[number,number])=>{
  if(!pts.length)return;
  const out:[number,number][]=[];
  let prev=pts[pts.length-1],prevIn=inside(prev);
  for(let i=0;i<pts.length;i++){
   const curr=pts[i],currIn=inside(curr);
   if(currIn){if(!prevIn)out.push(intersect(prev,curr));out.push(curr);}
   else if(prevIn)out.push(intersect(prev,curr));
   prev=curr;prevIn=currIn;
  }
  pts=out;
 };
 clipEdge(p=>p[0]>=minX,(a,b)=>[minX,a[1]+(b[1]-a[1])*(minX-a[0])/(b[0]-a[0])]);
 clipEdge(p=>p[0]<=maxX,(a,b)=>[maxX,a[1]+(b[1]-a[1])*(maxX-a[0])/(b[0]-a[0])]);
 clipEdge(p=>p[1]>=minY,(a,b)=>[a[0]+(b[0]-a[0])*(minY-a[1])/(b[1]-a[1]),minY]);
 clipEdge(p=>p[1]<=maxY,(a,b)=>[a[0]+(b[0]-a[0])*(maxY-a[1])/(b[1]-a[1]),maxY]);
 return pts;
}
function boundedPaths(paths:string[],o:{width:number;height:number;x:number;y:number;scale:number}){
 const x=o.x,y=o.y,r=x+o.width/o.scale,b=y+o.height/o.scale;
 return paths.flatMap(path=>{
  const cacheKey=`${x},${y},${r},${b}:${path}`,hit=boundedCache.get(cacheKey);if(hit)return hit;
  const rings=(path.match(/M[^Z]+Z/g)??[]).map(r=>[...r.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(p=>[Number(p[1]),Number(p[2])] as [number,number]));
  // Hand-authored/compatibility paths may use H/V commands rather than the
  // generated Mx,yLx,y form. Leave those small paths to the SVG renderer.
  if(!rings.length||rings.some(r=>r.length<3))return [path];
  let clipped:string[];
  if(rings.every(ring=>ring.every(([px,py])=>px>=x&&px<=r&&py>=y&&py<=b)))clipped=[path];
  else{
   const joined=rings.map(ring=>clipRingRect(ring,x,y,r,b)).filter(ring=>ring.length>=3).map(ring=>'M'+ring.map(([px,py])=>`${px.toFixed(2)},${py.toFixed(2)}`).join('L')+'Z').join('');
   clipped=joined?[joined]:[];
  }
  if(boundedCache.size>=1024)boundedCache.delete(boundedCache.keys().next().value!);
  boundedCache.set(cacheKey,clipped);return clipped;
 });
}
/** Same compositing rules as LegacyVisionOverlay, painted once by the server. */
export function legacyMaskSvg(g:LegacyGeometry,options:{width:number;height:number;x:number;y:number;scale:number;wallFog:boolean;heavy:boolean;daylight:boolean;keepRevealed:boolean;graded?:boolean}){
 const {width:w,height:h,x,y,scale:k,wallFog,heavy,daylight,keepRevealed}=options;
 const paths=(a:string[])=>a.map(d=>`<path d="${d}" fill-rule="evenodd"/>`).join('');
 const transform=`translate(${-x*k} ${-y*k}) scale(${k})`,sight=boundedPaths(g.sight,options),memory=boundedPaths(g.memory,options),lights=boundedPaths(g.lights,options),near=heavy?boundedPaths(g.near,options):[];
 const dimFill=daylight?'black':options.graded?'#141414':heavy?'#999999':'#4d4d4d';
 const vis=!wallFog&&!heavy?`<rect width="100%" height="100%" fill="${dimFill}"/><g transform="${transform}" fill="black">${paths(lights)}</g>`:heavy?`<g transform="${transform}" fill="${dimFill}">${paths(near)}</g><g ${wallFog?'clip-path="url(#s)"':''}><g transform="${transform}" fill="black">${paths(lights)}</g></g>`:`<g transform="${transform}" fill="${dimFill}">${paths(sight)}</g>${daylight?'':`<g ${wallFog?'clip-path="url(#s)"':''}><g transform="${transform}" fill="black">${paths(lights)}</g></g>`}`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><clipPath id="s" transform="${transform}">${paths(sight)}</clipPath><mask id="c" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/><g transform="${transform}" fill="${keepRevealed?'black':options.graded?'#ccc':'#aaa'}">${paths(memory)}</g>${vis}</mask></defs><rect width="100%" height="100%" fill="#050608" mask="url(#c)"/></svg>`;
}

/** Alpha-only illumination mask for server grading of map artwork. */
export function legacyLightSvg(g:LegacyGeometry,o:{width:number;height:number;x:number;y:number;scale:number;wallFog:boolean;daylight:boolean}){
 const paths=(a:string[])=>a.map(d=>`<path d="${d}" fill-rule="evenodd"/>`).join(''),transform=`translate(${-o.x*o.scale} ${-o.y*o.scale}) scale(${o.scale})`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}"><defs><clipPath id="s" transform="${transform}">${paths(boundedPaths(g.sight,o))}</clipPath></defs>${o.daylight?'<rect width="100%" height="100%" fill="white"/>':`<g ${o.wallFog?'clip-path="url(#s)"':''}><g fill="white" transform="${transform}">${paths(boundedPaths(g.lights,o))}</g></g>`}</svg>`;
}
