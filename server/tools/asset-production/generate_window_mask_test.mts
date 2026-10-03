/** Isolated windows-only image API test. Does not convert or apply openings. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createHash} from 'node:crypto';

const [sourcePath,outputPath]=process.argv.slice(2);
const enhanced=process.argv.includes('--enhanced');
if(!sourcePath||!outputPath)throw Error('Usage: node --import tsx generate_window_mask_test.mts SOURCE OUTPUT [--enhanced]');
process.env.DATA_ROOT=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-window-mask-'));
process.env.DM_PASSPHRASE='isolated-window-mask-test';
const {config}=await import('../../src/config.js');
if(!config.geminiApiKey){
 for(const file of ['server/data/settings.json','C:/Users/vcons/DnD-App-v2/server/data/settings.json']){
  try{const settings=JSON.parse(await fs.readFile(file,'utf8'));if(settings.geminiApiKey){config.geminiApiKey=settings.geminiApiKey;break;}}catch{}
 }
}
if(!config.geminiApiKey)throw Error('Configure the image API before running this test');
const {generateApiImage}=await import('../../src/ai/imageGateway.js');
const prompt=enhanced
 ? 'The first image is the original map. The second makes shadowed wall details easier to see. On the first image, paint existing window openings or narrow viewing slits solid blue (#0000FF). Look for openings through the wall, including light passing through them. Leave solid walls, broken wall tops, doors and arches unmarked. Do not place windows based on assumed symmetry. Keep everything else unchanged. If none are visible, add no marks.'
 : 'Look at the walls of this battle map. Paint only visible window openings or viewing slits solid blue (#0000FF). Do not place windows based on assumed symmetry. Keep everything else unchanged. If none are visible, add no marks.';
const original=await fs.readFile(sourcePath),metadata=await sharp(original).metadata();
if(!metadata.width||!metadata.height)throw Error('Invalid source image');
const out=path.resolve(outputPath);await fs.mkdir(out,{recursive:true});
const reference=await sharp(original).rotate().png().toBuffer();
const references=[{mimeType:'image/png',data:reference.toString('base64')}];
let enhancement:Record<string,unknown>|undefined;
await fs.writeFile(path.join(out,'original.png'),reference);
if(enhanced){
 // Deterministic brightness processing only: no generated light, new details,
 // annotations, resizing or geometry changes in the supporting reference.
 const {data,info}=await sharp(reference).toColourspace('b-w').raw().toBuffer({resolveWithObject:true});
 if(info.channels!==1)throw Error('Expected a single-channel luminance reference');
 const lifted=Buffer.from(data.map(v=>v<128?Math.round(v+12*(1-v/128)**2):v));
 const local=await sharp(lifted,{raw:{width:info.width,height:info.height,channels:1}})
  .clahe({width:128,height:128,maxSlope:2}).toColourspace('b-w').raw().toBuffer();
 const mixed=Buffer.from(lifted.map((v,i)=>Math.round(v*.65+local[i]*.35)));
 const processed=await sharp(mixed,{raw:{width:info.width,height:info.height,channels:1}}).png().toBuffer();
 await fs.writeFile(path.join(out,'enhanced-reference.png'),processed);
 references.push({mimeType:'image/png',data:processed.toString('base64')});
 enhancement={file:'enhanced-reference.png',method:'grayscale luminance; up to 12/255 shadow lift below 128/255; 35% blend of local contrast',clahe:{width:128,height:128,maxSlope:2},dimensions:{width:info.width,height:info.height},sha256:createHash('sha256').update(processed).digest('hex'),generatedDetails:false};
}
const start=Date.now();
const result=await generateApiImage(prompt,{width:2048,height:Math.round(2048*metadata.height/metadata.width)},references);
if('error' in result)throw Error(result.error);
const bytes=await fs.readFile(path.join(config.uploadsDir,path.basename(result.path))),file='window-mask'+path.extname(result.path);
await fs.writeFile(path.join(out,file),bytes);
const receipt={model:config.geminiImageModel,prompt,input:sourcePath,inputSha256:createHash('sha256').update(original).digest('hex'),referenceSha256:createHash('sha256').update(reference).digest('hex'),referenceOrder:enhanced?['original.png','enhanced-reference.png']:['original.png'],enhancement,maskSha256:createHash('sha256').update(bytes).digest('hex'),file,elapsedSeconds:(Date.now()-start)/1000,metadata:await sharp(bytes).metadata(),manualEdits:false,geometryConverted:false,applied:false,intendedBehavior:{allowsVisibility:true,allowsPlayerMovement:false},productionPromptsChanged:false};
await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({file:path.join(out,file),model:receipt.model,elapsedSeconds:receipt.elapsedSeconds,prompt}));
