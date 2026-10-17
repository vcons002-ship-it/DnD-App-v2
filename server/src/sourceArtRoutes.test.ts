import {afterEach,expect,it,vi} from 'vitest';
import express from 'express';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {config} from './config.js';
import {createApiRouter} from './routes.js';
import type {IOServer} from './connections.js';

const queue=vi.hoisted(()=>({snapshot:vi.fn(()=>({jobs:[{id:'review',artBrief:'Chainmail'}]})),approveArt:vi.fn(()=>false),regenerateArt:vi.fn(()=>false)}));
vi.mock('./assets/production.js',()=>({assetQueue:()=>queue}));
let server:Server|undefined;
afterEach(async()=>{queue.approveArt.mockReset().mockReturnValue(false);queue.regenerateArt.mockReset().mockReturnValue(false);if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;});
it('requires DM authentication and exact current-image approval; validates regeneration actions and notes',async()=>{
  const app=express();app.use(express.json());app.use('/api',createApiRouter({to:()=>({emit:vi.fn()})} as unknown as IOServer));
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/assets/jobs/review/art`;
  const headers={'Content-Type':'application/json','x-dm-passphrase':config.dmPassphrase};
  expect((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'approve',sha256:'test'})})).status).toBe(403);
  expect(queue.approveArt).not.toHaveBeenCalled();
  expect((await fetch(url,{method:'POST',headers,body:JSON.stringify({action:'approve',sha256:'stale'})})).status).toBe(409);
  queue.approveArt.mockReturnValue(true);
  expect((await fetch(url,{method:'POST',headers,body:JSON.stringify({action:'approve',sha256:'current'})})).status).toBe(200);
  expect(queue.approveArt).toHaveBeenLastCalledWith('review','current');
  expect((await fetch(url,{method:'POST',headers,body:JSON.stringify({action:'regenerate',notes:42})})).status).toBe(400);
  expect(queue.regenerateArt).not.toHaveBeenCalled();
  queue.regenerateArt.mockReturnValue(true);
  expect((await fetch(url,{method:'POST',headers,body:JSON.stringify({action:'regenerate',notes:'Brown hair'})})).status).toBe(200);
  expect(queue.regenerateArt).toHaveBeenCalledWith('review','Chainmail\nRevised appearance: Brown hair',true);
});
