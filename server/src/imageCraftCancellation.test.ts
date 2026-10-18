import {afterEach,expect,it,vi} from 'vitest';
import {config} from './config.js';
import {generateImageWithBackup} from './ai/imageGateway.js';
import {generateImage} from './ai/comfy.js';
vi.mock('./ai/comfy.js',()=>({generateImage:vi.fn()}));
const originalKey=config.geminiApiKey;
afterEach(()=>{config.geminiApiKey=originalKey;vi.unstubAllGlobals();vi.clearAllMocks();});
it('aborts the image API without retries or a local generation after cancellation',async()=>{
  config.geminiApiKey='test-only';const controller=new AbortController();
  const fetcher=vi.fn((_url:unknown,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});}));
  vi.stubGlobal('fetch',fetcher);
  const request=generateImageWithBackup('A battle-ready hero',{width:2048,height:2048},'api',controller.signal);
  controller.abort();await expect(request).rejects.toMatchObject({name:'AbortError'});
  expect(fetcher).toHaveBeenCalledTimes(1);expect(generateImage).not.toHaveBeenCalled();
});
