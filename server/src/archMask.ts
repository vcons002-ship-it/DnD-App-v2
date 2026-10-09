import sharp from 'sharp';
import {wallsFromYellowMask} from './wallMask.js';

export const ARCH_MASK_PROMPT='Paint only clearly visible overhead arches or overpasses solid magenta (#FF00FF), edge to edge: a supported span with a visible opening and walkable floor beneath. Broken, lowered or notched wall tops are not arches. If a possible passage is genuinely ambiguous, paint its span orange (#FF8800) instead. Do not mark supports, walls or vertical faces. Keep the floor beneath each span unmarked. Ignore rubble, shadows, stairs, furniture and ordinary empty openings. Preserve all other map pixels, exact framing and aspect ratio. No labels or invented structures.';
export async function archesFromMask(mask:Buffer,source:Buffer,width:number,height:number,grid:number){
 const meta=await sharp(mask).metadata();
 if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(width/height)))>.04)throw Error('Arch mask changed the map framing.');
 const pixels=(b:Buffer)=>sharp(b,{limitInputPixels:80_000_000}).rotate().resize(width,height,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
 const [m,s]=await Promise.all([pixels(mask),pixels(source)]),confirmed=Buffer.alloc(width*height*3),uncertain=Buffer.alloc(confirmed.length);
 for(let p=0;p<width*height;p++){
  const i=p*3,r=m[i],g=m[i+1],b=m[i+2],changed=Math.max(Math.abs(r-s[i]),Math.abs(g-s[i+1]),Math.abs(b-s[i+2]))>50;
  const target=changed&&r>170&&b>170&&g<115&&Math.min(r,b)>g*1.8?confirmed:changed&&r>210&&g>75&&g<185&&b<80?uncertain:null;
  if(target){target[i]=255;target[i+1]=255;}
 }
 const geometry=async(rgb:Buffer)=>{
  if(!rgb.some(v=>v))return [];
  try{return (await wallsFromYellowMask(await sharp(rgb,{raw:{width,height,channels:3}}).png().toBuffer(),width,height,grid,undefined,false,false)).walls;}
  catch(error){if(error instanceof Error&&error.message.includes('No usable yellow wall regions'))return [];throw error;}
 };
 return {arches:(await geometry(confirmed)).map((w,i)=>({...w,id:`ai-arch-${i+1}`})),uncertain:(await geometry(uncertain)).map((w,i)=>({...w,id:`uncertain-arch-${i+1}`}))};
}
