import {afterAll,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from './config.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {legacyTerrainFrames} from './legacyTerrain.js';
import type {StateSnapshot} from '../../shared/types.js';
afterAll(()=>visibilityWorkers.close());
import sharp from 'sharp';
import {VisibilityWorkers} from './visibilityWorkers.js';
import {separatedVisionSvg} from '../../shared/separatedVision.js';
import {terrainAtlas} from './terrainAtlas.js';
import {grantRenderTile,grantMotionAssets,renderAssetFor,resetRenderAssets} from './renderAssets.js';
import type {LegacyMotionAtlas} from '../../shared/legacyMotion.js';

it('packs personal sight, remembered terrain and regular darkvision independently without revealing through a wall',async()=>{
 const workers=new VisibilityWorkers(1),bounds={x:0,y:0,width:120,height:80,scale:1};
 try{for(const heavy of [true,false]){
  const vision={rangeFt:60 as const,radius:20,heavy,daylight:false,origins:[{id:'pc',x:20,y:40}],walls:[{id:'wall',ax:60,ay:0,bx:60,by:80}],lights:[]};
  const g=await workers.run({mapId:'separated',vision,wallFog:true,detailed:true,tokens:[],explored:[[[[85,20],[100,20],[100,50],[85,50],[85,20]]]]});
  const {data,info}=await sharp(Buffer.from(separatedVisionSvg(g,vision,bounds,true,false))).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const sample=(panel:number,x:number,y:number)=>data[(y*info.width+panel*bounds.width+x)*info.channels];
  expect(sample(0,20,40)).toBe(255);expect(sample(0,90,40)).toBe(0);
  expect(sample(1,90,40)).toBe(255);expect(sample(1,20,40)).toBe(0);
  expect(sample(2,20,40)).toBe(heavy?0:255);
  const retained=await sharp(Buffer.from(separatedVisionSvg(g,vision,bounds,true,true))).removeAlpha().raw().toBuffer();
  if(heavy)expect(retained[(40*info.width+120+90)*info.channels]).toBe(0);
 }}finally{await workers.close();}
});

it('reconstructs the old graded pixels from mask and retained colors for every pose, including partial alpha',async()=>{
 const w=20,h=12,columns=2,count=3,color=Buffer.alloc(w*h*4),gray=Buffer.alloc(w*h*4);
 for(let p=0;p<color.length;p+=4){color[p]=150;color[p+1]=70;color[p+2]=210;color[p+3]=p%12?255:128;gray[p]=gray[p+1]=gray[p+2]=67;gray[p+3]=color[p+3];}
 const svg=(body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
 const args={base:{color,gray},width:w,height:h,columns,lightSvgs:Array.from({length:count},(_,i)=>svg(`<circle cx="${7+i}" cy="6" r="4.3" fill="white"/>`)),maskSvgs:Array(count).fill(svg('<rect width="100%" height="100%" fill="#050608" opacity=".8"/>'))};
 const old=await terrainAtlas(args),separated=await terrainAtlas({...args,standardSvgs:Array(count).fill(`<svg xmlns="http://www.w3.org/2000/svg" width="${w*3}" height="${h}"><rect width="${w}" height="${h}" fill="white"/></svg>`)});
 expect(separated.mask).toEqual(old.mask);expect(separated.standardMask).toBeDefined();
 const packed=await sharp(separated.standardMask!).removeAlpha().raw().toBuffer({resolveWithObject:true});
 expect(packed.info.channels).toBe(3);expect([...packed.data.subarray(0,3)]).toEqual([255,0,0]);
 const light=await sharp(separated.lightMask!).extractChannel(3).raw().toBuffer(),full=await sharp(old.terrain).ensureAlpha().raw().toBuffer();
 for(let i=0;i<count;i++)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const source=(y*w+x)*4,dest=((Math.floor(i/columns)*h+y)*w*columns+i%columns*w+x)*4,a=light[dest/4]/255;
  for(let c=0;c<3;c++)expect(Math.round(gray[source+c]*(1-a)+color[source+c]*a)).toBe(full[dest+c]);
  expect(color[source+3]).toBe(full[dest+3]);
 }
});

it('requires separate private grants for each mask and retained color asset',()=>{
 const asset=(key:string)=>({key,width:1,height:1,x:0,y:0,scale:1});
 const atlas:LegacyMotionAtlas={mask:asset('sep-mask'),standardMask:asset('sep-standard'),base:asset('sep-gray'),colorBase:asset('sep-color'),lightMask:asset('sep-light'),bounds:asset('bounds'),columns:1,frameWidth:1,frameHeight:1,count:1};
 for(const a of [atlas.mask,atlas.standardMask!,atlas.base!,atlas.colorBase!,atlas.lightMask!])grantRenderTile('authorized',a.key,Buffer.from(a.key));
 expect(renderAssetFor('other',atlas.colorBase!.key)).toBeUndefined();
 expect(grantMotionAssets('other',{id:'grant',frames:[],moves:{},durationMs:0,atlas})).toBe(true);
 expect(renderAssetFor('other',atlas.colorBase!.key)).toEqual(Buffer.from('sep-color'));
 resetRenderAssets('authorized');resetRenderAssets('other');
});

it('shares the separated pixel bundle across three matching viewers with individual asset grants',async()=>{
 await fs.mkdir(config.uploadsDir,{recursive:true});const file=path.join(config.uploadsDir,`separated-share-${Date.now()}.png`);
 const viewers=['separated-legacy','separated-2d','separated-3d'];
 try{
  await sharp({create:{width:64,height:40,channels:4,background:'#e55a22'}}).png().toFile(file);
  const vision={rangeFt:60 as const,radius:12,heavy:true,daylight:false,origins:[{id:'pc',x:20,y:20}],walls:[],lights:[]};
  const legacyGeometry=await visibilityWorkers.run({mapId:'separated-shared',vision,wallFog:true,detailed:true,tokens:[],explored:[]});
  const frame={map:{id:'separated-shared',imagePath:'/uploads/'+path.basename(file),mapVisionEnabled:true},mapImages:[],tokens:[],playerVision:vision,legacyGeometry} as unknown as StateSnapshot;
  const before=visibilityWorkers.metrics.jobs;
  const results=await Promise.all(viewers.map(id=>legacyTerrainFrames(id,[frame],true,undefined,true,true)));
  expect(visibilityWorkers.metrics.jobs-before).toBe(1);
  const a=results[0]!.atlas!;
  for(const result of results)expect(result!.atlas!.standardMask!.key).toBe(a.standardMask!.key);
  for(const image of [a.mask,a.standardMask!,a.base!,a.colorBase!,a.lightMask!]){
   for(const viewer of viewers)expect(renderAssetFor(viewer,image.key)).toBeDefined();
   expect(renderAssetFor('unrelated-viewer',image.key)).toBeUndefined();
  }
 }finally{for(const id of viewers)resetRenderAssets(id);await fs.rm(file,{force:true});}
});
