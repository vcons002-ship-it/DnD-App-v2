import {it,expect} from 'vitest';
import sharp from 'sharp';
import {wallsFromYellowMask} from './wallMask.js';
import {hasLineOfSight,stopAtWalls} from '../../shared/mapWalls.js';

it('keeps a confirmed thin cave boundary continuous over firelight without importing the flame or sealing the entrance',async()=>{
 const width=1200,height=800,grid=48;
 const art='<rect width="1200" height="800" fill="#333"/><rect x="500" y="120" width="45" height="80" fill="#ffff00"/>';
 const path='M350 610C180 490 210 200 400 170C550 100 910 180 950 430C980 640 620 690 480 635';
 const svg=(body:string)=>sharp(Buffer.from(`<svg width="${width}" height="${height}">${body}</svg>`)).png().toBuffer();
 const original=await svg(art),paint=await svg(`<rect width="1200" height="800" fill="black"/><path d="${path}" fill="none" stroke="#ffff00" stroke-width="4"/>`);
 const image=await svg(`${art}<path d="${path}" fill="none" stroke="#ffff00" stroke-width="4"/>`);
 const {walls}=await wallsFromYellowMask(image,width,height,grid,original,false,true,paint);
 for(const x of [470,500,520,540,580,700,850]){
  expect(hasLineOfSight({x,y:350},{x,y:60},walls),`boundary at ${x}`).toBe(false);
  expect(stopAtWalls({x,y:350},{x,y:60},2,walls).y).toBeGreaterThan(60);
 }
 expect(hasLineOfSight({x:515,y:190},{x:560,y:190},walls),'unchanged flame is not a wall').toBe(true);
 expect(hasLineOfSight({x:420,y:740},{x:420,y:500},walls),'cave entrance remains open').toBe(true);
 expect(stopAtWalls({x:420,y:740},{x:420,y:500},2,walls)).toEqual({x:420,y:500});
 expect(walls.length).toBeLessThanOrEqual(2);
});

it('repairs short diagonal paint breaks in every orientation without closing a larger passage',async()=>{
 const width=240,height=240,grid=48;
 const svg=(body:string,angle:number)=>sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><g transform="rotate(${angle} 120 120)">${body}</g></svg>`)).png().toBuffer();
 const rotate=(p:{x:number;y:number},angle:number)=>{const a=angle*Math.PI/180;return{x:120+(p.x-120)*Math.cos(a)-(p.y-120)*Math.sin(a),y:120+(p.x-120)*Math.sin(a)+(p.y-120)*Math.cos(a)};};
 for(const angle of [0,90,180,270]){
  const paint=await svg('<path d="M20 30L100 70M106 73L220 130" fill="none" stroke="#ffff00" stroke-width="2"/>',angle);
  const from=rotate({x:103,y:35},angle),to=rotate({x:103,y:105},angle);
  const {walls}=await wallsFromYellowMask(paint,width,height,grid,undefined,false,true);
  expect(hasLineOfSight(from,to,walls),`short angled seam at ${angle} blocks sight`).toBe(false);
  const stopped=stopAtWalls(from,to,.1,walls);
  expect(Math.hypot(stopped.x-to.x,stopped.y-to.y)).toBeGreaterThan(1);
  const open=await svg('<path d="M20 30L100 70M135 87.5L220 130" fill="none" stroke="#ffff00" stroke-width="2"/>',angle);
  const passage=await wallsFromYellowMask(open,width,height,grid,undefined,false,true);
  expect(hasLineOfSight(rotate({x:117,y:35},angle),rotate({x:117,y:130},angle),passage.walls),'larger entrance stays open').toBe(true);
  const precise=await wallsFromYellowMask(paint,width,height,grid,undefined,false,false,paint);
  expect(hasLineOfSight(from,to,precise.walls),'precise mode keeps explicit cuts').toBe(true);
 }
});


it('keeps muted opaque wall paint that changed from the source, without importing unchanged yellow art',async()=>{
 const svg=(body:string)=>sharp(Buffer.from(`<svg width="300" height="220">${body}</svg>`)).png().toBuffer();
 const art='<rect width="300" height="220" fill="#555"/><rect x="240" y="80" width="25" height="70" fill="#e0ca14"/>';
 const original=await svg(art),mask=await svg(`${art}<path d="M35 180L35 35L180 35L180 180" fill="none" stroke="#e0ca14" stroke-width="8"/>`);
 const {walls}=await wallsFromYellowMask(mask,300,220,48,original);
 expect(hasLineOfSight({x:100,y:100},{x:100,y:0},walls),'muted painted wall blocks sight').toBe(false);
 expect(stopAtWalls({x:100,y:100},{x:100,y:0},2,walls).y).toBeGreaterThan(0);
 expect(hasLineOfSight({x:220,y:110},{x:280,y:110},walls),'unchanged yellow art stays nonblocking').toBe(true);
 expect(hasLineOfSight({x:100,y:100},{x:100,y:210},walls),'unpainted entrance stays open').toBe(true);
});
