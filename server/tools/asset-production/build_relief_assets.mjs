/** Build scenery footprints from accepted height data. Run with node --import tsx. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {contourWallMask} from '../../src/wallMaskContours.ts';
import {wallContours,pointInRing} from '../../../shared/wallGeometry.ts';
const out=path.resolve(process.argv[2]);
const data=JSON.parse(await fs.readFile(path.join(out,'relief.json'),'utf8'));
delete data.stoneTileWidthFt;delete data.stoneTileHeightFt;
await fs.writeFile(path.join(out,'relief.json'),JSON.stringify(data));
const walls=JSON.parse(await fs.readFile(path.join(out,'walls.json'),'utf8'));
const rings=walls.map(wallContours),{terrainWidth:w,terrainHeight:h}=data;
const insideWall=(x,y)=>rings.some(r=>pointInRing({x,y},r[0])&&!r.slice(1).some(hole=>pointInRing({x,y},hole)));
const scenery=[],levels=[];
for(const heightFt of [.5,1,2,4]){
 const solid=new Uint8Array(w*h);let pixels=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(data.heights[y*w+x]===heightFt&&!insideWall((x+.5)*data.width/w,(y+.5)*data.height/h)){solid[y*w+x]=1;pixels++;}
 }
 // Protect empty pixels so simplification cannot merge nearby items.
 const protectedPixels=Uint8Array.from(solid,n=>n?0:1);
 const converted=pixels?await contourWallMask(solid,protectedPixels,w,h):null;
 if(pixels&&!converted)throw new Error('Could not preserve scenery footprints at '+heightFt+' ft');
 for(const wall of converted?.walls??[]){
  const scale=ring=>ring.map(p=>({x:p.x*data.width/w,y:p.y*data.height/h}));
  scenery.push({id:'scenery-'+scenery.length,heightFt,points:scale(wall.points),holes:(wall.holes??[]).map(scale)});
 }
 levels.push({heightFt,pixels,pieces:converted?.walls.length??0,coverage:converted?.coverage??1});
}
await fs.writeFile(path.join(out,'scenery.json'),JSON.stringify(scenery,null,2));
await fs.writeFile(path.join(out,'surface-receipt.json'),JSON.stringify({method:'Separate low-height palette contours, excluding structural wall interiors. Vertical faces sample their own original top-surface pixels, not a shared wall tile.',levels,pieces:scenery.length,manualMaskEdits:false,manualElevationEdits:false},null,2));
console.log(JSON.stringify({pieces:scenery.length,levels}));
