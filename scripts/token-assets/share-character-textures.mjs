import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{shareGlbTextures,verifySharedDelivery,sha256}from'./shared-character-textures.mjs';
const root=process.cwd(),folder='client/public/miniatures',files=['manifest.json','quality-manifest.json','battlefield-manifest.json'],manifests=files.map(f=>JSON.parse(fs.readFileSync(path.join(folder,f),'utf8'))),rows=[],unique=new Map();
for(const[mi,manifest]of manifests.entries())for(const m of manifest.models){
 if(m.sharedTextureReceipt){const before=verifySharedDelivery(m);const r=JSON.parse(fs.readFileSync(m.sharedTextureReceipt,'utf8'));for(const i of r.textures)unique.set(i.uri,i);rows.push({id:m.id,tier:mi===0?'high':mi===2?'battlefield':m.profile,before:before.bytes,after:m.bytes,sourceUrl:before.url,url:m.url});continue}
 const sourceUrl=m.url,source=fs.readFileSync('client/public'+sourceUrl);assert.equal(sha256(source),m.sha256);const shared=shareGlbTextures(source),tier=mi===0?'high':mi===2?'battlefield':m.profile;
 const filename=`${m.id}-${tier}-shared-${shared.receipt.sha256.slice(0,12)}.glb`,receiptPath=`assets/miniatures/shared-textures/${m.id}-${tier}.json`;shared.receipt.sourceUrl=sourceUrl;
 for(const image of shared.images){unique.set(image.uri,image);fs.mkdirSync(path.join(folder,'textures'),{recursive:true});fs.writeFileSync(path.join(folder,image.uri),image.payload)}
 fs.mkdirSync(path.dirname(receiptPath),{recursive:true});const receiptBytes=Buffer.from(JSON.stringify(shared.receipt,null,2)+'\n');fs.writeFileSync(receiptPath,receiptBytes);fs.writeFileSync(path.join(folder,filename),shared.bytes);
 rows.push({id:m.id,tier,before:source.length,after:shared.bytes.length,sourceUrl,url:'/miniatures/'+filename});Object.assign(m,{url:'/miniatures/'+filename,bytes:shared.bytes.length,sha256:shared.receipt.sha256,sharedTextureReceipt:receiptPath,sharedTextureReceiptSha256:sha256(receiptBytes)});verifySharedDelivery(m);
}
for(const[i,file]of files.entries())fs.writeFileSync(path.join(folder,file),JSON.stringify(manifests[i],null,2)+'\n');
const report={models:rows,geometryBytes:rows.reduce((s,r)=>s+r.after,0),uniqueTextureBytes:[...unique.values()].reduce((s,i)=>s+i.bytes,0),originalBytes:rows.reduce((s,r)=>s+r.before,0),uniqueTextures:unique.size};report.totalBytes=report.geometryBytes+report.uniqueTextureBytes;report.savedBytes=report.originalBytes-report.totalBytes;
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
