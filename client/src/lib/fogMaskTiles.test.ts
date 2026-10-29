import {it,expect,vi} from 'vitest';
import {FogMaskTiles,FOG_TILE_CELLS} from './fogMaskTiles';

function fixture(bounds={left:-128,top:-128,right:128,bottom:128}){
 const operations:{fill:ReturnType<typeof vi.fn>;clear:ReturnType<typeof vi.fn>}[]=[];
 const mask=new FogMaskTiles(bounds,'#000',()=>{
  const entry={fill:vi.fn(),clear:vi.fn()};operations.push(entry);
  return {getContext:()=>({fillRect:entry.fill,clearRect:entry.clear})} as unknown as HTMLCanvasElement;
 });
 return {mask,operations};
}
it('allocates only requested tiles and updates changed cells in those retained images',()=>{
 const {mask,operations}=fixture({left:0,top:0,right:10000,bottom:10000});
 mask.sync(new Set(['1,2','70,2']));expect(mask.stats.tileBuilds).toBe(0);
 const a=mask.tile(0,0);expect(operations[0].clear).toHaveBeenCalledWith(1,2,1,1);
 expect(mask.tile(0,0)).toBe(a);expect(mask.stats.tileBuilds).toBe(1);
 mask.sync(new Set(['1,2','2,3','70,2']));expect(mask.stats.cellEdits).toBe(1);
 expect(operations[0].clear).toHaveBeenLastCalledWith(2,3,1,1);
 mask.sync(new Set(['2,3','70,2']));expect(operations[0].fill).toHaveBeenLastCalledWith(1,2,1,1);
 expect(mask.stats.tileBuilds).toBe(1);expect(mask.stats.coveredCells).toBe(100000000-2);
});
it('handles negative tile coordinates, repeated edits and re-covering without stale pixels',()=>{
 const {mask,operations}=fixture();mask.sync(new Set(['-1,-65','-64,-64']));
 mask.tile(-1,-2);expect(operations[0].clear).toHaveBeenCalledWith(63,63,1,1);
 mask.paint('-1,-65',false);expect(operations[0].fill).toHaveBeenLastCalledWith(63,63,1,1);
 const edits=mask.stats.cellEdits;mask.paint('-1,-65',false);expect(mask.stats.cellEdits).toBe(edits);
 mask.sync(new Set());expect(mask.stats.coveredCells).toBe(256*256);
});
it('skips a completely revealed tile/map and ignores out-of-map and malformed coverage',()=>{
 const {mask}=fixture({left:0,top:0,right:64,bottom:64});
 const revealed=new Set<string>();for(let y=0;y<64;y++)for(let x=0;x<64;x++)revealed.add(`${x},${y}`);
 revealed.add('10000,10000');revealed.add('01,0');revealed.add('NaN,0');
 mask.sync(revealed);expect(mask.stats.coveredCells).toBe(0);expect(mask.tile(0,0)).toBeNull();expect(mask.stats.tileBuilds).toBe(0);
 mask.paint('4,5',false);expect(mask.stats.coveredCells).toBe(1);expect(mask.tile(0,0)).not.toBeNull();
 expect(FOG_TILE_CELLS).toBe(64);
});
