/** Disposable door/arch mask conversion. Does not alter a saved map. */
import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';
import {wallsFromYellowMask} from '../../src/wallMask.ts';import {doorsFromMask} from '../../src/doorMask.ts';import {cutArchOpening} from '../../src/archOpeningCut.ts';import {stopAtWalls,hasLineOfSight,sanitizeWalls,wallCollisionRadiusFt} from '../../../shared/mapWalls.ts';
const [directory,baselinePath]=process.argv.slice(2);if(!directory||!baselinePath)throw Error('Usage: node --import tsx convert_arch_door_mask.mjs DIRECTORY BASELINE_WALLS');
const out=path.resolve(directory),original=await fs.readFile(out+'/original.png'),mask=await fs.readFile(path.join(out,path.basename(JSON.parse(await fs.readFile(out+'/api-receipt-v4.json','utf8')).file))),meta=await sharp(original).metadata(),width=meta.width,height=meta.height;
const rgba=await sharp(mask).resize(width,height,{fit:'fill'}).removeAlpha().raw().toBuffer();const src=await sharp(original).removeAlpha().raw().toBuffer();
const magenta=new Uint8Array(width*height),uncertain=new Uint8Array(width*height);
for(let p=0;p<magenta.length;p++){const i=p*3,r=rgba[i],g=rgba[i+1],b=rgba[i+2],changed=Math.max(Math.abs(r-src[i]),Math.abs(g-src[i+1]),Math.abs(b-src[i+2]))>50;magenta[p]=changed&&r>170&&b>170&&g<115&&Math.min(r,b)>g*1.8?1:0;uncertain[p]=changed&&r>210&&g>75&&g<185&&b<80?1:0;}
async function geometry(bits,grid){if(!bits.some(v=>v))return {walls:[]};const rgb=Buffer.alloc(width*height*3);for(let p=0;p<bits.length;p++)if(bits[p]){rgb[p*3]=255;rgb[p*3+1]=255;}try{return await wallsFromYellowMask(await sharp(rgb,{raw:{width,height,channels:3}}).png().toBuffer(),width,height,grid);}catch(error){if(error.message.includes("No usable yellow wall regions"))return {walls:[]};throw error;}}
const archResult=await geometry(magenta,64),uncertainResult=await geometry(uncertain,64),arches=archResult.walls.map((w,i)=>({...w,id:'arch-'+(i+1)}));const ambiguous=uncertainResult.walls.map((w,i)=>({...w,id:'uncertain-arch-'+(i+1)}));
const baseline=JSON.parse(await fs.readFile(baselinePath,'utf8'));

let walls=[...baseline];
for(const arch of arches)walls=cutArchOpening(walls,arch);
if(sanitizeWalls(walls).length!==walls.length)throw Error('Invalid converted walls');
const radius=wallCollisionRadiusFt(3.5)*64/5;
const passageChecks=arches.map(w=>{const cx=(w.ax+w.bx)/2,cy=(w.ay+w.by)/2,horizontal=w.bx-w.ax>w.by-w.ay,start=horizontal?{x:cx,y:w.ay-35}:{x:w.ax-35,y:cy},end=horizontal?{x:cx,y:w.by+35}:{x:w.bx+35,y:cy},actual=stopAtWalls(start,end,radius,walls);return {id:w.id,start,end,actual,passes:Math.hypot(actual.x-end.x,actual.y-end.y)<.01,visionThrough:hasLineOfSight(start,end,walls),baselineBlocked:!hasLineOfSight(start,end,baseline)};});
const doors=await doorsFromMask(mask,original,width,height);
await fs.writeFile(out+'/arches.json',JSON.stringify(arches,null,2));await fs.writeFile(out+'/uncertain-arches.json',JSON.stringify(ambiguous,null,2));await fs.writeFile(out+'/walls.json',JSON.stringify(walls,null,2));
const receipt={arches:arches.length,supportsAdded:0,uncertain:ambiguous.length,uncertainApplied:false,reviewRequired:true,doors:doors.length,wallPiecesBefore:baseline.length,wallPiecesAfter:walls.length,supportFractionEachEnd:.15,radius,passageChecks,allPassagesClear:passageChecks.every(p=>p.passes&&p.visionThrough),manuallyEditedMask:false,liveCampaignChanged:false};
await fs.writeFile(out+'/conversion-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
