import {it,expect,vi,afterEach} from 'vitest';
import {DEFAULT_GEMINI_MODEL,DEFAULT_GEMINI_IMAGE_MODEL,preferredGeminiTextModel,upgradeLegacyGeminiModel} from '../../shared/geminiModels.js';
import {generateApiImage,closestImageAspect} from './ai/imageGateway.js';
import {apiRequest} from './ai/apiRequest.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from './config.js';
vi.mock('./ai/apiRequest.js',()=>({apiRequest:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
it('upgrades old defaults and selects Pro before Flash, excluding specialist models',()=>{
 expect(upgradeLegacyGeminiModel('gemini-2.5-flash')).toBe(DEFAULT_GEMINI_MODEL);
 expect(upgradeLegacyGeminiModel('gemini-3.1-flash-image',true)).toBe(DEFAULT_GEMINI_IMAGE_MODEL);
 expect(upgradeLegacyGeminiModel('custom-model')).toBe('custom-model');
 expect(preferredGeminiTextModel(['gemini-3.8-flash','gemini-3-pro-image','gemini-2.5-pro-preview-tts','gemini-3.1-pro-preview','gemini-2.5-pro'])).toBe(DEFAULT_GEMINI_MODEL);
 expect(preferredGeminiTextModel(['gemini-3.5-flash','gemini-3.8-flash'])).toBe('gemini-3.8-flash');
});
it('sends reference images at the correct aspect and saves final output rather than thought imagery',async()=>{
 const old=config.geminiImageModel;config.geminiImageModel=DEFAULT_GEMINI_IMAGE_MODEL;
 try{
  vi.mocked(apiRequest).mockResolvedValue({status:200,data:{candidates:[{content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:Buffer.from('thought').toString('base64')}},{inlineData:{mimeType:'image/png',data:Buffer.from('final').toString('base64')}}]}}]}});
  const ref={mimeType:'image/png',data:'reference-base64'};
  const result=await generateApiImage('yellow walls',{width:2048,height:1639},[ref]);
  const [url,init]=vi.mocked(apiRequest).mock.calls[0];
  expect(url).toContain('gemini-3-pro-image:generateContent');
  const body=JSON.parse(String(init.body));expect(body.contents[0].parts[1]).toEqual({inlineData:ref});
  expect(body.generationConfig.imageConfig).toEqual({aspectRatio:'5:4',imageSize:'2K'});
  expect('path' in result).toBe(true);
  if(result.path)expect(await fs.readFile(path.join(config.uploadsDir,path.basename(result.path)),'utf8')).toBe('final');
  expect(closestImageAspect(768,1024)).toBe('3:4');
 }finally{config.geminiImageModel=old;}
});
