/** Isolated experiment: existing map -> four Gemini diorama views. No DB writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const [sourcePath, outputPath]=process.argv.slice(2);
if(!sourcePath || !outputPath) throw new Error('Usage: node --import tsx generate_map_views.mts SOURCE OUTPUT');
const out=path.resolve(outputPath);
await fs.mkdir(out,{recursive:true});
process.env.DATA_ROOT=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-map-views-'));
process.env.DM_PASSPHRASE='isolated-map-art-experiment';
const {config}=await import('../../src/config.js');
for(const file of ['server/data/settings.json','C:/Users/vcons/DnD-App-v2/server/data/settings.json']) {
  try {const settings=JSON.parse(await fs.readFile(file,'utf8'));if(!config.geminiApiKey && settings.geminiApiKey)config.geminiApiKey=settings.geminiApiKey;} catch {}
}
if(!config.geminiApiKey)throw new Error('No configured Gemini API key');
const listing=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':config.geminiApiKey}});
if(!listing.ok)throw new Error('Model catalog unavailable: '+listing.status);
const catalog=await listing.json() as {models:{name:string}[]};
if(!catalog.models.some(m=>m.name==='models/'+config.geminiImageModel))throw new Error('Configured image model unavailable');
const {setAiReporter}=await import('../../src/ai/status.js');setAiReporter(console.log);
const {generateApiImage}=await import('../../src/ai/imageGateway.js');
const source=await fs.readFile(sourcePath);
await fs.copyFile(sourcePath,path.join(out,'original.png'));
const common='Reconstruct the supplied courtyard battle map as a realistic textured 3D tabletop diorama. Preserve its exact rectangular layout: four roofless ruined rooms, their door openings, central cross-shaped paths, furniture, pots and stonework in the original locations. Give stone walls and furniture real height; keep the walkable ground flat. Show the ENTIRE rectangular map slab, including all four corners, centered with white margin on a plain white background. No labels, grid, characters, added buildings or new decorations. The map is one isolated object. Render with clear realistic materials and neutral even lighting. Camera elevation 50 degrees above the floor, perspective close to orthographic. Keep identical geometry and layout in every view. The first image is always the original map, with north at its top. ';
const directions={front:'Camera looks north from the south (bottom) edge of the original map. North is the far edge.',back:'Camera looks south from the north (top) edge of the original map. South is the far edge.',left:'Camera looks east from the west (left) edge of the original map. East is the far edge.',right:'Camera looks west from the east (right) edge of the original map. West is the far edge.'};
const receipt:{requestedModel:string;sourceSha256:string;views:any[];cameraElevationDegrees:number}={requestedModel:config.geminiImageModel,sourceSha256:createHash('sha256').update(source).digest('hex'),cameraElevationDegrees:50,views:[]};
async function generate(name:keyof typeof directions) {
  const angle={front:0,back:180,left:270,right:90}[name];
  const reference=await sharp(source).rotate(angle).png().toBuffer();
  await fs.writeFile(path.join(out,name+'-input.png'),reference);
  const prompt=common.replace('The first image is always the original map, with north at its top. ','')+
    'The supplied map plan has already been rotated to the requested viewing direction. Its BOTTOM edge must be the NEAR edge of the diorama; its TOP edge must be the FAR edge. Match the supplied plan orientation exactly. Rebuild the walls in this orientation rather than retaining the wall-face directions painted in the 2D reference. '+
    (name==='front'?directions[name]:'This is the '+name+' view, a '+angle+' degree rotation of the original map plan.');
  const refs=[{mimeType:'image/png',data:reference.toString('base64')}];
  const started=Date.now();console.log('Generating '+name+' via '+config.geminiImageModel);
  const result=await generateApiImage(prompt,{width:2048,height:1536},refs);
  if('error' in result)throw new Error(name+': '+result.error);
  const file=name+path.extname(result.path);
  const bytes=await fs.readFile(path.join(config.uploadsDir,path.basename(result.path)));
  await fs.writeFile(path.join(out,file),bytes);
  receipt.views.push({name,file,prompt,referenceRotationDegrees:angle,referenceMimeType:'image/png',elapsedSeconds:(Date.now()-started)/1000,sha256:createHash('sha256').update(bytes).digest('hex')});
  await fs.writeFile(path.join(out,'image-receipt.json'),JSON.stringify(receipt,null,2));
  console.log('Saved '+file);return bytes;
}
// Each reference is independent; rotated map plans avoid copying a front-view anchor.
const results=await Promise.allSettled((['front','back','left','right'] as const).map(name=>generate(name)));
for(const result of results)if(result.status==='rejected')throw result.reason;
console.log('Four map views completed.');
