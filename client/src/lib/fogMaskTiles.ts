export const FOG_TILE_CELLS=64;
export type FogCellBounds={left:number;top:number;right:number;bottom:number};
type Tile={canvas:HTMLCanvasElement;context:CanvasRenderingContext2D};
const cellPoint=(key:string)=>{
 const match=/^(-?\d+),(-?\d+)$/.exec(key);
 if(!match)return;
 const x=Number(match[1]),y=Number(match[2]);
 return Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&`${x},${y}`===key?{x,y}:undefined;
};
const tileKey=(x:number,y:number)=>`${Math.floor(x/FOG_TILE_CELLS)},${Math.floor(y/FOG_TILE_CELLS)}`;

/** One alpha pixel per grid cell. Only visible tiles allocate images; snapshot
 * changes edit cached pixels instead of scanning the whole map during a pan. */
export class FogMaskTiles{
 private revealed=new Set<string>();
 private buckets=new Map<string,Set<string>>();
 private tiles=new Map<string,Tile>();
 readonly stats={updates:0,revision:0,cellEdits:0,tileBuilds:0,compositions:0,draws:0,tilesDrawn:0,coveredCells:0};
 constructor(readonly bounds:FogCellBounds,private color:string,private createCanvas:()=>HTMLCanvasElement=()=>document.createElement('canvas')){
  this.stats.coveredCells=Math.max(0,bounds.right-bounds.left)*Math.max(0,bounds.bottom-bounds.top);
 }
 sync(next:ReadonlySet<string>){
  this.stats.updates++;
  for(const key of this.revealed)if(!next.has(key))this.paint(key,false);
  for(const key of next)if(!this.revealed.has(key))this.paint(key,true);
 }
 paint(key:string,reveal:boolean){
  if(this.revealed.has(key)===reveal)return;
  const p=cellPoint(key);if(!p)return;
  this.stats.revision++;
  const slot=tileKey(p.x,p.y);
  if(reveal){this.revealed.add(key);let bucket=this.buckets.get(slot);if(!bucket)this.buckets.set(slot,bucket=new Set());bucket.add(key);}
  else{this.revealed.delete(key);const bucket=this.buckets.get(slot);bucket?.delete(key);if(!bucket?.size)this.buckets.delete(slot);}
  const b=this.bounds;
  if(p.x>=b.left&&p.x<b.right&&p.y>=b.top&&p.y<b.bottom)this.stats.coveredCells+=reveal?-1:1;
  const tile=this.tiles.get(slot);
  if(tile){
   const x=p.x-Math.floor(p.x/FOG_TILE_CELLS)*FOG_TILE_CELLS,y=p.y-Math.floor(p.y/FOG_TILE_CELLS)*FOG_TILE_CELLS;
   if(reveal)tile.context.clearRect(x,y,1,1);else tile.context.fillRect(x,y,1,1);
   this.stats.cellEdits++;
  }
 }
 tile(x:number,y:number){
  const key=`${x},${y}`,bucket=this.buckets.get(key);
  if(bucket?.size===FOG_TILE_CELLS*FOG_TILE_CELLS)return null;
  let tile=this.tiles.get(key);
  if(!tile){
   const canvas=this.createCanvas();canvas.width=canvas.height=FOG_TILE_CELLS;
   const context=canvas.getContext('2d')!;context.fillStyle=this.color;context.fillRect(0,0,FOG_TILE_CELLS,FOG_TILE_CELLS);
   for(const key of bucket??[]){const p=cellPoint(key)!;context.clearRect(p.x-x*FOG_TILE_CELLS,p.y-y*FOG_TILE_CELLS,1,1);}
   tile={canvas,context};this.stats.tileBuilds++;
  }else this.tiles.delete(key);
  this.tiles.set(key,tile);
  if(this.tiles.size>256)this.tiles.delete(this.tiles.keys().next().value!);
  return tile.canvas;
 }
}
