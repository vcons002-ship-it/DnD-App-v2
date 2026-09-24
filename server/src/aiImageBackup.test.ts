import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {config} from './config.js';
import {generateImageWithBackup} from './ai/imageGateway.js';
import {generateImage} from './ai/comfy.js';
import {setAiReporter} from './ai/status.js';
vi.mock('./ai/comfy.js',()=>({generateImage:vi.fn()}));
const original={key:config.geminiApiKey,uploads:config.uploadsDir};
let folder:string,messages:string[];
beforeEach(async()=>{folder=await fs.mkdtemp(path.join(os.tmpdir(),'ai-image-test-'));config.uploadsDir=folder;config.geminiApiKey='test';messages=[];setAiReporter(m=>messages.push(m));});
afterEach(async()=>{config.geminiApiKey=original.key;config.uploadsDir=original.uploads;vi.unstubAllGlobals();vi.clearAllMocks();setAiReporter(()=>{});await fs.rm(folder,{recursive:true,force:true});});
it('keeps successful image generation local',async()=>{
  vi.mocked(generateImage).mockResolvedValue({path:'/uploads/local.png'});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect(await generateImageWithBackup('map',{})).toEqual({path:'/uploads/local.png'});expect(fetcher).not.toHaveBeenCalled();
});
it('saves the API image after local failure and reports recovery',async()=>{
  vi.mocked(generateImage).mockResolvedValue({error:'offline'});
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:png}}]}}]})));vi.stubGlobal('fetch',fetcher);
  const result=await generateImageWithBackup('overhead stone dungeon',{width:1216,height:832});
  expect('path' in result).toBe(true);
  if('path' in result) expect(await fs.readFile(path.join(folder,path.basename(result.path)))).toEqual(Buffer.from(png,'base64'));
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body ?? '{}')).generationConfig.imageConfig.aspectRatio).toBe('3:2');
  expect(messages.join(' ')).toMatch(/Switching to Gemini image API backup/);expect(messages.join(' ')).toMatch(/completed the image/);
});
it('reports missing image backup credentials without calling the API',async()=>{
  config.geminiApiKey='';vi.mocked(generateImage).mockResolvedValue({error:'offline'});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect(await generateImageWithBackup('x',{})).toEqual({error:'offline'});expect(fetcher).not.toHaveBeenCalled();expect(messages.join(' ')).toMatch(/no Gemini API key/);
});
it('fails clearly when an image model returns text only',async()=>{
  vi.mocked(generateImage).mockResolvedValue({error:'offline'});vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"candidates":[]}')));
  expect(await generateImageWithBackup('x',{})).toHaveProperty('error');expect(await fs.readdir(folder)).toEqual([]);
});
it('uses the image API first for 3D reference art without loading a local model',async()=>{
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:png}}]}}]}))));
  expect(await generateImageWithBackup('imp',{width:2048,height:2048},'api')).toHaveProperty('path');
  expect(generateImage).not.toHaveBeenCalled();
});
it('falls back to ComfyUI once when the preferred image API fails',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"candidates":[]}')));
  vi.mocked(generateImage).mockResolvedValue({path:'/uploads/local.png'});
  expect(await generateImageWithBackup('imp',{},'api')).toEqual({path:'/uploads/local.png'});
  expect(generateImage).toHaveBeenCalledTimes(1);
  expect(messages.join(' ')).toContain('Switching to local ComfyUI backup');
});
