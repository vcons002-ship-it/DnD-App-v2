import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const output=path.resolve(process.argv[2]??'artifacts/darkness-comparison-20261028');
const report=JSON.parse(fs.readFileSync(path.join(output,'results.json'),'utf8'));
for(const run of report.runs){
 const start=Math.max(0,run.comparisonStartMs/1000),duration=(run.comparisonEndMs-run.comparisonStartMs)/1000;
 const args=['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',path.join(output,`${run.mode}-darkness-raw.webm`),'-t',String(duration),'-vf','crop=1600:650:0:350','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',path.join(output,`${run.mode}-darkness.mp4`)];
 const result=spawnSync('ffmpeg',args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
 console.log(`${run.mode}: ${duration.toFixed(2)}s; setup trimmed, gameplay area cropped, normal playback speed`);
}
