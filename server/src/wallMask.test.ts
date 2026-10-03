import {it,expect} from 'vitest';
import sharp from 'sharp';
import {wallsFromYellowMask} from './wallMask.js';
import {hasLineOfSight,stopAtWalls,sanitizeWalls,wallEdgeCount} from '../../shared/mapWalls.js';
import {wallMaskStressFixture} from './testFixtures/wallMaskStress.js';
import {contourWallMask} from './wallMaskContours.js';
it('does not return collapsed zero-area contours as invalid wall pieces',async()=>{
 const w=80,h=80,mask=new Uint8Array(w*h);
 for(let y=10;y<70;y++)for(let x=10;x<24;x++)mask[y*w+x]=1;
 for(let i=0;i<5;i++)mask[(30+i)*w+50+i]=1;
 const result=await contourWallMask(mask,new Uint8Array(mask.length),w,h,true);
 expect(result).not.toBeNull();expect(sanitizeWalls(result!.walls)).toHaveLength(result!.walls.length);
 expect(result!.walls.every(w=>w.points!.length>=3)).toBe(true);
});

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

it('does not convert preexisting yellow flames into walls',async()=>{
 const svg=(wall:boolean)=>Buffer.from(`<svg width="400" height="300"><rect width="400" height="300" fill="#222"/><rect x="80" y="80" width="16" height="20" fill="#ffff00"/>${wall?'<rect x="190" y="20" width="18" height="260" fill="#ffff00"/>':''}</svg>`);
 const original=await sharp(svg(false)).png().toBuffer(),mask=await sharp(svg(true)).png().toBuffer();
 const {walls}=await wallsFromYellowMask(mask,400,300,40,original);
 expect(hasLineOfSight({x:60,y:90},{x:120,y:90},walls)).toBe(true);
 expect(hasLineOfSight({x:170,y:90},{x:230,y:90},walls)).toBe(false);
});

it('rejects shifted yellow-green artwork while retaining small painted obstacles and dim wall edges',async()=>{
 // Returned map art can be brighter and slightly shifted, escaping the original
 // yellow-pixel exclusion. Both these flower colors passed the broad seed test.
 const original=await sharp(Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="#324019"/><rect x="70" y="70" width="25" height="30" fill="#818e38"/><rect x="70" y="150" width="25" height="30" fill="#9e8c18"/></svg>')).png().toBuffer();
 const mask=await sharp(Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="#324019"/><rect x="80" y="80" width="25" height="30" fill="#c2c353"/><rect x="80" y="160" width="25" height="30" fill="#dacf49"/><rect x="190" y="20" width="18" height="260" fill="#f6e60c"/><rect x="190" y="20" width="2" height="260" fill="#afa414"/><rect x="280" y="80" width="25" height="30" fill="#ffff00"/></svg>')).png().toBuffer();
 const {walls}=await wallsFromYellowMask(mask,400,300,40,original);
 for(const y of [95,175]){
  expect(hasLineOfSight({x:60,y},{x:120,y},walls),'yellow-green artwork is not a wall').toBe(true);
  expect(stopAtWalls({x:60,y},{x:120,y},5,walls)).toEqual({x:120,y});
 }
 expect(hasLineOfSight({x:260,y:95},{x:325,y:95},walls),'small solid mask-painted obstacle is retained').toBe(false);
 expect(hasLineOfSight({x:170,y:95},{x:230,y:95},walls),'JPEG-tinted wall paint is retained').toBe(false);
 expect(stopAtWalls({x:170,y:95},{x:230,y:95},0,walls).x,'dim connected wall edge remains at its original position').toBeLessThan(191);
});

it('preserves narrow intentional cuts in horizontal and vertical bands in precise mode',async()=>{
 // Widths include a one-pixel arrow slit and gaps smaller than the old closing kernel.
 for(const gap of [1,3,5,10,20]){
  const svg=Buffer.from(`<svg width="400" height="300"><rect width="400" height="300" fill="#222"/><g fill="#ffff00"><rect x="20" y="70" width="160" height="18"/><rect x="${180+gap}" y="70" width="${190-gap}" height="18"/><rect x="190" y="120" width="18" height="60"/><rect x="190" y="${180+gap}" width="18" height="${100-gap}"/></g></svg>`);
  const {walls}=await wallsFromYellowMask(await sharp(svg).png().toBuffer(),400,300,40,undefined,false,false);
  const horizontal=[{x:180+gap/2,y:50},{x:180+gap/2,y:105}],vertical=[{x:170,y:180+gap/2},{x:235,y:180+gap/2}];
  for(const [a,b] of [horizontal,vertical]){
   expect(hasLineOfSight(a,b,walls),`gap ${gap}px should transmit sight`).toBe(true);
   expect(stopAtWalls(a,b,gap*.2,walls),`a small enough token fits ${gap}px`).toEqual(b);
  }
  expect(hasLineOfSight({x:100,y:50},{x:100,y:105},walls)).toBe(false);
 }
});

it('preserves offset openings, a narrow corridor and a diagonal slit in precise mode',async()=>{
 const f=wallMaskStressFixture(),{walls}=await wallsFromYellowMask(await sharp(f.mask).png().toBuffer(),f.width,f.height,f.grid,await sharp(f.original).png().toBuffer(),false,false);
 for(const {name,a,b,radius} of f.routes){
  expect(hasLineOfSight(a,b,walls),name).toBe(true);
  expect(stopAtWalls(a,b,radius,walls),name).toEqual(b);
 }
 for(const {a,b} of f.blocks)expect(hasLineOfSight(a,b,walls),'solid wall stays opaque').toBe(false);
 for(const x of [...Array.from({length:33},(_,i)=>410+i),...Array.from({length:39},(_,i)=>459+i)]){
  expect(hasLineOfSight({x:x-12,y:x+4},{x:x+12,y:x-20},walls),`diagonal wall at ${x}`).toBe(false);
 }
 expect(wallEdgeCount(walls)).toBeLessThanOrEqual(512);
},15000);

it('does not confuse unchanged amber floor in a gap with dark yellow paint',async()=>{
 const original=Buffer.from('<svg width="240" height="180"><rect width="240" height="180" fill="#806000"/></svg>');
 const mask=Buffer.from('<svg width="240" height="180"><rect width="240" height="180" fill="#806000"/><g fill="#ffff00"><rect x="20" y="70" width="90" height="20"/><rect x="115" y="70" width="90" height="20"/></g></svg>');
 const {walls}=await wallsFromYellowMask(await sharp(mask).png().toBuffer(),240,180,40,await sharp(original).png().toBuffer(),false,false);
 expect(hasLineOfSight({x:112.5,y:50},{x:112.5,y:110},walls)).toBe(true);
 expect(hasLineOfSight({x:80,y:50},{x:80,y:110},walls)).toBe(false);
});

it('preserves representable narrow openings through downscaling in precise mode',async()=>{
 const f=wallMaskStressFixture();
 for(const factor of [1,2]){
  const mask=await sharp(f.mask).resize(f.width*factor,f.height*factor,{kernel:'nearest'}).png().toBuffer();
  const original=await sharp(f.original).resize(f.width*factor,f.height*factor,{kernel:'nearest'}).png().toBuffer();
  const {walls}=await wallsFromYellowMask(mask,f.width*factor,f.height*factor,f.grid*factor,original,false,false);
  for(const {name,a,b} of f.routes)expect(hasLineOfSight({x:a.x*factor,y:a.y*factor},{x:b.x*factor,y:b.y*factor},walls),`${name} at ${factor}x`).toBe(true);
 }
},15000);
