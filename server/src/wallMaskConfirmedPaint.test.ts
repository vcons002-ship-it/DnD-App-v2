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
