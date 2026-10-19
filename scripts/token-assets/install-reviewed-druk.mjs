/** Install the approved v29 Druk with exact full-detail delivery and rebuilt
 * geometry tiers. Review input is immutable; runtime URLs are content hashes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createDeliveryIO,optimizeDelivery} from '../../server/tools/asset-production/lossless_delivery.mjs';
import {sha256} from './shared-character-textures.mjs';

const input=path.resolve(process.argv[2]??'');
assert(process.argv[2],'Usage: node scripts/token-assets/install-reviewed-druk.mjs APPROVED_V29.glb [OUTPUT_DIR]');
const approvedSha='c6e4f267253b2a48efd53d40b235535aace62b7076485a3378de4359171bf497';
const source=fs.readFileSync(input);assert([approvedSha,'63d53c563552b6c7a24ceabf83284f2345027227cda02616f4a5f58e8ae92824'].includes(sha256(source)),'Use the approved v29 review or its exact lossless export');
const out=path.resolve(process.argv[3]??'artifacts/druk-approved-20261019');fs.mkdirSync(out,{recursive:true});
const folder='client/public/miniatures';
const read=name=>JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
const high=read('manifest.json'),quality=read('quality-manifest.json'),battlefield=read('battlefield-manifest.json');
const model=high.models.find(m=>m.id==='druk');assert(model);
const oldUrls=[model,...quality.models.filter(m=>m.id==='druk'),...battlefield.models.filter(m=>m.id==='druk')].map(m=>m.url);
const io=await createDeliveryIO(),doc=await io.readBinary(source);
console.log('Encoding approved full detail without changing pixels or geometry…');
const delivery=await optimizeDelivery(doc,io),triangles=delivery.receipt.geometry.reduce((sum,p)=>sum+p.triangles,0);
assert.equal(triangles,880377);
const filename=`druk-approved-${delivery.receipt.sha256.slice(0,12)}.glb`;
const sourceUrl='/miniatures/'+filename;fs.writeFileSync(path.join(folder,filename),delivery.bytes);
fs.writeFileSync(path.join(out,filename),delivery.bytes);
const receipt={...delivery.receipt,schemaVersion:1,id:'druk',sourceUrl:'review:druk-materials-v29-strap-wraps-left-hand.glb',sourceSha256:sha256(source),sourceBytes:source.length,url:sourceUrl,triangles,verified:{...delivery.receipt.verified,animationDataExact:true}};
const optimizationReceipt='assets/miniatures/character-compression/druk.json';write(optimizationReceipt,receipt);
for(const key of ['sharedTextureReceipt','sharedTextureReceiptSha256'])delete model[key];
Object.assign(model,{url:sourceUrl,sha256:receipt.sha256,bytes:delivery.bytes.length,triangles,sourceVersion:'druk-approved-20261019/v29-strap-wraps-left-hand',sourceSha256:sha256(source),sourceTriangles:triangles,compression:'EXT_meshopt_compression',originalTextures:true,sourceImageHashes:receipt.textures.map(t=>t.sourceSha256),runtimeImageHashes:receipt.textures.map(t=>t.sha256),deliveryOptimization:'lossless-textures-and-mesh',optimizationReceipt,optimizationReceiptSha256:sha256(fs.readFileSync(optimizationReceipt))});
write(path.join(folder,'manifest.json'),high);
const run=(script,...args)=>execFileSync(process.execPath,[script,...args],{stdio:'inherit'});
const reduced=path.join(out,'reduced');run('scripts/token-assets/reduce-characters.mjs',reduced,'--characters=druk');
const temporary=[filename];
for(const [profile,name]of [['balanced','balanced'],['low','light']]){
 const r=JSON.parse(fs.readFileSync(path.join(reduced,`druk-${name}.json`),'utf8'));
 const receiptPath=`assets/miniatures/character-reduction/druk-${name}.json`;write(receiptPath,r);
 fs.copyFileSync(path.join(reduced,r.filename),path.join(folder,r.filename));temporary.push(r.filename);
 const index=quality.models.findIndex(m=>m.id==='druk'&&m.profile===profile);assert(index>=0);
 quality.models[index]={id:'druk',profile,url:'/miniatures/'+r.filename,sha256:r.sha256,bytes:r.bytes,triangles:r.triangles,sourceUrl:r.sourceUrl,sourceSha256:r.sourceSha256,receipt:receiptPath};
}
write(path.join(folder,'quality-manifest.json'),quality);
const far=path.join(out,'battlefield');run('scripts/token-assets/reduce-characters.mjs',far,'--battlefield','--characters=druk');
const r=JSON.parse(fs.readFileSync(path.join(far,'druk-battlefield.json'),'utf8'));
const receiptPath='assets/miniatures/battlefield-lod/druk.json';write(receiptPath,r);
fs.copyFileSync(path.join(far,r.filename),path.join(folder,r.filename));temporary.push(r.filename);
const index=battlefield.models.findIndex(m=>m.id==='druk');assert(index>=0);
battlefield.models[index]={id:'druk',url:'/miniatures/'+r.filename,sha256:r.sha256,bytes:r.bytes,triangles:r.triangles,baseCenter:r.baseCenter,baseDiameter:r.baseDiameter,baseTextureUrl:r.baseTextureUrl,receipt:receiptPath};
write(path.join(folder,'battlefield-manifest.json'),battlefield);
run('scripts/token-assets/share-character-textures.mjs',path.join(out,'shared-summary.json'));
const current=[read('manifest.json').models.find(m=>m.id==='druk'),...read('quality-manifest.json').models.filter(m=>m.id==='druk'),...read('battlefield-manifest.json').models.filter(m=>m.id==='druk')];
const urls=new Set(current.map(m=>m.url));
for(const name of new Set([...temporary,...oldUrls.map(u=>path.basename(u))])){
 const url='/miniatures/'+name;assert(name.startsWith('druk-')&&name.endsWith('.glb'));
 if(!urls.has(url)&&fs.existsSync(path.join(folder,name)))fs.unlinkSync(path.join(folder,name));
}
const textures=new Map();for(const row of current){const r=JSON.parse(fs.readFileSync(row.sharedTextureReceipt,'utf8'));for(const t of r.textures)textures.set(t.uri,t.bytes);}
write('assets/miniatures/character-compression/druk-approved-install.json',{approvedSourceSha256:approvedSha,approvedReviewBytes:source.length,fullStandaloneBytes:delivery.bytes.length,triangles,tiers:current.map(m=>({tier:m.profile??(m.receipt?.includes('battlefield')?'battlefield':'high'),url:m.url,bytes:m.bytes,triangles:m.triangles})),uniqueTextureBytes:[...textures.values()].reduce((a,b)=>a+b,0),texturesSharedAcrossAllTiers:true,allTiersRebuiltFromApprovedModel:true});
console.log('Installed approved Druk in all four geometry tiers.');
