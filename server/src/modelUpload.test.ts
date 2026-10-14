import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {Document,NodeIO} from '@gltf-transform/core';
import {getBounds} from '@gltf-transform/functions';
import express from 'express';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import {config} from './config.js';
import {newId} from './db.js';
import {createModelUploadRouter,prepareUploadedModel,inspectUploadContainer} from './assets/modelUpload.js';
import {AssetQueue} from './assets/queue.js';
import {createSession,createCharacter,claimCharacter,getCharacter,createMonsterTemplate,getMonster} from './sessions.js';
import {setConn,dropConn,chatAccessToken,type IOServer} from './connections.js';

let server:Server,base:string,fixture:Uint8Array;
const queue=new AssetQueue(path.join(config.dataDir,'upload-test-queue.json'),vi.fn());
const connections:string[]=[];
beforeAll(async()=>{
  const doc=new Document(),buffer=doc.createBuffer();
  const pos=doc.createAccessor().setType('VEC3').setArray(new Float32Array([-.4,0,-.2,.4,0,-.2,0,0,.4,0,2,0])).setBuffer(buffer);
  const indices=doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,2,1,0,1,3,1,2,3,2,0,3])).setBuffer(buffer);
  doc.createScene().addChild(doc.createNode().setTranslation([7,3,-2]).setMesh(doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION',pos).setIndices(indices))));
  fixture=await new NodeIO().writeBinary(doc);
  const app=express();app.use('/models',createModelUploadRouter({to:()=>({emit:vi.fn()})} as unknown as IOServer,()=>queue,req=>req.get('x-dm-passphrase')===config.dmPassphrase));
  server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(()=>connections.splice(0).forEach(dropConn));
afterAll(async()=>{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));});
function player(sessionId:string){const id=newId();connections.push(id);setConn(id,{sessionId,role:'player',playerId:newId(),viewMapId:null});return {id,token:chatAccessToken(id)!};}
async function upload(kind:string,id:string,headers:Record<string,string>,data=fixture){
  const form=new FormData();form.append('model',new Blob([data as Uint8Array<ArrayBuffer>]),'mini.glb');form.append('upAxis','y');form.append('hasBase','false');
  return fetch(`${base}/models/${kind}/${id}`,{method:'POST',headers,body:form});
}
it('fits floor contact and a round base without double-counting parent transforms',async()=>{
  const output=await prepareUploadedModel(fixture,{upAxis:'y',hasBase:false});
  const doc=await new NodeIO().readBinary(output.data),scene=doc.getRoot().getDefaultScene()!;
  expect(scene.listChildren()).toHaveLength(2);expect(scene.listChildren().map(n=>n.getName())).toEqual(['uploaded_fit','uploaded_round_base']);
  const bounds=getBounds(scene);expect(bounds.min[1]).toBeCloseTo(0);expect(bounds.max[1]).toBeCloseTo(1.755,3);
  expect(bounds.min[0]).toBeCloseTo(-.5);expect(bounds.max[0]).toBeCloseTo(.5);expect(output.triangles).toBe(260);
  const withBase=await prepareUploadedModel(fixture,{upAxis:'y',hasBase:true});
  expect((await new NodeIO().readBinary(withBase.data)).getRoot().getDefaultScene()!.listChildren()).toHaveLength(1);
});
it('rejects renamed files, external assets, animation and invalid positions',async()=>{
  expect(()=>inspectUploadContainer(new TextEncoder().encode('<html>not a model</html>'))).toThrow('valid GLB');
  const doc=await new NodeIO().readBinary(fixture);doc.createAnimation();
  await expect(prepareUploadedModel(await new NodeIO().writeBinary(doc),{upAxis:'y',hasBase:false})).rejects.toThrow('static');
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'https://example.com/external.bin'}]}).padEnd(160,' '));const external=Buffer.alloc(20+json.length);external.write('glTF');external.writeUInt32LE(2,4);external.writeUInt32LE(external.length,8);external.writeUInt32LE(json.length,12);external.writeUInt32LE(0x4e4f534a,16);json.copy(external,20);expect(()=>inspectUploadContainer(external)).toThrow('external');
  const copy=Buffer.from(fixture);copy[0]=0;expect(()=>inspectUploadContainer(copy)).toThrow('valid GLB');
  const invalid=await new NodeIO().readBinary(fixture);invalid.getRoot().listAccessors()[0].setArray(new Float32Array([NaN,0,0]));
  await expect(prepareUploadedModel(await new NodeIO().writeBinary(invalid),{upAxis:'y',hasBase:false})).rejects.toThrow();
});
it('lets players upload only to their claimed character, persists the catalog and leaves stats alone',async()=>{
  const s=createSession(),a=player(s.id),b=player(s.id),c=createCharacter(s.id,{name:'Uploaded hero',maxHp:17,weapons:[{name:'Spear',kind:'melee',damage:'1d6'}]});claimCharacter(c.id,a.id);
  expect((await upload('character',c.id,{})).status).toBe(403);
  expect((await upload('character',c.id,{Authorization:`Bearer ${b.token}`})).status).toBe(403);
  const response=await upload('character',c.id,{Authorization:`Bearer ${a.token}`});expect(response.status).toBe(200);
  const {model}=await response.json() as {model:import('../../shared/assetProduction.js').ProducedMiniature};expect(getCharacter(c.id)?.modelType).toBe(model.id);expect(getCharacter(c.id)?.maxHp).toBe(17);expect(getCharacter(c.id)?.weapons).toEqual(c.weapons);
  expect(new AssetQueue(path.join(config.dataDir,'upload-test-queue.json'),vi.fn()).snapshot().models).toContainEqual(model);
  dropConn(a.id);expect((await upload('character',c.id,{Authorization:`Bearer ${a.token}`})).status).toBe(403);
});
it('allows DM creature and character uploads, rejects player creature uploads and keeps an old model after failure',async()=>{
  const s=createSession(),a=player(s.id),m=createMonsterTemplate(s.id,{name:'Uploaded creature',maxHp:12,modelType:'goblin'}),c=createCharacter(s.id,{name:'DM hero'});
  expect((await upload('monster',m.id,{Authorization:`Bearer ${a.token}`})).status).toBe(403);
  const headers={'x-dm-passphrase':config.dmPassphrase};
  expect((await upload('monster',m.id,headers,new Uint8Array([1,2,3]))).status).toBe(400);expect(getMonster(m.id)?.modelType).toBe('goblin');
  expect((await upload('monster',m.id,headers)).status).toBe(200);expect(getMonster(m.id)?.modelType).toMatch(/^uploaded-/);
  expect((await upload('character',c.id,headers)).status).toBe(200);
});
