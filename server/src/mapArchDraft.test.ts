import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {createSession,createMap,addMapImage} from './sessions.js';
import {suggestMapArches} from './mapArchDraft.js';
import {gateMapFeature} from './mapFeatureGate.js';
import {generateApiImage} from './ai/imageGateway.js';
vi.mock('./mapFeatureGate.js',()=>({gateMapFeature:vi.fn()}));
vi.mock('./ai/imageGateway.js',async original=>({...await original<typeof import('./ai/imageGateway.js')>(),generateApiImage:vi.fn()}));
const originalKey=config.geminiApiKey;
afterEach(()=>{config.geminiApiKey=originalKey;vi.clearAllMocks();});
async function fixture(){
 const s=createSession('Arch image workflow'),name=`arch-source-${s.id}.png`;
 await fs.mkdir(config.uploadsDir,{recursive:true});
 await sharp({create:{width:400,height:300,channels:3,background:'#333'}}).composite([{input:Buffer.from('<svg width="400" height="300"><rect x="100" y="100" width="80" height="30" fill="#ff0000"/></svg>')}]).png().toFile(path.join(config.uploadsDir,name));
 return {s,map:createMap(s.id,{name:'Arch map',imagePath:'/uploads/'+name})};
}
async function paint(_prompt:string,_options:unknown,refs:any){
 const input=Buffer.from(refs[0].data,'base64'),{data,info}=await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=info.channels)if(data[i]>200&&data[i+1]<30&&data[i+2]<30)data[i+2]=255;
 const name=`arch-output-${Math.random()}.png`;await sharp(data,{raw:info}).png().toFile(path.join(config.uploadsDir,name));return {path:'/uploads/'+name};
}
it('automatic mode checks Qwen once and skips the image API when no arches are found',async()=>{
 const {map}=await fixture();config.geminiApiKey='test-key';
 vi.mocked(gateMapFeature).mockResolvedValue({feature:'arches',scope:'full map',decision:'no',allowed:false} as any);
 const draft=await suggestMapArches(map.id,undefined,true);
 expect(gateMapFeature).toHaveBeenCalledOnce();expect(vi.mocked(gateMapFeature).mock.calls[0][1]).toBe('arches');
 expect(generateApiImage).not.toHaveBeenCalled();expect(draft.arches).toEqual([]);expect(draft.qwenChecks![0].allowed).toBe(false);
});
it('direct mode bypasses Qwen, masks a full tiled map and translates tile coordinates back into map space',async()=>{
 const {s,map}=await fixture();config.geminiApiKey='test-key';
 addMapImage(s.id,{mapId:map.id,imagePath:map.imagePath!,x:-400,y:0,w:400,h:300});vi.mocked(generateApiImage).mockImplementation(paint);
 const draft=await suggestMapArches(map.id);
 expect(gateMapFeature).not.toHaveBeenCalled();expect(generateApiImage).toHaveBeenCalledOnce();
 expect(draft.source).toMatchObject({originX:-400,width:800,height:300});expect(draft.arches).toHaveLength(2);
 expect(draft.arches.map(w=>Math.round(w.ax)).sort((a,b)=>a-b)).toEqual([-300,100]);
 const meta=await sharp(Buffer.from(vi.mocked(generateApiImage).mock.calls[0][2]![0].data,'base64')).metadata();
 expect(meta.width!/meta.height!).not.toBeCloseTo(800/300,2); // Padded ratio, restored before conversion.
 expect(draft.qwenChecks).toEqual([]);
});
it('selected regions limit paid masking and preserve the same global source and geometry',async()=>{
 const {map}=await fixture();config.geminiApiKey='test-key';vi.mocked(generateApiImage).mockImplementation(paint);
 const draft=await suggestMapArches(map.id,[{ax:.2,ay:.2,bx:.5,by:.5}]);
 expect(draft.source.width).toBe(400);expect(draft.arches).toHaveLength(1);expect(draft.arches[0].ax).toBeCloseTo(100,0);
 expect(generateApiImage).toHaveBeenCalledOnce();expect(gateMapFeature).not.toHaveBeenCalled();
});
