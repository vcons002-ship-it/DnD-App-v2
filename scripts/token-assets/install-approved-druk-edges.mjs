/** Promote the user-approved full-size pauldron-edge Druk and rebuild the established tiers.
 * Originals and previous hashed deliveries are retained for rollback. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';
import{createDeliveryIO,optimizeDelivery}from'../../server/tools/asset-production/lossless_delivery.mjs';
import{sha256,shareGlbTextures,verifySharedDelivery}from'../../scripts/token-assets/shared-character-textures.mjs';
const root=process.cwd(),out=path.join(root,'artifacts/druk-approved-edges-20261022'),folder='client/public/miniatures',provenance='assets/miniatures/runtime-provenance/druk-v10/full-size-edges-20261022';
const sourceFile=path.resolve(process.argv[2]??provenance+'/druk-high-source.glb'),source=fs.readFileSync(sourceFile),approved=sha256(source);
assert.equal(approved,'3d8946e7c07241c924f277e85028df352754ec337cfb4fd46e0f2f4f4e98fa49');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(provenance,{recursive:true});
const write=(p,o)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n')},read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const savedSource=provenance+'/druk-high-source.glb';
if(fs.existsSync(savedSource))assert.equal(sha256(fs.readFileSync(savedSource)),approved);else fs.copyFileSync(sourceFile,savedSource);
// The editable Blender master is archived separately; rebuilding delivery tiers
// needs only the immutable approved GLB, never a temporary review or live server.
write(provenance+'/approval.json',{id:'druk',version:'druk-approved-20261022/full-size-pauldron-edges',sourceSha256:approved,sourceBytes:source.length,sourceReview:'https://dnd.nic024i.app/uploads/previews/druk-pauldron-guides-20261022/',approvedByUser:true,details:'Approved full-size original pauldrons with narrow additive edge cleanup; natural shoulders and chainmail collar; existing beard, body, sword, satin steel and lava-rock base.',blenderMaster:path.relative(root,path.join(out,'druk-approved-high.blend'))});
const names=['manifest.json','quality-manifest.json','battlefield-manifest.json'],manifests=names.map(n=>read(path.join(folder,n))),[high,quality,battlefield]=manifests;
for(const n of names){const b=path.join(out,'previous-'+n);if(!fs.existsSync(b))fs.copyFileSync(path.join(folder,n),b);}
const others=manifests.map(m=>JSON.stringify(m.models.filter(v=>v.id!=='druk'))),model=high.models.find(v=>v.id==='druk');assert(model);
console.log('Saving accepted High; losslessly compressing identical geometry and pixels...');
const io=await createDeliveryIO(),doc=await io.readBinary(source),delivery=await optimizeDelivery(doc,io),triangles=delivery.receipt.geometry.reduce((s,p)=>s+p.triangles,0);assert.equal(triangles,1078637);
const filename='druk-approved-'+delivery.receipt.sha256.slice(0,12)+'.glb',sourceUrl='/miniatures/'+filename;fs.writeFileSync(path.join(folder,filename),delivery.bytes);fs.writeFileSync(path.join(out,filename),delivery.bytes);
const receipt={...delivery.receipt,schemaVersion:1,id:'druk',sourceUrl:provenance+'/druk-high-source.glb',sourceSha256:approved,sourceBytes:source.length,url:sourceUrl,triangles,verified:{...delivery.receipt.verified,animationDataExact:true}};
const optimizationReceipt='assets/miniatures/character-compression/druk.json';write(optimizationReceipt,receipt);write(provenance+'/high-delivery.json',receipt);
for(const k of['sharedTextureReceipt','sharedTextureReceiptSha256'])delete model[k];
Object.assign(model,{url:sourceUrl,sha256:receipt.sha256,bytes:delivery.bytes.length,triangles,sourceVersion:'druk-approved-20261022/full-size-pauldron-edges',sourceSha256:approved,sourceTriangles:triangles,compression:'EXT_meshopt_compression',originalTextures:true,sourceImageHashes:receipt.textures.map(t=>t.sourceSha256),runtimeImageHashes:receipt.textures.map(t=>t.sha256),deliveryOptimization:'lossless-textures-and-mesh',optimizationReceipt,optimizationReceiptSha256:sha256(fs.readFileSync(optimizationReceipt))});write(path.join(folder,'manifest.json'),high);
const run=(script,...args)=>execFileSync(process.execPath,[script,...args],{stdio:'inherit'}),reduced=path.join(out,'reduced');run('scripts/token-assets/reduce-characters.mjs',reduced,'--characters=druk');
for(const[profile,label]of[['balanced','balanced'],['low','light']]){
 const r=read(path.join(reduced,`druk-${label}.json`)),receiptPath=`assets/miniatures/character-reduction/druk-${label}.json`;write(receiptPath,r);write(provenance+`/${label}-reduction.json`,r);fs.copyFileSync(path.join(reduced,r.filename),path.join(folder,r.filename));
 const i=quality.models.findIndex(v=>v.id==='druk'&&v.profile===profile);assert(i>=0);quality.models[i]={id:'druk',profile,url:'/miniatures/'+r.filename,sha256:r.sha256,bytes:r.bytes,triangles:r.triangles,sourceUrl:r.sourceUrl,sourceSha256:r.sourceSha256,receipt:receiptPath};
}write(path.join(folder,'quality-manifest.json'),quality);
const far=path.join(out,'battlefield');run('scripts/token-assets/reduce-characters.mjs',far,'--battlefield','--characters=druk');
const r=read(path.join(far,'druk-battlefield.json')),receiptPath='assets/miniatures/battlefield-lod/druk.json';write(receiptPath,r);write(provenance+'/battlefield-reduction.json',r);fs.copyFileSync(path.join(far,r.filename),path.join(folder,r.filename));
const bi=battlefield.models.findIndex(v=>v.id==='druk');assert(bi>=0);battlefield.models[bi]={id:'druk',url:'/miniatures/'+r.filename,sha256:r.sha256,bytes:r.bytes,triangles:r.triangles,baseCenter:r.baseCenter,baseDiameter:r.baseDiameter,baseTextureUrl:r.baseTextureUrl,receipt:receiptPath};
// Share only Druk's images. Never mutate the other character entries or assets.
const entries=[{tier:'high',entry:model},...quality.models.filter(v=>v.id==='druk').map(entry=>({tier:entry.profile,entry})),{tier:'battlefield',entry:battlefield.models[bi]}],unique=new Map();
for(const{tier,entry}of entries){
 const originalUrl=entry.url,original=fs.readFileSync('client/public'+originalUrl);assert.equal(sha256(original),entry.sha256);const shared=shareGlbTextures(original);shared.receipt.sourceUrl=originalUrl;
 for(const image of shared.images){unique.set(image.uri,{bytes:image.bytes,sha256:image.sha256});const p=path.join(folder,image.uri);fs.mkdirSync(path.dirname(p),{recursive:true});if(fs.existsSync(p))assert.equal(sha256(fs.readFileSync(p)),image.sha256);else fs.writeFileSync(p,image.payload);}
 const name=`druk-${tier}-shared-${shared.receipt.sha256.slice(0,12)}.glb`,rp=`assets/miniatures/shared-textures/druk-${tier}.json`;write(rp,shared.receipt);write(provenance+`/${tier}-shared.json`,shared.receipt);fs.writeFileSync(path.join(folder,name),shared.bytes);
 Object.assign(entry,{url:'/miniatures/'+name,bytes:shared.bytes.length,sha256:shared.receipt.sha256,sharedTextureReceipt:rp,sharedTextureReceiptSha256:sha256(fs.readFileSync(rp))});verifySharedDelivery(entry,root);
}
for(const[i,n]of names.entries()){assert.equal(JSON.stringify(manifests[i].models.filter(v=>v.id!=='druk')),others[i]);write(path.join(folder,n),manifests[i]);}
const models={};for(const{tier,entry}of entries){const rp=read(entry.sharedTextureReceipt);models[tier]={...model,...entry,standaloneBytes:rp.sourceBytes,sharedTextureBytes:[...new Map(rp.textures.map(t=>[t.uri,t.bytes])).values()].reduce((s,n)=>s+n,0)};}
const summary={approvedSourceSha256:approved,approvedSourceBytes:source.length,highStandaloneBytes:delivery.bytes.length,models,uniqueTextureBytes:[...unique.values()].reduce((s,v)=>s+v.bytes,0),uniqueTextures:unique.size,oldDeliveriesRetained:true,otherCharactersUnchanged:true};write(path.join(out,'summary.json'),summary);write(provenance+'/installed-tiers.json',summary);
write('assets/miniatures/character-compression/druk-approved-install.json',{approvedSourceSha256:approved,approvedReviewBytes:source.length,fullStandaloneBytes:delivery.bytes.length,triangles,tiers:entries.map(({tier,entry})=>({tier,url:entry.url,bytes:entry.bytes,triangles:entry.triangles})),uniqueTextureBytes:summary.uniqueTextureBytes,texturesSharedAcrossAllTiers:true,allTiersRebuiltFromApprovedModel:true,rebuildCommand:'node scripts/token-assets/install-approved-druk-edges.mjs'});
console.log('New High and compressed tiers saved:',Object.fromEntries(entries.map(({tier,entry})=>[tier,{triangles:entry.triangles,geometryMB:(entry.bytes/1e6).toFixed(2)}])),'Shared texture MB:',(summary.uniqueTextureBytes/1e6).toFixed(2));
