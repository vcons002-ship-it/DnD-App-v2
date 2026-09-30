import {it,expect} from 'vitest';
import sharp from 'sharp';
import {mergeNaturalBoundaryMask} from './naturalBoundaryMask.js';
import {wallsFromYellowMask} from './wallMask.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';

const image=async(paths:string)=>sharp(Buffer.from(`<svg width="400" height="300"><rect width="400" height="300" fill="#333"/>${paths}</svg>`)).png().toBuffer();
it('preserves the exact structural image while adding only green boundaries, ignoring second-pass deletions and yellow repainting',async()=>{
  const first=await image('<rect x="90" y="20" width="12" height="240" fill="#ffff00"/><rect x="30" y="30" width="12" height="30" fill="#00ff00"/>');
  const second=await image('<rect x="270" y="20" width="12" height="240" fill="#00ff00"/><rect x="30" y="30" width="12" height="30" fill="#00ff00"/><rect x="180" y="20" width="12" height="240" fill="#ffff00"/>');
  const result=await mergeNaturalBoundaryMask(first,second),raw=await sharp(result.image).removeAlpha().raw().toBuffer(),original=await sharp(first).removeAlpha().raw().toBuffer();
  const pixel=(data:Buffer,x:number,y:number)=>[...data.subarray((y*400+x)*3,(y*400+x)*3+3)];
  expect(pixel(raw,95,100)).toEqual([255,255,0]);expect(pixel(raw,275,100)).toEqual([255,255,0]);expect(pixel(raw,185,100)).toEqual([51,51,51]);expect(pixel(raw,35,40)).toEqual([0,255,0]);
  const expected=Buffer.from(original);for(let y=20;y<260;y++)for(let x=270;x<282;x++){const i=(y*400+x)*3;expected[i]=255;expected[i+1]=255;expected[i+2]=0;}expect(raw.equals(expected)).toBe(true);
  expect(result.addedPixels).toBe(12*240);
});
it('joins a new cave rim to original masonry without losing the entrance gap',async()=>{
  const first=await image('<path d="M60 80H200M60 220H200" stroke="#ffff00" stroke-width="12"/>');
  const second=await image('<path d="M198 80H320V140M320 180V220H198" stroke="#00ff00" stroke-width="12"/>');
  const merged=await mergeNaturalBoundaryMask(first,second),converted=await wallsFromYellowMask(merged.image,400,300,40);
  expect(hasLineOfSight({x:150,y:150},{x:150,y:40},converted.walls)).toBe(false);
  expect(hasLineOfSight({x:250,y:110},{x:360,y:110},converted.walls)).toBe(false);
  expect(hasLineOfSight({x:250,y:160},{x:360,y:160},converted.walls)).toBe(true);
});
it('returns the original file unchanged when the second pass adds no boundaries, and rejects changed framing',async()=>{
  const first=await image('<rect x="100" y="20" width="12" height="240" fill="#ffff00"/>');
  expect(await mergeNaturalBoundaryMask(first,await image(''))).toEqual({image:first,addedPixels:0,ignoredWallComponents:0});
  await expect(mergeNaturalBoundaryMask(first,await sharp({create:{width:200,height:400,channels:3,background:'#00ff00'}}).png().toBuffer())).rejects.toThrow('framing');
});
it('ignores green masonry retracing even if slightly shifted, while retaining a separate natural boundary',async()=>{
  const first=await image('<rect x="90" y="20" width="12" height="240" fill="#ffff00"/>');
  const second=await image('<rect x="92" y="20" width="12" height="240" fill="#00ff00"/><rect x="270" y="20" width="12" height="240" fill="#00ff00"/>');
  const result=await mergeNaturalBoundaryMask(first,second),raw=await sharp(result.image).raw().toBuffer();
  expect(result.ignoredWallComponents).toBe(1);expect(result.addedPixels).toBe(12*240);
  expect([...raw.subarray((100*400+103)*3,(100*400+103)*3+3)]).toEqual([51,51,51]);
});
it('does not mistake warm brown rock under a new boundary for old wall paint',async()=>{
  const first=await image('<rect x="90" y="20" width="12" height="240" fill="#503c18"/>');
  const second=await image('<rect x="90" y="20" width="12" height="240" fill="#00ff00"/>');
  const merged=await mergeNaturalBoundaryMask(first,second);expect(merged.addedPixels).toBe(12*240);
});
