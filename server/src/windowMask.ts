import sharp from 'sharp';
import {wallsFromYellowMask} from './wallMask.js';
/** The accepted simple prompt, kept separate from all other image passes. */
export const WINDOW_MASK_PROMPT='Look at the walls of this battle map. Paint existing window openings or narrow viewing slits solid blue (#0000FF). Leave solid walls, broken wall tops, doors and arches unmarked. Keep the map unchanged otherwise. If there are no windows or slits, add no marks.';
export async function windowsFromMask(mask:Buffer,source:Buffer,width:number,height:number,grid:number){
 const meta=await sharp(mask).metadata();
 if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(width/height)))>.04)throw Error('Window mask changed the map framing.');
 const pixels=(b:Buffer)=>sharp(b,{limitInputPixels:80_000_000}).rotate().resize(width,height,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
 const [m,s]=await Promise.all([pixels(mask),pixels(source)]),rgb=Buffer.alloc(width*height*3);
 const blue=(b:Buffer,i:number)=>b[i]<100&&b[i+1]<130&&b[i+2]>175&&b[i+2]>Math.max(b[i],b[i+1])*1.8;
 let count=0;for(let p=0;p<width*height;p++)if(blue(m,p*3)&&!blue(s,p*3)){rgb[p*3]=255;rgb[p*3+1]=255;count++;}
 if(!count)return [];
 const yellow=await sharp(rgb,{raw:{width,height,channels:3}}).png().toBuffer();
 try{return (await wallsFromYellowMask(yellow,width,height,grid,undefined,false,false)).walls.map((w,i)=>({...w,id:`ai-window-${i+1}`}));}
 catch(error){if(error instanceof Error&&error.message.includes('No usable yellow wall regions'))return [];throw error;}
}
