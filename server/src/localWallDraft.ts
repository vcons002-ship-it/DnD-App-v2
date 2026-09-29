import sharp from 'sharp';
import type {GeometrySuggestion} from '../../shared/mapGeometryDraft.js';

export type LocalWallOptions={threshold:number;polarity:'dark'|'light';minLengthSquares:number};
export const DEFAULT_LOCAL_WALL_OPTIONS:LocalWallOptions={threshold:90,polarity:'dark',minLengthSquares:2};
export function localWallOptions(value:any):LocalWallOptions {
  const opts={...DEFAULT_LOCAL_WALL_OPTIONS,...value};
  if(!Number.isFinite(opts.threshold)||opts.threshold<0||opts.threshold>255||!['dark','light'].includes(opts.polarity)
    ||!Number.isFinite(opts.minLengthSquares)||opts.minLengthSquares<1||opts.minLengthSquares>10)throw new Error('Invalid local wall detection settings.');
  return {threshold:opts.threshold,polarity:opts.polarity,minLengthSquares:opts.minLengthSquares};
}

/** Contrast-band heuristic, intentionally no model or network calls. Best on clean top-down plans.
 * Scan both axes, bridge tiny masonry seams, merge adjacent runs, reject broad floor masses.
 * Door-sized gaps stay unbridged. Low confidence requires explicit DM selection. */
export async function detectLocalWalls(image:Buffer,originalWidth:number,gridSizePx:number,options:LocalWallOptions):Promise<GeometrySuggestion[]> {
  const {data,info}=await sharp(image).rotate().resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).greyscale().median(3).raw().toBuffer({resolveWithObject:true});
  const grid=Math.max(3,gridSizePx*info.width/originalWidth),minimum=Math.max(8,grid*options.minLengthSquares);
  const gapLimit=Math.max(0,Math.floor(grid*.1)),maxThickness=Math.max(3,grid*.75);
  const on=(x:number,y:number)=>options.polarity==='dark'?data[y*info.width+x]<options.threshold:data[y*info.width+x]>options.threshold;
  type Box={a:number;b:number;start:number;end:number};
  const candidates:{ax:number;ay:number;bx:number;by:number}[]=[];
  for(const vertical of [false,true]) {
    const length=vertical?info.height:info.width,rows=vertical?info.width:info.height;
    let active:Box[]=[];
    const finish=(box:Box)=>{
      if(box.a===0||box.b>=length||box.end-box.start<2||box.end-box.start>maxThickness||box.b-box.a<3*(box.end-box.start))return;
      candidates.push(vertical?{ax:box.start,ay:box.a,bx:box.end,by:box.b}:{ax:box.a,ay:box.start,bx:box.b,by:box.end});
    };
    for(let row=0;row<=rows;row++) {
      const runs:{a:number;b:number}[]=[];
      if(row<rows){
        let start=-1,last=-1;
        for(let col=0;col<=length+gapLimit;col++) {
          if(col<length&&(vertical?on(row,col):on(col,row))){if(start<0)start=col;last=col;}
          else if(start>=0&&col-last>gapLimit){if(last+1-start>=minimum)runs.push({a:start,b:last+1});start=-1;}
        }
      }
      const next:Box[]=[];
      for(const run of runs) {
        const index=active.findIndex(b=>Math.abs(b.a-run.a)<=Math.max(2,grid*.15)&&Math.abs(b.b-run.b)<=Math.max(2,grid*.15));
        if(index<0)next.push({...run,start:row,end:row+1});
        else {const [box]=active.splice(index,1);next.push({a:Math.max(box.a,run.a),b:Math.min(box.b,run.b),start:box.start,end:row+1});}
      }
      active.forEach(finish);active=next;
    }
  }
  return candidates.sort((a,b)=>(b.bx-b.ax)*(b.by-b.ay)-(a.bx-a.ax)*(a.by-a.ay)).slice(0,120).map((box,index)=>({
    id:`item-${index}`,kind:'wall',label:`Contrast wall ${index+1}`,ax:box.ax/info.width,ay:box.ay/info.height,bx:box.bx/info.width,by:box.by/info.height,heightFt:10,confidence:.55,
  }));
}
