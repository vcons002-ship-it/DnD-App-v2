import {forwardRef,useImperativeHandle,useLayoutEffect,useMemo,useRef,useEffect} from 'react';
import {Shape} from 'react-konva';
import type Konva from 'konva';
import {FogMaskTiles,FOG_TILE_CELLS,type FogCellBounds} from '../lib/fogMaskTiles';

export type ManualFogHandle={preview:(cells:readonly string[],reveal:boolean)=>void};
type Props={id:string;grid:number;bounds:FogCellBounds;revealed:ReadonlySet<string>;color:string;opacity:number;name:string};

/** Cached cell masks remain in map coordinates. Panning only draws visible
 * tile images, including the overscan required by the tilted board. */
export const ManualFog=forwardRef<ManualFogHandle,Props>(function ManualFog(props,ref){
 const {id,grid,bounds,revealed,color,opacity,name}=props;
 const shape=useRef<Konva.Shape>(null),source=useRef(revealed);source.current=revealed;
 const cache=useMemo(()=>new FogMaskTiles(bounds,color),[id,color,bounds.left,bounds.right,bounds.top,bounds.bottom]);
 const pending=useRef(new Map<string,boolean>()),expiry=useRef<ReturnType<typeof setTimeout>>();
 const atlas=useRef<{cache:FogMaskTiles;key:string;canvas:HTMLCanvasElement}>();
 const redraw=()=>shape.current?.getLayer()?.batchDraw();
 useLayoutEffect(()=>{
  cache.sync(revealed);
  for(const [key,visible] of pending.current){
   if(revealed.has(key)===visible)pending.current.delete(key);else cache.paint(key,visible);
  }
  redraw();
 },[cache,revealed]);
 useEffect(()=>()=>{pending.current.clear();clearTimeout(expiry.current);},[cache]);
 useImperativeHandle(ref,()=>({preview(cells,reveal){
  for(const key of cells){pending.current.set(key,reveal);cache.paint(key,reveal);}
  redraw();clearTimeout(expiry.current);
  // DM-only optimistic paint never authorizes a player's visibility. Revert
  // any unacknowledged preview if the server rejects or loses the command.
  expiry.current=setTimeout(()=>{pending.current.clear();cache.sync(source.current);redraw();},2000);
 }}),[cache]);
 return <Shape ref={shape} name={name} listening={false} opacity={opacity} fogStats={cache.stats} sceneFunc={(context,node)=>{
  cache.stats.draws++;
  if(!cache.stats.coveredCells)return;
  const layer=node.getLayer();if(!layer)return;
  const canvas=layer.getCanvas(),pad=layer.getAttr('retainedCanvasOrigin')??{x:0,y:0};
  const inverse=node.getAbsoluteTransform().copy().invert();
  const corners=[{x:-pad.x,y:-pad.y},{x:canvas.width/canvas.pixelRatio-pad.x,y:canvas.height/canvas.pixelRatio-pad.y}].map(p=>inverse.point(p));
  const left=Math.max(bounds.left,Math.floor(Math.min(...corners.map(p=>p.x))/grid)-1);
  const top=Math.max(bounds.top,Math.floor(Math.min(...corners.map(p=>p.y))/grid)-1);
  const right=Math.min(bounds.right,Math.ceil(Math.max(...corners.map(p=>p.x))/grid)+1);
  const bottom=Math.min(bounds.bottom,Math.ceil(Math.max(...corners.map(p=>p.y))/grid)+1);
  if(left>=right||top>=bottom)return;
  const tx=Math.floor(left/FOG_TILE_CELLS),ty=Math.floor(top/FOG_TILE_CELLS),rx=Math.ceil(right/FOG_TILE_CELLS),by=Math.ceil(bottom/FOG_TILE_CELLS);
  const key=[tx,ty,rx,by,cache.stats.revision].join(':');
  if(atlas.current?.cache!==cache||atlas.current.key!==key){
   const image=atlas.current?.cache===cache?atlas.current.canvas:document.createElement('canvas');
   image.width=(rx-tx)*FOG_TILE_CELLS;image.height=(by-ty)*FOG_TILE_CELLS;
   const ctx=image.getContext('2d')!;ctx.imageSmoothingEnabled=false;
   // Integer cell coordinates avoid fractional seams inside the image. Draw
   // the entire visible mask once, so DM translucency never overlaps either.
   for(let y=ty;y<by;y++)for(let x=tx;x<rx;x++){
    const tile=cache.tile(x,y);if(!tile)continue;
    ctx.drawImage(tile,(x-tx)*FOG_TILE_CELLS,(y-ty)*FOG_TILE_CELLS);cache.stats.tilesDrawn++;
   }
   atlas.current={cache,key,canvas:image};cache.stats.compositions++;
  }
  context.save();context.beginPath();context.rect(bounds.left*grid,bounds.top*grid,(bounds.right-bounds.left)*grid,(bounds.bottom-bounds.top)*grid);context.clip();
  context._context.imageSmoothingEnabled=false;
  const image=atlas.current.canvas;
  context.drawImage(image,tx*FOG_TILE_CELLS*grid,ty*FOG_TILE_CELLS*grid,image.width*grid,image.height*grid);
  context.restore();
 }}/>;
});
