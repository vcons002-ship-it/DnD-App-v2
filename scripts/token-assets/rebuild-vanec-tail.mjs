/** Reproduce the approved Vanec tail paint and all four existing deliveries.
 * Uses tracked provenance and current manifests only. Never changes the app,
 * manifests, tier geometry, or source assets. Output must be a separate folder. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {sha256,parseGlb,restoreSharedGlb,shareGlbTextures} from './shared-character-textures.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const folder=path.join(root,'client/public/miniatures');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const high=read(path.join(folder,'manifest.json')).models.find(m=>m.id==='vanec');
assert(high,'Vanec High manifest entry is missing');
const deliveryReceipt=read(path.join(root,high.optimizationReceipt));
const paintPath=path.resolve(root,deliveryReceipt.tailRecolor.paintReceipt);
const provenanceRoot=path.join(root,'assets/miniatures/runtime-provenance/vanec-tail-skin-20261022');
assert(paintPath.startsWith(provenanceRoot+path.sep),'Vanec paint receipt must stay in its tracked provenance folder');
const provenance=path.dirname(paintPath);
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--out')throw Error('Usage: node scripts/token-assets/rebuild-vanec-tail.mjs --out <separate-output-directory>');
const out=path.resolve(args[1]);
assert(out!==root&&!root.startsWith(out+path.sep),'Output cannot replace the repository or a parent directory');
for(const folder of ['assets','client','scripts','server','shared']){
 const protectedPath=path.join(root,folder);assert(out!==protectedPath&&!out.startsWith(protectedPath+path.sep),'Output must stay outside source asset and application directories');
}
fs.mkdirSync(out,{recursive:true});
const receipt=read(paintPath);
const decode=async p=>(await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
const source=await decode(path.join(provenance,'body-original-exact.png'));
assert.equal(sha256(source.data),receipt.sourceDecodedRgbaSha256,'Original atlas pixels changed');
assert.deepEqual([source.info.width,source.info.height],[receipt.width,receipt.height]);
const mask=await sharp(path.join(provenance,'tail-paint-mask.png')).greyscale().raw().toBuffer();
const protectedMask=await sharp(path.join(provenance,'non-tail-protection-mask.png')).greyscale().raw().toBuffer();
assert.equal(mask.length,receipt.width*receipt.height);assert.equal(protectedMask.length,mask.length);
const painted=Buffer.from(source.data),center=receipt.sourceTailMedianOklab,target=receipt.targetOklab;
const linear=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
function oklab(r,g,b){
 r=linear(r);g=linear(g);b=linear(b);
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
 const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
 const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
function srgb(L,a,b){
 const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
 return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(c=>{
  c=Math.max(0,c);c=c<=.0031308?c*12.92:1.055*c**(1/2.4)-.055;return Math.max(0,Math.min(255,Math.round(c*255)));
 });
}
let changed=0;
for(let pixel=0;pixel<mask.length;pixel++){
 const i=pixel*4;if(!mask[pixel])continue;assert(!protectedMask[pixel],'Paint mask overlaps non-tail UVs');
 const color=oklab(...source.data.subarray(i,i+3));
 const result=srgb(Math.max(.12,Math.min(.92,target[0]+(color[0]-center[0])*.95)),target[1]+(color[1]-center[1])*.10,target[2]+(color[2]-center[2])*.10);
 for(let channel=0;channel<3;channel++)painted[i+channel]=result[channel];
 if(result.some((v,c)=>v!==source.data[i+c]))changed++;
}
assert.equal(changed,receipt.changedPixels);
assert.equal(sha256(painted),receipt.editedDecodedRgbaSha256,'Reproduced paint pixels differ');
const options={raw:{width:receipt.width,height:receipt.height,channels:4}};
const webp=await sharp(painted,options).webp({lossless:true,effort:6}).toBuffer();
assert.equal(sha256((await sharp(webp).ensureAlpha().raw().toBuffer())),receipt.editedDecodedRgbaSha256,'WebP encoder changed pixels');
fs.writeFileSync(path.join(out,'tail-skin-color.webp'),webp);
await sharp(painted,options).png().toFile(path.join(out,'tail-skin-color.png'));

function pack(json,bin){
 const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
 const result=Buffer.alloc(28+padded.length+bin.length);result.write('glTF');result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(padded.length,12);result.writeUInt32LE(0x4e4f534a,16);padded.copy(result,20);result.writeUInt32LE(bin.length,20+padded.length);result.writeUInt32LE(0x004e4942,24+padded.length);bin.copy(result,28+padded.length);return result;
}
function replaceImage(bytes,payload){
 const {json,bin}=parseGlb(bytes),view=json.bufferViews[json.images[0].bufferView],start=view.byteOffset??0,end=start+Math.ceil(view.byteLength/4)*4;
 const padded=Buffer.alloc(Math.ceil(payload.length/4)*4);payload.copy(padded);const delta=padded.length-(end-start);
 for(const v of json.bufferViews){
  if(v===view)continue;const at=v.byteOffset??0;
  if(v.buffer===0){assert(at<start||at>=end,'Overlapping image storage');if(at>=end)v.byteOffset=at+delta;}
  const e=v.extensions?.EXT_meshopt_compression;
  if(e?.buffer===0){assert(e.byteOffset<start||e.byteOffset>=end);if(e.byteOffset>=end)e.byteOffset+=delta;}
 }
 view.byteLength=payload.length;json.images[0].mimeType='image/webp';const next=Buffer.concat([bin.subarray(0,start),padded,bin.subarray(end)]);json.buffers[0].byteLength=next.length;return pack(json,next);
}
const quality=read(path.join(folder,'quality-manifest.json')).models.filter(m=>m.id==='vanec');
const battlefield=read(path.join(folder,'battlefield-manifest.json')).models.find(m=>m.id==='vanec');
assert.equal(quality.length,2);const entries=[{tier:'high',entry:high},...quality.map(entry=>({tier:entry.profile,entry})),{tier:'battlefield',entry:battlefield}];
const models=[];
for(const {tier,entry} of entries){
 const receiptBytes=fs.readFileSync(path.join(root,entry.sharedTextureReceipt));assert.equal(sha256(receiptBytes),entry.sharedTextureReceiptSha256);
 const sharedReceipt=JSON.parse(receiptBytes),shared=fs.readFileSync(path.join(root,'client/public',entry.url));assert.equal(sha256(shared),entry.sha256);
 const full=restoreSharedGlb(shared,sharedReceipt,uri=>fs.readFileSync(path.join(folder,uri)));
 const rebuilt=replaceImage(full,webp);assert.equal(sha256(rebuilt),sharedReceipt.sourceSha256,`${tier}: standalone reproduction differs`);
 const split=shareGlbTextures(rebuilt);assert.equal(split.receipt.sha256,entry.sha256,`${tier}: shared delivery reproduction differs`);
 const destination=path.join(out,'miniatures');fs.mkdirSync(path.join(destination,'textures'),{recursive:true});
 fs.writeFileSync(path.join(destination,path.basename(sharedReceipt.sourceUrl)),rebuilt);fs.writeFileSync(path.join(destination,path.basename(entry.url)),split.bytes);
 for(const image of split.images)fs.writeFileSync(path.join(destination,image.uri),image.payload);
 models.push({tier,url:entry.url,sha256:entry.sha256,triangles:entry.triangles,bytes:entry.bytes,standaloneSha256:sha256(rebuilt),reproducedByteExact:true});
}
const report={method:'Repaint immutable atlas with tracked UV mask and approved OKLab transfer, then splice only image0 into existing exact tier payloads.',changedPixels:changed,rgbaSha256:sha256(painted),webpSha256:sha256(webp),models,productionFilesChanged:false};
fs.writeFileSync(path.join(out,'reproduction-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
