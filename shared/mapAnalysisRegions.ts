/** Rectangles in normalized original-image coordinates, independent of grid/view. */
export type MapAnalysisRegion={ax:number;ay:number;bx:number;by:number};
export const MAX_MAP_ANALYSIS_REGIONS=8;
export function parseMapAnalysisRegions(raw:unknown):MapAnalysisRegion[]|undefined{
 if(raw===undefined)return undefined;
 if(!Array.isArray(raw)||!raw.length||raw.length>MAX_MAP_ANALYSIS_REGIONS)throw Error(`Select between 1 and ${MAX_MAP_ANALYSIS_REGIONS} map regions.`);
 const regions=raw.map(r=>{
  if(!r||![r.ax,r.ay,r.bx,r.by].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)||r.bx<=r.ax||r.by<=r.ay)throw Error('Analysis regions must be non-empty rectangles within the map.');
  return {ax:r.ax,ay:r.ay,bx:r.bx,by:r.by};
 });
 for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++)if(Math.min(regions[i].bx,regions[j].bx)>Math.max(regions[i].ax,regions[j].ax)&&Math.min(regions[i].by,regions[j].by)>Math.max(regions[i].ay,regions[j].ay))throw Error('Analysis regions overlap. Draw separate regions or use one larger region.');
 return regions;
}
