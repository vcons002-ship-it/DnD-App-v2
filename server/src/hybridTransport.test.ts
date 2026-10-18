import{it,expect}from'vitest';
import http from'node:http';
import{postWorkerJSON}from'./assets/workerTransport.js';

it('waits for delayed GPU responses, handles worker errors, and enforces the configured deadline',async()=>{
 const server=http.createServer((req,res)=>{req.resume();setTimeout(()=>{if(res.destroyed)return;res.statusCode=req.url==='/error'?500:200;res.end(JSON.stringify({ok:true}));},40);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${(server.address()as import('node:net').AddressInfo).port}`;
 try{
  await expect(postWorkerJSON(url,{},1000)).resolves.toEqual({ok:true});
  await expect(postWorkerJSON(url+'/error',{},1000)).rejects.toThrow('HTTP 500');
  await expect(postWorkerJSON(url,{},5)).rejects.toThrow('completion is uncertain');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
