import {createSession,listChat} from './sessions.js';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {apiRequest} from './ai/apiRequest.js';
import {setAiReporter} from './ai/status.js';
import {generateText,generateJson} from './ai/gateway.js';
import {config} from './config.js';
import {clearResolvedModel} from './creatures/gemini.js';
import {broadcastAiStatus,setConn,dropConn,type IOServer} from './connections.js';

describe('AI fallback and retry reporting',()=>{
  const saved={key:config.geminiApiKey,model:config.geminiModel,mode:config.aiMode};
  let messages:string[];
  beforeEach(()=>{vi.useFakeTimers();messages=[];setAiReporter(m=>messages.push(m));config.geminiApiKey='test';config.geminiModel='test';config.aiMode='local';clearResolvedModel();});
  afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();setAiReporter(()=>{});config.geminiApiKey=saved.key;config.geminiModel=saved.model;config.aiMode=saved.mode;clearResolvedModel();});
  const answer=(text:string)=>new Response(JSON.stringify({candidates:[{content:{parts:[{text}]}}]}));
  it('local failure switches to API, retries twice and reports recovery',async()=>{
    let apiCalls=0;
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
      if(!url.includes('generativelanguage')) throw new TypeError('local offline');
      if(++apiCalls<3) throw new TypeError('connection reset');
      return answer('Recovered');
    }));
    const pending=generateText('system','question');await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBe('Recovered');expect(apiCalls).toBe(3);
    expect(messages.join(' ')).toMatch(/Switching to Gemini/);
    expect(messages.join(' ')).toMatch(/2\/3/);expect(messages.join(' ')).toMatch(/3\/3/);
    expect(messages.join(' ')).toMatch(/completed the request/);
  });
  it('malformed local JSON uses the API backup',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('generativelanguage')?answer('{"name":"Goblin"}'):new Response('{"message":{"content":"broken"}}')));
    expect(await generateJson('creature')).toBe('{"name":"Goblin"}');
  });
  it('retries transient HTTP responses but stops after three attempts',async()=>{
    const fetcher=vi.fn(async()=>new Response('',{status:503}));vi.stubGlobal('fetch',fetcher);
    const pending=apiRequest('https://example.test',{});await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBeNull();expect(fetcher).toHaveBeenCalledTimes(3);
    expect(messages.join(' ')).toMatch(/failed after 3 attempts/);
  });
  it('does not retry authentication failures',async()=>{
    const fetcher=vi.fn(async()=>new Response('',{status:401}));vi.stubGlobal('fetch',fetcher);
    expect((await apiRequest('https://example.test',{}))?.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);expect(messages.join(' ')).toMatch(/will not be retried/);
  });
  it('cancellation during retry delay prevents another attempt',async()=>{
    const abort=new AbortController(),fetcher=vi.fn(async()=>{throw new TypeError('offline')});vi.stubGlobal('fetch',fetcher);
    const pending=apiRequest('https://example.test',{},{signal:abort.signal});
    await vi.advanceTimersByTimeAsync(1);abort.abort();await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('an already canceled operation never starts a local or API request',async()=>{
    const abort=new AbortController();abort.abort();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    expect(await generateText('s','u',{signal:abort.signal})).toBeNull();expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends operational notices only to authenticated DMs',()=>{
    const session=createSession('AI notice routing');
    setConn('ai-dm',{role:'dm',sessionId:session.id,viewMapId:null,playerId:null});
    setConn('ai-player',{role:'player',sessionId:session.id,viewMapId:null,playerId:null});
    const emit=vi.fn(),to=vi.fn(()=>({emit}));
    try {broadcastAiStatus({to} as unknown as IOServer,'AI: Retry 2/3');expect(to).toHaveBeenCalledWith('ai-dm');expect(emit).toHaveBeenCalledWith('notice',{message:'AI: Retry 2/3'});expect(listChat(session.id).at(-1)).toMatchObject({dmOnly:true,text:'AI: Retry 2/3'});}
    finally {dropConn('ai-dm');dropConn('ai-player');}
  });
});
