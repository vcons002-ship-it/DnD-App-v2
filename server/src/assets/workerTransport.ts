import http from 'node:http';
import https from 'node:https';

/** GPU stages can take minutes before sending their first response byte.
 * Node fetch has a separate five-minute header deadline; use an explicit
 * end-to-end deadline instead, without releasing an uncertain GPU operation. */
export function postWorkerJSON(url:string,input:unknown,timeoutMs=90*60*1000):Promise<Record<string,any>>{
  return new Promise((resolve,reject)=>{
    const target=new URL(url),body=JSON.stringify(input);
    const request=(target.protocol==='https:'?https:http).request(target,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{
      const chunks:Buffer[]=[];let bytes=0;
      response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>8*1024*1024)request.destroy(Error('Worker receipt too large'));else chunks.push(chunk);});
      response.on('error',error=>{clearTimeout(timer);reject(error);});
      response.on('end',()=>{clearTimeout(timer);try{if(response.statusCode!==200)throw Error(`Worker HTTP ${response.statusCode}`);resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(error){reject(error);}});
    });
    const timer=setTimeout(()=>request.destroy(Error('GPU worker deadline exceeded; completion is uncertain')),timeoutMs);
    request.on('error',error=>{clearTimeout(timer);reject(error);});request.end(body);
  });
}
