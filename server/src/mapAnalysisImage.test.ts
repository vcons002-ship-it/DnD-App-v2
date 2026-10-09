import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {createSession,createMap,addMapImage,moveMapImage,getMap} from './sessions.js';
import {geometrySource,suggestMapGeometry,prepareWallDraft} from './mapGeometryDraft.js';
import {prepareLightDraft,lightDraftSource} from './mapLightDraft.js';
import {generateApiImage} from './ai/imageGateway.js';
vi.mock('./ai/imageGateway.js',()=>({generateApiImage:vi.fn()}));
async function fixture(base=true){
 const s=createSession('Assembled map');await fs.mkdir(config.uploadsDir,{recursive:true});
 const image=async(name:string,color:string)=>{const url=`/uploads/${s.id}-${name}.png`;await sharp({create:{width:500,height:500,channels:3,background:color}}).png().toFile(path.join(config.uploadsDir,path.basename(url)));return url;};
 const map=createMap(s.id,{name:'Tiles',...(base?{imagePath:await image('base','#ff0000')}:{})});
 const tile=addMapImage(s.id,{mapId:map.id,imagePath:await image('tile','#00ff00'),x:-500,y:-100,w:500,h:500});
 return {s,map,tile,image};
}
describe('assembled map analysis',()=>{
 it('includes translated and scaled tiles in their z order and keeps the original image untouched',async()=>{
  const f=await fixture();addMapImage(f.s.id,{mapId:f.map.id,imagePath:await f.image('upper','#0000ff'),x:-400,y:0,w:100,h:100});
  const {image,source}=await geometrySource(f.map.id);expect(source).toMatchObject({width:1000,height:600,originX:-500,originY:-100,tileCount:2});
  const raw=await sharp(image).removeAlpha().raw().toBuffer();
  const pixel=(x:number,y:number)=>[...raw.subarray((y*source.width+x)*3,(y*source.width+x)*3+3)];
  expect(pixel(30,30)).toEqual([0,255,0]);expect(pixel(150,150)).toEqual([0,0,255]);expect(pixel(750,250)).toEqual([255,0,0]);
  expect(getMap(f.map.id)!.imagePath).toBe(f.map.imagePath);
 });
 it('supports maps built entirely from tiles',async()=>{
  const f=await fixture(false);const {image,source}=await geometrySource(f.map.id);expect(image.length).toBeGreaterThan(0);expect(source.tileCount).toBe(1);expect(source.originX).toBe(-500);
 });
 it('feeds the assembled image to the wall mask and maps walls/lights back to negative map coordinates',async()=>{
  const f=await fixture(),before=await geometrySource(f.map.id),key=config.geminiApiKey;config.geminiApiKey='test';
  try{
   const mask=`/uploads/${f.s.id}-mask.png`;await sharp(Buffer.from('<svg width="1000" height="600"><rect width="1000" height="600" fill="#222"/><rect x="80" y="20" width="30" height="350" fill="#ffff00"/></svg>')).png().toFile(path.join(config.uploadsDir,path.basename(mask)));
   vi.mocked(generateApiImage).mockResolvedValue({path:mask});
   const draft=await suggestMapGeometry(f.map.id,'ai',{naturalBoundaries:false});
   const references=vi.mocked(generateApiImage).mock.calls.at(-1)![2]!;
   expect((await sharp(Buffer.from(references[0].data,'base64')).metadata()).width).toBe(1000);
   const walls=prepareWallDraft(draft,draft.items.map(i=>i.id),before.source);expect(walls.length).toBeGreaterThan(0);expect(walls.every(w=>w.ax<0&&w.bx<0)).toBe(true);
   const source=lightDraftSource(before.source,[]);
   expect(prepareLightDraft({version:1,id:'tile-light',source,lights:[{id:'ai-light-1',x:-350,y:-30}]},['ai-light-1'],source)[0]).toMatchObject({x:-350,y:-30});
   moveMapImage(f.tile.id,-450,-100);const changed=await geometrySource(f.map.id);expect(changed.source.imageHash).not.toBe(before.source.imageHash);
   expect(()=>prepareWallDraft(draft,draft.items.map(i=>i.id),changed.source)).toThrow(/changed/);
  }finally{config.geminiApiKey=key;vi.clearAllMocks();}
 });
});
