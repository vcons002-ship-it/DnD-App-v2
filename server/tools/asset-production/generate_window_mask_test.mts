/** Isolated windows-only image API test. Does not convert or apply openings. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createHash} from 'node:crypto';

const [sourcePath,outputPath]=process.argv.slice(2);
if(!sourcePath||!outputPath)throw Error('Usage: node --import tsx generate_window_mask_test.mts SOURCE OUTPUT');
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
const prompt='Look at the walls of this battle map. Paint existing window openings or narrow viewing slits solid blue (#0000FF). Leave solid walls, broken wall tops, doors and arches unmarked. Keep the map unchanged otherwise. If there are no windows or slits, add no marks.';
const original=await fs.readFile(sourcePath),metadata=await sharp(original).metadata();
if(!metadata.width||!metadata.height)throw Error('Invalid source image');
const out=path.resolve(outputPath);await fs.mkdir(out,{recursive:true});
const reference=await sharp(original).rotate().png().toBuffer(),start=Date.now();
const result=await generateApiImage(prompt,{width:2048,height:Math.round(2048*metadata.height/metadata.width)},[{mimeType:'image/png',data:reference.toString('base64')}]);
if('error' in result)throw Error(result.error);
const bytes=await fs.readFile(path.join(config.uploadsDir,path.basename(result.path))),file='window-mask'+path.extname(result.path);
await fs.writeFile(path.join(out,file),bytes);
await fs.writeFile(path.join(out,'original.png'),reference);
const receipt={model:config.geminiImageModel,prompt,input:sourcePath,inputSha256:createHash('sha256').update(original).digest('hex'),referenceSha256:createHash('sha256').update(reference).digest('hex'),maskSha256:createHash('sha256').update(bytes).digest('hex'),file,elapsedSeconds:(Date.now()-start)/1000,metadata:await sharp(bytes).metadata(),manualEdits:false,geometryConverted:false,applied:false,intendedBehavior:{allowsVisibility:true,allowsPlayerMovement:false},productionPromptsChanged:false};
await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({file:path.join(out,file),model:receipt.model,elapsedSeconds:receipt.elapsedSeconds,prompt}));
