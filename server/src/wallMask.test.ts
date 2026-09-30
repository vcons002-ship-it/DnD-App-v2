import {it,expect} from 'vitest';
import sharp from 'sharp';
import {wallsFromYellowMask} from './wallMask.js';
import {hasLineOfSight,stopAtWalls,sanitizeWalls,wallEdgeCount} from '../../shared/mapWalls.js';

it('fills yellow wall outlines, leaves large room interiors empty and preserves door gaps',async()=>{
 const image=await sharp(Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="#222"/><g stroke="#ffff00" stroke-width="3" fill="none"><rect x="190" y="20" width="18" height="100"/><rect x="190" y="180" width="18" height="100"/><rect x="20" y="40" width="130" height="160"/></g></svg>')).png().toBuffer();
 const result=await wallsFromYellowMask(image,400,300,40),walls=result.walls;
 expect(sanitizeWalls(walls)).toHaveLength(walls.length);expect(wallEdgeCount(walls)).toBeLessThanOrEqual(512);
 expect(result.filledPixels).toBeGreaterThan(0);expect(result.coverage).toBeGreaterThan(.94);
 expect(hasLineOfSight({x:170,y:70},{x:230,y:70},walls)).toBe(false);
 expect(hasLineOfSight({x:170,y:150},{x:230,y:150},walls)).toBe(true);
 expect(stopAtWalls({x:170,y:70},{x:230,y:70},10,walls).x).toBeLessThan(190);
 expect(stopAtWalls({x:170,y:150},{x:230,y:150},10,walls).x).toBe(230);
 // The large empty room enclosed by an outline must not become solid.
 expect(stopAtWalls({x:60,y:80},{x:110,y:160},10,walls)).toEqual({x:110,y:160});
});
it('rejects images without usable yellow and invalid dimensions',async()=>{
 const image=await sharp({create:{width:200,height:200,channels:3,background:'#777'}}).png().toBuffer();
 await expect(wallsFromYellowMask(image,200,200,40)).rejects.toThrow('No usable');
 await expect(wallsFromYellowMask(image,NaN,200,40)).rejects.toThrow('dimensions');
});
