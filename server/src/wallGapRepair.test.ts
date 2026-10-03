import {it,expect} from 'vitest';import sharp from 'sharp';
import {wallsFromYellowMask} from './wallMask.js';import {hasLineOfSight,stopAtWalls,sanitizeWalls} from '../../shared/mapWalls.js';
it('joins small structural paint breaks while leaving a wider passage open',async()=>{
 const mask=await sharp(Buffer.from('<svg width="400" height="200"><rect width="400" height="200" fill="#222"/><g fill="#ffff00"><rect x="20" y="80" width="80" height="20"/><rect x="103" y="80" width="77" height="20"/><rect x="188" y="80" width="72" height="20"/><rect x="280" y="80" width="100" height="20"/></g></svg>')).png().toBuffer();
 const {walls,gapRepairLimitPx}=await wallsFromYellowMask(mask,400,200,40);
 expect(gapRepairLimitPx).toBe(10);expect(sanitizeWalls(walls)).toHaveLength(walls.length);
 for(const x of [101.5,184]){expect(hasLineOfSight({x,y:60},{x,y:120},walls)).toBe(false);expect(stopAtWalls({x,y:60},{x,y:120},1,walls).y).toBeLessThan(80);}
 expect(hasLineOfSight({x:270,y:60},{x:270,y:120},walls)).toBe(true);
 expect(stopAtWalls({x:270,y:60},{x:270,y:120},4,walls)).toEqual({x:270,y:120});
 const precise=await wallsFromYellowMask(mask,400,200,40,undefined,false,false);
 for(const x of [101.5,184,270])expect(hasLineOfSight({x,y:60},{x,y:120},precise.walls)).toBe(true);
});
it('repairs the narrow part of a partially painted seam despite a wider chipped edge',async()=>{
 const mask=await sharp(Buffer.from('<svg width="400" height="200"><rect width="400" height="200" fill="#222"/><g fill="#ffff00"><rect x="20" y="80" width="160" height="20"/><rect x="185" y="90" width="195" height="10"/><rect x="195" y="80" width="185" height="10"/></g></svg>')).png().toBuffer();
 const {walls}=await wallsFromYellowMask(mask,400,200,40);
 expect(hasLineOfSight({x:182.5,y:60},{x:182.5,y:120},walls)).toBe(false);
 expect(stopAtWalls({x:182.5,y:60},{x:182.5,y:120},1,walls).y).toBeLessThan(100);
});
