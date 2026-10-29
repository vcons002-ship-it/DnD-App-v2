import {afterAll,it,expect} from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {visibilityWorkers} from './visibilityWorkers.js';
import {createLegacyVisionGeometry} from '../../shared/legacyVision.js';
import {legacyLightSvg,legacyMaskSvg} from '../../shared/legacyMaskSvg.js';
import {config} from './config.js';
import {legacyTerrainFrames} from './legacyTerrain.js';
import {renderAssetFor,resetRenderAssets} from './renderAssets.js';
import type {StateSnapshot} from '../../shared/types.js';
afterAll(()=>visibilityWorkers.close());
it('shares identical image preparation across viewers but grants every image privately',async()=>{
 await fs.mkdir(config.uploadsDir,{recursive:true});const filename=`terrain-share-${Date.now()}.png`,file=path.join(config.uploadsDir,filename);
 try{
  await sharp({create:{width:64,height:40,channels:4,background:'#e55a22'}}).png().toFile(file);
  const frame={map:{id:'shared-terrain',imagePath:'/uploads/'+filename,mapVisionEnabled:true},mapImages:[],tokens:[],playerVision:{radius:12,heavy:true,origins:[{id:'pc',x:20,y:20}],lights:[]},legacyGeometry:{sight:['M0,0L64,0L64,40L0,40Z'],near:['M0,0L40,0L40,40L0,40Z'],lights:[],memory:[],affinity:[]}} as unknown as StateSnapshot;
  const before=visibilityWorkers.metrics.jobs;
  const [a,b]=await Promise.all([legacyTerrainFrames('terrain-a',[frame],true,undefined,true),legacyTerrainFrames('terrain-b',[frame],true,undefined,true)]);
  expect(visibilityWorkers.metrics.jobs-before).toBe(1);expect(a!.atlas!.base!.key).toBe(b!.atlas!.base!.key);
  for(const asset of [a!.atlas!.mask,a!.atlas!.terrain!,a!.atlas!.base!]){
   expect(renderAssetFor('terrain-a',asset.key)).toBeDefined();expect(renderAssetFor('terrain-b',asset.key)).toBeDefined();expect(renderAssetFor('not-authorized',asset.key)).toBeUndefined();
  }
  resetRenderAssets('terrain-a');expect(renderAssetFor('terrain-a',a!.atlas!.mask.key)).toBeUndefined();expect(renderAssetFor('terrain-b',b!.atlas!.mask.key)).toBeDefined();
  const compatible=await legacyTerrainFrames('terrain-a',[frame],true);expect(compatible!.atlas!.base).toBeUndefined();expect(compatible!.atlas!.terrain!.width).toBe(compatible!.atlas!.mask.width);
 }finally{resetRenderAssets('terrain-a');resetRenderAssets('terrain-b');await fs.rm(file,{force:true});}
});
it('makes remembered ground substantially darker than live darkvision while keeping unseen ground covered',async()=>{
 const g={sight:['M0,0L100,0L100,100L0,100Z'],near:['M0,0L40,0L40,100L0,100Z'],lights:[],memory:['M0,0L80,0L80,100L0,100Z'],affinity:[]};
 const svg=legacyMaskSvg(g,{width:100,height:100,x:0,y:0,scale:1,wallFog:true,heavy:true,daylight:false,keepRevealed:false,graded:true});
 const {data}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const alpha=(x:number)=>data[(50*100+x)*4+3];
 expect(alpha(20)).toBeLessThan(30);expect(alpha(60)).toBeGreaterThan(200);expect(alpha(90)).toBe(255);
});
it('retains carried lantern light with the global sight extent and wall clipping',async()=>{
 const vision={rangeFt:60 as const,radius:192,heavy:true,origins:[{id:'pc',x:150,y:440}],lights:[{id:'pc',x:150,y:440,radius:64,height:28.8,strength:.85}],walls:[{id:'a',ax:24,ay:330,bx:255,by:330}]};
 const geometry={...createLegacyVisionGeometry()(vision,true),memory:[],affinity:[]};
 const svg=legacyLightSvg(geometry,{width:1024,height:682,x:-50,y:-8,scale:.79,wallFog:true,daylight:false});
 const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 expect(data[(354*info.width+158)*4+3]).toBe(255);expect(data[(200*info.width+158)*4+3]).toBe(0);
});
it('keeps every row of map art, uses grayscale outside light, and preserves lit color in every atlas cell',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-terrain-color-')),file=path.join(root,'color.png'),w=64,h=40;
 try{
  await sharp({create:{width:w,height:h,channels:4,background:'#e55a22'}}).png().toFile(file);
  const svg=(body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  const result=await visibilityWorkers.run({terrainFrames:{key:file,images:[{file,x:0,y:0,w,h}],bounds:{x:0,y:0,width:w,height:h,scale:1},columns:2,maskSvgs:[svg('<rect width="100%" height="100%" fill="black" opacity=".2"/>'),svg('')],lightSvgs:[svg('<rect width="32" height="40" fill="white"/>'),svg('<rect x="32" width="32" height="40" fill="white"/>')]}});
  const {data,info}=await sharp(result.terrain).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixel=(x:number,y:number)=>[...data.slice((y*info.width+x)*4,(y*info.width+x)*4+4)];
  for(const y of [0,20,39]){
   const lit=pixel(16,y),gray=pixel(48,y),nextGray=pixel(80,y),nextLit=pixel(112,y);
   expect(lit[0]).toBeGreaterThan(lit[1]*2);expect(lit[2]).toBeLessThan(50);expect(lit[3]).toBe(255);expect(nextLit).toEqual(lit);
   expect(gray[0]).toBeGreaterThan(30);expect(gray[0]).toBe(gray[1]);expect(gray[1]).toBe(gray[2]);expect(nextGray).toEqual(gray);
  }
  expect(result.width).toBe(128);expect(result.height).toBe(40);expect(result.mask?.length).toBeGreaterThan(0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
it('raw source composition preserves the prior lossless PNG path with translucent decals',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-terrain-sources-')),file=path.join(root,'base.png'),decal=path.join(root,'decal.png'),w=64,h=40;
 try{
  await sharp({create:{width:w,height:h,channels:4,background:'#e55a22'}}).png().toFile(file);
  await sharp({create:{width:20,height:12,channels:4,background:{r:20,g:100,b:240,alpha:.4}}}).png().toFile(decal);
  const images=[{file,x:0,y:0,w,h},{file:decal,x:8,y:5,w:20,h:12}];
  const layers=await Promise.all(images.map(async i=>({input:await sharp(i.file).ensureAlpha().png().toBuffer(),left:i.x,top:i.y})));
  const composed=await sharp({create:{width:w,height:h,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
  const grayPng=await sharp(composed).grayscale().modulate({brightness:.78}).png().toBuffer();
  const color=await sharp(composed).toColourspace('srgb').ensureAlpha().raw().toBuffer(),expected=await sharp(grayPng).toColourspace('srgb').ensureAlpha().raw().toBuffer();
  for(let y=0;y<h;y++)color.copy(expected,y*w*4,y*w*4,(y*w+32)*4);
  const light=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="32" height="40" fill="white"/></svg>`;
  const result=await visibilityWorkers.run({terrainFrames:{key:root,images,bounds:{x:0,y:0,width:w,height:h,scale:1},columns:1,lightSvgs:[light],maskSvgs:[]}});
  expect((await sharp(result.terrain).ensureAlpha().raw().toBuffer()).equals(expected)).toBe(true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
