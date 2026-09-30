import {it,expect} from 'vitest';
import sharp from 'sharp';
import {lightsFromMask} from './lightMask.js';
it('maps separate marker centers into original image coordinates without fixtures',async()=>{
 const source=await sharp({create:{width:400,height:300,channels:3,background:'#222'}}).png().toBuffer();
 const mask=await sharp(Buffer.from('<svg width="800" height="600"><rect width="800" height="600" fill="#222"/><circle cx="200" cy="150" r="8" fill="#ff00ff"/><circle cx="600" cy="450" r="8" fill="#ff00ff"/></svg>')).png().toBuffer();
 const lights=await lightsFromMask(mask,source,400,300);expect(lights).toHaveLength(2);expect(lights[0].x).toBeCloseTo(100,0);expect(lights[0].y).toBeCloseTo(75,0);expect(lights[1].x).toBeCloseTo(300,0);expect(lights.every(l=>l.visibleTorch===false)).toBe(true);
});
it('rejects empty masks and reframed output',async()=>{
 const source=await sharp({create:{width:400,height:300,channels:3,background:'#222'}}).png().toBuffer();
 await expect(lightsFromMask(source,source,400,300)).rejects.toThrow('No light');await expect(lightsFromMask(source,source,800,300)).rejects.toThrow('framing');
});
