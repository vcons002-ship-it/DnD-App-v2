vi.mock('./mapFeatureGate.js',()=>({gateMapFeature:vi.fn(async()=>({allowed:true})),gateWindowRegions:vi.fn(async(_image:Buffer,_width:number,_height:number,regions:any)=>({regions:regions??[{ax:0,ay:0,bx:1,by:1}]}))}));
import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {generateApiImage} from './ai/imageGateway.js';
import {generateMapRegionMask} from './mapRegionMask.js';
import {parseMapAnalysisRegions} from '../../shared/mapAnalysisRegions.js';
import {createSession,createMap} from './sessions.js';
import {suggestMapWindows} from './mapWindowDraft.js';
vi.mock('./ai/imageGateway.js',async original=>({...await original<typeof import('./ai/imageGateway.js')>(),generateApiImage:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
const source=()=>sharp({create:{width:1000,height:600,channels:3,background:'#334455'}}).png().toBuffer();
async function markInput(_prompt:string,_options:unknown,references:any,mark=40){
 const input=Buffer.from(references[0].data,'base64'),meta=await sharp(input).metadata(),name=`region-output-${Math.random()}.png`;
 await fs.mkdir(config.uploadsDir,{recursive:true});
 await sharp(input).composite([{input:Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><rect x="${mark}" y="${mark}" width="20" height="20" fill="#0000ff"/></svg>`)}]).png().toFile(path.join(config.uploadsDir,name));
 return {path:'/uploads/'+name};
}
it('rejects empty, overlapping and out-of-map selections rather than falling back to full-map calls',()=>{
 expect(parseMapAnalysisRegions(undefined)).toBeUndefined();
 for(const raw of [[],[{ax:-.1,ay:0,bx:.2,by:.2}],[{ax:0,ay:0,bx:0,by:1}],[{ax:0,ay:0,bx:.5,by:.5},{ax:.2,ay:.2,bx:.7,by:.7}]])expect(()=>parseMapAnalysisRegions(raw)).toThrow();
 expect(parseMapAnalysisRegions([{ax:0,ay:0,bx:.5,by:1},{ax:.5,ay:0,bx:1,by:1}])).toHaveLength(2);
});
it('sends only crop pixels with aspect padding, restores coordinates and preserves pixels outside selected regions',async()=>{
 vi.mocked(generateApiImage).mockImplementation(markInput as any);
 const image=await source(),regions=[{ax:.2,ay:.3,bx:.4,by:.6},{ax:.6,ay:.3,bx:.8,by:.6}];
 const result=await generateMapRegionMask('Mask windows',image,1000,600,regions);expect('error' in result).toBe(false);
 const calls=vi.mocked(generateApiImage).mock.calls;expect(calls).toHaveLength(2);
 for(const call of calls){const meta=await sharp(Buffer.from(call[2]![0].data,'base64')).metadata();expect(meta.width).toBe(200);expect(meta.height).toBe(200);}
 const {data}=await sharp(path.join(config.uploadsDir,path.basename(result.path!))).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const rgb=(x:number,y:number)=>[...data.subarray((y*1000+x)*3,(y*1000+x)*3+3)];
 expect(rgb(245,215)).toEqual([0,0,255]);expect(rgb(645,215)).toEqual([0,0,255]);
 expect(rgb(100,100)).toEqual([51,68,85]);expect(rgb(500,215)).toEqual([51,68,85]);
});
it('checks all region sizes before spending any API request',async()=>{
 await expect(generateMapRegionMask('Mask',await source(),1000,600,[{ax:0,ay:0,bx:.2,by:.2},{ax:.8,ay:.8,bx:.801,by:.801}])).rejects.toThrow('16 pixels');
 expect(generateApiImage).not.toHaveBeenCalled();
});
async function paintRedGuide(_p:string,_o:unknown,references:any){
 const input=Buffer.from(references[0].data,'base64');const {data,info}=await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=info.channels)if(data[i]>200&&data[i+1]<30&&data[i+2]<30){data[i]=0;data[i+1]=0;data[i+2]=255;}
 const name='guide-'+Math.random()+'.png';await sharp(data,{raw:info}).png().toFile(path.join(config.uploadsDir,name));return {path:'/uploads/'+name};
}
it('region window drafts retain full-map source and globally aligned positions with surrounding context',async()=>{
 const session=createSession('Region windows'),name='source-'+session.id+'.png';await fs.mkdir(config.uploadsDir,{recursive:true});
 await sharp(await source()).composite([{input:Buffer.from('<svg width="1000" height="600"><rect x="240" y="210" width="20" height="20" fill="#ff0000"/></svg>')}]).png().toFile(path.join(config.uploadsDir,name));
 const map=createMap(session.id,{name:'Map',imagePath:'/uploads/'+name}),oldKey=config.geminiApiKey;config.geminiApiKey='test-key';
 try{vi.mocked(generateApiImage).mockImplementation(paintRedGuide);const draft=await suggestMapWindows(map.id,[{ax:.2,ay:.3,bx:.4,by:.6}]);expect(draft.windows).toHaveLength(1);expect(draft.windows[0]).toMatchObject({ax:240,ay:210,bx:260,by:230});}finally{config.geminiApiKey=oldKey;}
});
it('context around quadrants preserves a window crossing the central seam without changing other pixels',async()=>{
 const input=await sharp(await source()).composite([{input:Buffer.from('<svg width="1000" height="600"><rect x="480" y="100" width="40" height="20" fill="#ff0000"/></svg>')}]).png().toBuffer();
 vi.mocked(generateApiImage).mockImplementation(paintRedGuide);
 const r=await generateMapRegionMask('Windows',input,1000,600,[{ax:0,ay:0,bx:.5,by:.5},{ax:.5,ay:0,bx:1,by:.5}],{contextFraction:.04});
 const {data}=await sharp(path.join(config.uploadsDir,path.basename(r.path!))).removeAlpha().raw().toBuffer({resolveWithObject:true});
 for(const x of [480,499,500,519])expect([...data.subarray((110*1000+x)*3,(110*1000+x)*3+3)]).toEqual([0,0,255]);
 expect([...data.subarray((400*1000+100)*3,(400*1000+100)*3+3)]).toEqual([51,68,85]);
});
