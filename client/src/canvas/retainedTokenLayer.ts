import Konva from 'konva';
import type {SceneCanvas} from 'konva/lib/Canvas';
import {dirtyRegions,overlaps,sameRect,type PaintRect} from '../../../shared/dirtyRegions';
type Entry={node:Konva.Node;scene:PaintRect|null;hit:PaintRect|null;sceneDirty:boolean;hitDirty:boolean;force:boolean;art?:Konva.Node};
type Retained={invalidate:(node:Konva.Node)=>void;dispose:()=>void};
const installed=new WeakMap<Konva.Layer,Retained>();
/** Decoration changes are explicit; transform/listening changes are observed.
 * Padded perspective canvases retain pixels before their CSS projection. Layers
 * with visible tools use Konva's full paint until those tools are dismissed. */
export function invalidateRetainedToken(node:Konva.Node|null){
 const layer=node?.getLayer();if(layer&&node)installed.get(layer)?.invalidate(node);
}
export function installRetainedTokenLayer(layer:Konva.Layer,perspectiveBuffer?:SceneCanvas){
 installed.get(layer)?.dispose();
 const originalScene=layer.drawScene,originalHit=layer.drawHit,entries=new Map<Konva.Node,Entry>();
 const stats={fullScene:0,partialScene:0,skippedScene:0,sceneNodes:0,scenePixels:0,fullHit:0,partialHit:0,skippedHit:0,hitNodes:0,toolFrames:0};
 layer.attrs.retainedStats=stats;
 let fullScene=true,fullHit=true,size='',wasDragging=false,sceneOrder:Konva.Node[]=[],hadTools=false;
 const origin=():{x:number;y:number}=>layer.getAttr('retainedCanvasOrigin')??{x:0,y:0};
 const hasTools=(children:Konva.Node[])=>children.some(node=>!node.hasName('token')&&node.isVisible());
 const removedScene:(PaintRect|null)[]=[],removedHit:(PaintRect|null)[]=[];
 const touch=(entry:Entry,force:boolean)=>{entry.sceneDirty=true;entry.hitDirty=true;entry.force ||= force;};
 const sync=()=>{
  const children=layer.getChildren(),live=new Set<Konva.Node>(children);
  for(const [node,e] of entries)if(!live.has(node)){
   removedScene.push(e.scene);removedHit.push(e.hit);node.off('.retainedToken');e.art?.off('.retainedToken');entries.delete(node);
  }
  for(const node of children)if(!entries.has(node)){
   const entry:Entry={node,scene:null,hit:null,sceneDirty:true,hitDirty:true,force:true};entries.set(node,entry);
   node.on('xChange.retainedToken yChange.retainedToken scaleXChange.retainedToken scaleYChange.retainedToken rotationChange.retainedToken',()=>touch(entry,false));
   node.on('opacityChange.retainedToken visibleChange.retainedToken listeningChange.retainedToken retainedRadiusChange.retainedToken imageChange.retainedToken widthChange.retainedToken heightChange.retainedToken',()=>touch(entry,true));
   if(node instanceof Konva.Group){entry.art=node.findOne('.token-art');entry.art?.on('xChange.retainedToken yChange.retainedToken',()=>touch(entry,false));}
  }
  const canvas=layer.getCanvas(),offset=origin(),key=[canvas.width,canvas.height,canvas.pixelRatio,offset.x,offset.y].join(':');
  if(key!==size){size=key;fullScene=fullHit=true;}
  return children;
 };
 const rawBounds=(node:Konva.Node,hit:boolean):PaintRect|null=>{
  if(!node.isVisible()||node.getAbsoluteOpacity()===0||hit&&!node.isListening())return null;
  if(hit&&node.hasName('token')){
   const r=node.getAttr('retainedRadius') as number;
   if(r){const transform=node.getAbsoluteTransform(),a=transform.point({x:-r,y:-r}),b=transform.point({x:r,y:r});return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)};}
  }
  if(hit&&!node.hasName('token'))return null;
  const rect=node.getClientRect();return rect.width&&rect.height?rect:null;
 };
 const bounds=(node:Konva.Node,hit:boolean)=>{const rect=rawBounds(node,hit),offset=origin();return rect?{...rect,x:rect.x+offset.x,y:rect.y+offset.y}:null;};
 const invalidate=(node:Konva.Node)=>{
  while(node.getParent()&&node.getParent()!==layer)node=node.getParent()!;
  const entry=entries.get(node);if(entry)touch(entry,true);
  layer.batchDraw();
 };
 layer.on('xChange.retainedToken yChange.retainedToken scaleXChange.retainedToken scaleYChange.retainedToken rotationChange.retainedToken opacityChange.retainedToken visibleChange.retainedToken',()=>{fullScene=fullHit=true;});
 layer.on('listeningChange.retainedToken',()=>{fullHit=true;});
 layer.drawScene=function(canvas,top,buffer){
  if(canvas&&canvas!==layer.getCanvas()||top)return originalScene.call(layer,canvas,top,buffer);
  const children=sync(),native=layer.getCanvas(),width=native.width/native.pixelRatio,height=native.height/native.pixelRatio;
  if(hasTools(children)){hadTools=true;fullScene=fullHit=true;stats.toolFrames++;return originalScene.call(layer,canvas,top,buffer);}
  if(hadTools){hadTools=false;fullScene=fullHit=true;}
  const changed=removedScene.splice(0);
  for(const e of entries.values())if(fullScene||e.sceneDirty){
   const next=bounds(e.node,false);if(e.force||!sameRect(e.scene,next))changed.push(e.scene,next);
   e.scene=next;e.sceneDirty=false;e.force=false;
  }
  // Reordering painted nodes changes occlusion even when their bounds are identical.
  const order:Konva.Node[]=children.filter(n=>entries.get(n)?.scene),oldLive=sceneOrder.filter(n=>order.includes(n)),oldSet=new Set(oldLive),common=order.filter(n=>oldSet.has(n));
  if(common.some((n,i)=>n!==oldLive[i]))for(const n of common)changed.push(entries.get(n)!.scene);
  sceneOrder=order;
  let regions=dirtyRegions(changed,width,height);
  if(fullScene||regions.length>48||regions.reduce((sum,r)=>sum+r.width*r.height,0)>width*height*.65){regions=[{x:0,y:0,width,height}];fullScene=false;stats.fullScene++;}
  else if(regions.length)stats.partialScene++;else stats.skippedScene++;
  layer.fire('beforeDraw',{node:layer});
  if(regions.length){
   const context=native.getContext(),offset=origin();context.save();context.translate(-offset.x,-offset.y);context.beginPath();
   for(const r of regions){context.clearRect(r.x,r.y,r.width,r.height);context.rect(r.x,r.y,r.width,r.height);stats.scenePixels+=r.width*r.height;}
   context.clip();
   context.translate(offset.x,offset.y);
   for(const node of children){const rect=entries.get(node)?.scene;if(rect&&regions.some(r=>overlaps(rect,r))){node.drawScene(native,undefined,buffer??perspectiveBuffer);stats.sceneNodes++;}}
   context.restore();
  }
  layer.fire('draw',{node:layer});return layer;
 };
 layer.drawHit=function(canvas,top){
  if(canvas&&canvas!==layer.getHitCanvas()||top)return originalHit.call(layer,canvas,top);
  // Konva owns the pointer while dragging. Keep the unchanged hit map until
  // release, then refresh it; clearing it during a drag loses stationary targets.
  if(Konva.isDragging()){wasDragging=true;stats.skippedHit++;return layer;}
  if(wasDragging){fullHit=true;wasDragging=false;}
  const children=sync(),native=layer.getHitCanvas(),width=native.width/native.pixelRatio,height=native.height/native.pixelRatio;
  if(hasTools(children)){fullHit=true;return originalHit.call(layer,canvas,top);}
  const changed=removedHit.splice(0);
  for(const e of entries.values())if(fullHit||e.hitDirty){const next=bounds(e.node,true);changed.push(e.hit,next);e.hit=next;e.hitDirty=false;}
  let regions=dirtyRegions(changed,width,height);
  if(fullHit||regions.length>48||regions.reduce((sum,r)=>sum+r.width*r.height,0)>width*height*.65){regions=[{x:0,y:0,width,height}];fullHit=false;stats.fullHit++;}
  else if(regions.length)stats.partialHit++;else stats.skippedHit++;
  if(regions.length){const context=native.getContext(),offset=origin();context.save();context.translate(-offset.x,-offset.y);context.beginPath();for(const r of regions){context.clearRect(r.x,r.y,r.width,r.height);context.rect(r.x,r.y,r.width,r.height);}context.clip();context.translate(offset.x,offset.y);
   for(const node of children){const rect=entries.get(node)?.hit;if(rect&&regions.some(r=>overlaps(rect,r))){node.drawHit(native);stats.hitNodes++;}}
   context.restore();
  }
  return layer;
 };
 const dispose=()=>{
  layer.drawScene=originalScene;layer.drawHit=originalHit;layer.off('.retainedToken');
  for(const e of entries.values()){e.node.off('.retainedToken');e.art?.off('.retainedToken');}
  installed.delete(layer);delete layer.attrs.retainedStats;layer.batchDraw();
 };
 installed.set(layer,{invalidate,dispose});layer.batchDraw();return dispose;
}
