/** Separate wall/elevation API experiment. Does not apply geometry to a campaign. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {convertElevation} from './convert_map_elevation.mjs';

const [sourcePath,outputPath]=process.argv.slice(2);
if(!sourcePath||!outputPath)throw new Error('Usage: node --import tsx generate_map_relief.mts SOURCE OUTPUT');
const out=path.resolve(outputPath);await fs.mkdir(out,{recursive:true});
process.env.DATA_ROOT=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-map-relief-'));
process.env.DM_PASSPHRASE='isolated-map-relief-test';
const {config}=await import('../../src/config.js');
for(const file of ['server/data/settings.json','C:/Users/vcons/DnD-App-v2/server/data/settings.json']){
 try{const s=JSON.parse(await fs.readFile(file,'utf8'));if(!config.geminiApiKey&&s.geminiApiKey)config.geminiApiKey=s.geminiApiKey;}catch{}
}
if(!config.geminiApiKey)throw new Error('No configured Gemini API key');
const {generateApiImage}=await import('../../src/ai/imageGateway.js');
const {setAiReporter}=await import('../../src/ai/status.js');setAiReporter(console.log);
const {wallsFromYellowMask}=await import('../../src/wallMask.js');
const original=await fs.readFile(sourcePath),meta=await sharp(original).metadata();
const width=meta.width!,height=meta.height!,gridSizePx=64,feetPerSquare=5;
await fs.writeFile(path.join(out,'original.png'),original);
const wallSource=await fs.readFile('server/src/mapGeometryDraft.ts','utf8');
const wallPrompt=wallSource.match(/export const YELLOW_WALL_PROMPT='([^']+)';/)?.[1];
if(!wallPrompt)throw new Error('Could not load the accepted wall prompt');
const palette=[{hex:'#000000',feet:0,label:'ground'},
 {hex:'#0044FF',feet:.5,label:'half-foot rise'}, {hex:'#00BB88',feet:1,label:'one-foot rise'},
 {hex:'#FFFF00',feet:2,label:'two feet'}, {hex:'#FF8800',feet:4,label:'four feet'},
 {hex:'#FF0000',feet:8,label:'eight feet'}, {hex:'#FFFFFF',feet:12,label:'twelve feet'}];
const elevationPrompt='Create a pure flat-color hypsometric HEIGHT DATA MAP of this courtyard, exactly aligned with the FIRST image, at the same framing and aspect ratio. Replace the art with elevation colors; do not overlay or keep its texture. Each pixel means the height of the top surface above the courtyard floor. Use ONLY this palette: black #000000 = floor at 0 ft; blue #0044FF = 0.5 ft; green #00BB88 = 1 ft; yellow #FFFF00 = 2 ft; orange #FF8800 = 4 ft; red #FF0000 = 8 ft; white #FFFFFF = 12 ft. The second image marks structural wall top caps in yellow: use red for these wall caps, white only for obviously taller sections. Keep flat walkable ground black, including dark floor shadows and painted wall-side shadows. For tables, crates, benches, pots, stairs and rubble, fill their actual top footprints with the closest plausible height color (usually 1, 2 or 4 ft). No labels, legend, outlines, lighting, shadows, perspective, texture, color gradients or invented terrain. Preserve every doorway gap and the precise original object positions. This is elevation data, not a new map illustration.';
const receipt:any={model:config.geminiImageModel,sourceSha256:createHash('sha256').update(original).digest('hex'),width,height,gridSizePx,feetPerSquare,palette,requests:[]};
try{const old=JSON.parse(await fs.readFile(path.join(out,'api-receipt.json'),'utf8'));if(old.sourceSha256!==receipt.sourceSha256)throw new Error('Source changed');receipt.requests=old.requests;}catch(error){if(error instanceof Error&&error.message==='Source changed')throw error;}
async function generate(name:string,prompt:string,references:Buffer[]){
 const started=Date.now();const result=await generateApiImage(prompt,{width:2048,height:Math.round(2048*height/width)},references.map(data=>({mimeType:'image/png',data:data.toString('base64')})));
 if('error' in result)throw new Error(result.error);
 const bytes=await fs.readFile(path.join(config.uploadsDir,path.basename(result.path)));
 const metadata=await sharp(bytes).metadata();
 if(Math.abs(Math.log((metadata.width!/metadata.height!)/(width/height)))>.04)throw new Error(name+' changed the framing/aspect ratio');
 const file=name+path.extname(result.path);await fs.writeFile(path.join(out,file),bytes);
 receipt.requests.push({name,file,prompt,elapsedSeconds:(Date.now()-started)/1000,sha256:createHash('sha256').update(bytes).digest('hex')});
 await fs.writeFile(path.join(out,'api-receipt.json'),JSON.stringify(receipt,null,2));
 console.log('Saved '+file);return bytes;
}
const reference=await sharp(original).png().toBuffer();
const savedMask=(await fs.readdir(out)).find(name=>/^wall-mask\.(jpg|png|webp)$/.test(name));
const mask=savedMask?await fs.readFile(path.join(out,savedMask)):await generate('wall-mask',wallPrompt,[reference]);
const conversion=await wallsFromYellowMask(mask,width,height,gridSizePx,original);
await fs.writeFile(path.join(out,'walls.json'),JSON.stringify(conversion.walls,null,2));
await sharp(conversion.solidMask,{raw:{width:conversion.workWidth,height:conversion.workHeight,channels:1}}).png().toFile(path.join(out,'wall-solid.png'));
receipt.wallConversion={count:conversion.walls.length,coverage:conversion.coverage,workWidth:conversion.workWidth,workHeight:conversion.workHeight};
console.log(JSON.stringify(receipt.wallConversion));
const previousElevation=(await fs.readdir(out)).some(name=>/^elevation\.(jpg|png|webp)$/.test(name));
const strict=previousElevation?' IMPORTANT: the previous result left original art in the central courtyard. That is unusable height data. EVERY pixel must be replaced by one of the specified solid data colors. Paint ALL ground solid pure black, across the entire center and every room. Leave absolutely NO photographic/painted texture, lighting, stone pattern or original art visible anywhere. Do not use a translucent overlay. Render a completely flat palette segmentation diagram.':'';
await generate(previousElevation?'elevation-retry':'elevation',elevationPrompt+strict,[reference,await sharp(mask).png().toBuffer()]);
await fs.writeFile(path.join(out,'api-receipt.json'),JSON.stringify(receipt,null,2));
let converted=await convertElevation(out);
if(!previousElevation&&converted.offPalettePixels/converted.totalPixels>.025){
 await generate('elevation-retry',elevationPrompt+' EVERY PIXEL must be a pure palette color. Paint the entire ground pure black; no original art, texture, translucency or vignette anywhere.',[reference,await sharp(mask).png().toBuffer()]);
 converted=await convertElevation(out);
}
console.log(JSON.stringify(converted));
