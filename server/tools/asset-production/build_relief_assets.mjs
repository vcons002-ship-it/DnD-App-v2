/** Reuse an actual wall-face patch below a horizontal cap for exposed sides. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const out=path.resolve(process.argv[2]);
const meta=await sharp(path.join(out,'original.png')).metadata();
const {data,info}=await sharp(path.join(out,'wall-solid.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});
let best={start:0,end:0,y:0,length:0};
for(let y=3;y<info.height-3;y++){
 let start=-1;
 for(let x=0;x<=info.width;x++){
  const solid=x<info.width && [-2,-1,0,1,2].every(dy=>data[((y+dy)*info.width+x)*info.channels]>128);
  if(solid&&start<0)start=x;
  if(!solid&&start>=0){if(x-start>best.length)best={start,end:x,y,length:x-start};start=-1;}
 }
}
if(best.length<10)throw new Error('No sufficiently wide stone cap strip');
const sx=meta.width/info.width,sy=meta.height/info.height;
const relief=JSON.parse(await fs.readFile(path.join(out,'relief.json'),'utf8'));
const cropWidth=Math.round(relief.gridSizePx*1.25),cropHeight=Math.round(relief.gridSizePx*.5);
const left=Math.max(0,Math.min(meta.width-cropWidth,Math.round((best.start+best.end)/2*sx-cropWidth/2)));
const top=Math.max(0,Math.min(meta.height-cropHeight,Math.ceil((best.y+4)*sy)));
const crop={left,top,width:cropWidth,height:cropHeight};
await sharp(path.join(out,'original.png')).extract(crop).png().toFile(path.join(out,'stone-side.png'));
relief.stoneTileWidthFt=cropWidth/relief.gridSizePx*relief.feetPerSquare;relief.stoneTileHeightFt=cropHeight/relief.gridSizePx*relief.feetPerSquare;
await fs.writeFile(path.join(out,'relief.json'),JSON.stringify(relief));
await fs.writeFile(path.join(out,'stone-side-receipt.json'),JSON.stringify({method:'Wall-face patch immediately below the longest horizontal cap; unchanged original pixels',crop,tileWidthFt:relief.stoneTileWidthFt,tileHeightFt:relief.stoneTileHeightFt},null,2));
console.log(JSON.stringify({crop}));
