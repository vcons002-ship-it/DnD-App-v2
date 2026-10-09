import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp,{type OverlayOptions} from 'sharp';
import {config} from './config.js';
import {listMapImages} from './sessions.js';
import type {MapState} from '../../shared/types.js';

const hash=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
async function readImage(imagePath:string) {
  const root=path.resolve(config.uploadsDir);
  if(!imagePath.startsWith('/uploads/'))throw Error('Upload map images before suggesting features.');
  const file=path.resolve(root,imagePath.slice('/uploads/'.length));
  if(!file.startsWith(root+path.sep))throw Error('Invalid map image path.');
  if((await fs.stat(file)).size>40_000_000)throw Error('Use map images smaller than 40 MB for analysis.');
  return fs.readFile(file);
}

/** Analyze the same base plus z-ordered tiles shown on the battlefield.
 * The raster origin can be negative; drafts carry it back to map coordinates. */
export async function mapAnalysisImage(map:MapState) {
  const tiles=listMapImages(map.id);
  if(!map.imagePath&&!tiles.length)throw Error('Upload a map image or place image tiles before suggesting features.');
  const original=map.imagePath?await readImage(map.imagePath):undefined;
  const metadata=original?await sharp(original,{limitInputPixels:80_000_000}).metadata():undefined;
  if(original&&(!metadata?.width||!metadata.height))throw Error('Cannot read map dimensions.');
  const baseWidth=metadata?((metadata.orientation??0)>=5?metadata.height!:metadata.width!):0;
  const baseHeight=metadata?((metadata.orientation??0)>=5?metadata.width!:metadata.height!):0;
  if(!tiles.length)return {image:original!,imageHash:hash(original!),width:baseWidth,height:baseHeight};
  const originX=Math.floor(Math.min(0,...tiles.map(t=>t.x))),originY=Math.floor(Math.min(0,...tiles.map(t=>t.y)));
  const width=Math.ceil(Math.max(baseWidth,...tiles.map(t=>t.x+t.w)))-originX;
  const height=Math.ceil(Math.max(baseHeight,...tiles.map(t=>t.y+t.h)))-originY;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>80_000_000)
    throw Error('This assembled map is too large to analyze at once. Use smaller map tiles or separate maps.');
  const layers:OverlayOptions[]=original?[{input:await sharp(original).rotate().png().toBuffer(),left:-originX,top:-originY}]:[];
  const fingerprints:string[]=original?[hash(original)]:[];
  for(const tile of tiles) {
    const bytes=await readImage(tile.imagePath);
    fingerprints.push(hash(bytes));
    layers.push({input:await sharp(bytes,{limitInputPixels:80_000_000}).rotate().resize(Math.max(1,Math.round(tile.w)),Math.max(1,Math.round(tile.h)),{fit:'fill'}).png().toBuffer(),left:Math.round(tile.x-originX),top:Math.round(tile.y-originY)});
  }
  const imageHash=hash(JSON.stringify({tiles,fingerprints,originX,originY,width,height}));
  const previewImagePath=`/uploads/map-analysis-${imageHash}.png`;
  const file=path.join(config.uploadsDir,path.basename(previewImagePath));
  let image:Buffer;
  try{image=await fs.readFile(file);}catch{image=await sharp({create:{width,height,channels:4,background:'#000'}}).composite(layers).png().toBuffer();await fs.writeFile(file,image);}
  return {image,imageHash,width,height,originX,originY,previewImagePath,tileCount:tiles.length};
}
