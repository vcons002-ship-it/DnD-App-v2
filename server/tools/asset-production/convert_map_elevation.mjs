import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function convertElevation(out){
 const receipt=JSON.parse(await fs.readFile(path.join(out,'api-receipt.json'),'utf8'));
 const {width,height,gridSizePx,feetPerSquare,palette}=receipt;
 const terrainWidth=305,terrainHeight=Math.round(terrainWidth*height/width);
 const colors=palette.map(p=>({...p,rgb:[1,3,5].map(n=>parseInt(p.hex.slice(n,n+2),16))}));
 const candidates=[];
 for(const request of receipt.requests.filter(r=>r.name.startsWith('elevation'))){
  const rgb=await sharp(path.join(out,request.file)).resize(terrainWidth,terrainHeight,{fit:'fill',kernel:'nearest'}).removeAlpha().raw().toBuffer();
  const heights=[],pixels=Buffer.alloc(rgb.length),bins=Object.fromEntries(palette.map(p=>[String(p.feet),0]));let offPalettePixels=0;
  for(let i=0;i<rgb.length;i+=3){
   let best=colors[0],distance=Infinity;
   for(const color of colors){const d=color.rgb.reduce((sum,c,j)=>sum+(c-rgb[i+j])**2,0);if(d<distance){best=color;distance=d;}}
   // Art remnants are unknown data, never brightness-derived terrain.
   if(distance>80**2){offPalettePixels++;best=colors[0];}
   heights.push(best.feet);bins[String(best.feet)]++;
   for(let j=0;j<3;j++)pixels[i+j]=best.rgb[j];
  }
  candidates.push({file:request.file,heights,pixels,bins,offPalettePixels});
 }
 candidates.sort((a,b)=>a.offPalettePixels-b.offPalettePixels);
 const selected=candidates[0];if(!selected)throw new Error('No elevation API response');
 await fs.writeFile(path.join(out,'relief.json'),JSON.stringify({width,height,gridSizePx,feetPerSquare,terrainWidth,terrainHeight,heights:selected.heights,palette,wallHeightFt:8}));
 await sharp(selected.pixels,{raw:{width:terrainWidth,height:terrainHeight,channels:3}}).png().toFile(path.join(out,'elevation-data.png'));
 receipt.selectedElevation=selected.file;
 receipt.elevationConversion={terrainWidth,terrainHeight,bins:selected.bins,offPalettePixels:selected.offPalettePixels,totalPixels:selected.heights.length,
  candidates:candidates.map(({file,offPalettePixels})=>({file,offPalettePixels})),
  decoding:'Closest RGB palette within distance 80; unknown/art pixels remain flat at 0 ft. Lowest unknown-pixel candidate wins. No brightness/shadow inference.'};
 await fs.writeFile(path.join(out,'api-receipt.json'),JSON.stringify(receipt,null,2));
 return receipt.elevationConversion;
}
if(process.argv[1]?.endsWith('convert_map_elevation.mjs'))console.log(JSON.stringify(await convertElevation(path.resolve(process.argv[2]))));
