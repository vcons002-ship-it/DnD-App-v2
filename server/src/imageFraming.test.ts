import {it,expect,vi,afterEach} from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from './config.js';
import {apiRequest} from './ai/apiRequest.js';
import {generateApiImage} from './ai/imageGateway.js';
import {padMapReference,restoreMapMask} from './ai/imageFraming.js';
vi.mock('./ai/apiRequest.js',()=>({apiRequest:vi.fn()}));
afterEach(()=>vi.clearAllMocks());

it.each([[1000,600],[611,1000],[1600,400],[400,1600]])('preserves %i x %i map coordinates through the real image gateway',async(width,height)=>{
 const image=await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#56789a"/><rect x="100" y="120" width="20" height="20" fill="#ff00ff"/></svg>`)).png().toBuffer();
 vi.mocked(apiRequest).mockImplementation(async(_url,request)=>{
   const body=JSON.parse(request.body as string),input=body.contents[0].parts[1].inlineData;
   const meta=await sharp(Buffer.from(input.data,'base64')).metadata(),[a,b]=body.generationConfig.imageConfig.aspectRatio.split(':').map(Number);
   expect(meta.width!/meta.height!).toBeCloseTo(a/b,2);
   expect(body.contents[0].parts[0].text).toContain('padding');
   return {data:{candidates:[{content:{parts:[{inlineData:input}]}}]}} as never;
 });
 const result=await generateApiImage('Mark lights',{width:2048,height:2048*height/width,preserveMapFraming:true},[{mimeType:'image/png',data:image.toString('base64')}]);
 expect('error' in result).toBe(false);
 const saved=await fs.readFile(path.join(config.uploadsDir,path.basename(result.path!)));
 const meta=await sharp(saved).metadata();expect([meta.width,meta.height]).toEqual([width,height]);
 expect((await sharp(saved).raw().toBuffer()).equals(await sharp(image).raw().toBuffer())).toBe(true);
});

it('still rejects an unexpected AI canvas rather than stretching its annotations',async()=>{
 const image=await sharp({create:{width:1000,height:600,channels:3,background:'#555'}}).png().toBuffer();
 const {framing}=await padMapReference(image);
 const wrong=await sharp({create:{width:800,height:800,channels:3,background:'#555'}}).png().toBuffer();
 await expect(restoreMapMask(wrong,framing)).rejects.toThrow('unexpected aspect ratio');
});
