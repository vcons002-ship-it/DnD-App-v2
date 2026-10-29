/** No database, AI requests, or campaign assets. Run with node --import tsx. */
import sharp from 'sharp';
import os from 'node:os';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import fs from 'node:fs/promises';
import {wallsFromYellowMask} from '../server/src/wallMask.js';
import {wallMaskStressFixture} from '../server/src/testFixtures/wallMaskStress.js';
import {wallEdgeCount} from '../shared/mapWalls.js';

const stress=wallMaskStressFixture();
const room=(paint:boolean,dense=false)=>Buffer.from(`<svg width="800" height="650"><rect width="100%" height="100%" fill="#30343a"/><g fill="none" stroke="${paint?'#ffff00':'#666973'}" stroke-width="12">${Array.from({length:dense?30:4},(_,i)=>{
 const x=25+(i%(dense?6:2))*125,y=25+Math.floor(i/(dense?6:2))*120;
 return `<path d="M${x+28} ${y+90}H${x}V${y}H${x+100}V${y+90}H${x+62}"/>`;
}).join('')}</g></svg>`);
const results=[];
for(const name of ['four-rooms','thirty-rooms','narrow-gap-stress'] as const){
 const original=await sharp(name==='narrow-gap-stress'?stress.original:room(false,name==='thirty-rooms')).png().toBuffer();
 const mask=await sharp(name==='narrow-gap-stress'?stress.mask:room(true,name==='thirty-rooms')).png().toBuffer();
 const samples=[];
 for(let run=0;run<3;run++){
   const delay=monitorEventLoopDelay({resolution:10});delay.enable();await new Promise(r=>setTimeout(r,25));
   const cpu=process.cpuUsage(),started=performance.now();
   const converted=await wallsFromYellowMask(mask,800,650,50,original);
   const elapsedMs=performance.now()-started,usage=process.cpuUsage(cpu);
   await new Promise(r=>setTimeout(r,25));delay.disable();
   samples.push({elapsedMs:Math.round(elapsedMs),cpuMs:Math.round((usage.user+usage.system)/1000),maxEventLoopDelayMs:Math.round(delay.max/1e6),wallPieces:converted.walls.length,wallEdges:wallEdgeCount(converted.walls)});
 }
 results.push({fixture:name,width:800,height:650,samples});
}
const report={measuredAt:new Date().toISOString(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,node:process.version,
 method:'Actual server mask converter on synthetic PNGs, three runs each. Excludes AI generation and HTTP. Event-loop maximum includes the 10 ms monitor interval. This host is not an old-CPU benchmark.',results};
const json=JSON.stringify(report,null,2)+'\n';
if(process.argv[2])await fs.writeFile(process.argv[2],json);process.stdout.write(json);
