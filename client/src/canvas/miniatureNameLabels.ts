import Konva from 'konva';
import {invalidateRetainedToken} from './retainedTokenLayer';

export type MiniatureNameLabel = {
  id: string;
  canvas: HTMLCanvasElement;
  /** Top-left, top-right, bottom-left, bottom-right in map coordinates. */
  points: {x:number;y:number}[];
  opacity: number;
  emphasized: boolean;
};

const depthHudSelector='.token-label, .token-tracking-tag, .token-health';

/** GPU names/health replace only the scene paint; their Konva nodes retain typography
 * and transforms for texture generation. Opacity zero still makes Konva paint
 * stroked text through a full-layer perfect-draw buffer on every movement. */
export function setMiniatureNamesRendered(layer:Konva.Layer,ids:ReadonlySet<string>) {
  let changed=false;
  for(const node of layer.getChildren().filter((n):n is Konva.Group=>n instanceof Konva.Group&&n.hasName('token'))) {
    const visible=!ids.has(node.getAttr('tokenId'));
    const version=node.getAttr('tokenLabelVersion');
    const old=paintSuppression.get(node);
    if(old?.visible===visible&&old.version===version)continue;
    paintSuppression.set(node,{visible,version});
    for(const label of node.find(depthHudSelector)) {
      if(label.visible()!==visible){label.visible(visible);invalidateRetainedToken(node);changed=true;}
    }
  }
  if(changed)layer.batchDraw();
}
const paintSuppression=new WeakMap<Konva.Group,{visible:boolean;version:unknown}>();

/** Rasterize the existing name/tag/health HUD only when its content changes.
 * Positions follow the live Konva transforms, including drag and camera rotation. */
export function createMiniatureNameReader() {
  const cache=new Map<string,{key:string;poseKey:string;points:{x:number;y:number}[];node:Konva.Group;hud:Konva.Group;canvas:HTMLCanvasElement;bounds:{x:number;y:number;width:number;height:number}}>();
  return (layer:Konva.Layer|null,emphasized:(id:string)=>boolean):MiniatureNameLabel[]=>{
    if(!layer){cache.clear();return [];}
    const inverse=layer.getAbsoluteTransform().copy().invert();
    const density=Math.min(4,Math.max(2,Math.ceil(layer.scaleX()*Math.min(2,window.devicePixelRatio||1))));
    const present=new Set<string>();
    const result:MiniatureNameLabel[]=[];
    for(const node of layer.getChildren().filter((n):n is Konva.Group=>n instanceof Konva.Group&&n.hasName('token'))) {
      if(!node.visible()||node.getAbsoluteOpacity()<=0)continue;
      const id=node.getAttr('tokenId') as string;
      let entry=cache.get(id);
      const version=node.getAttr('tokenLabelVersion');
      const key=JSON.stringify([density,version]);
      const reusable=entry?.node===node&&entry.key===key&&version!==undefined;
      const hud=reusable?entry!.hud:node.findOne<Konva.Group>('.token-upright-hud');
      if(!hud)continue;
      present.add(id);
      // TokenShape publishes typography/layout and visible HP changes. Motion,
      // selection and torch flicker reuse these HUD pixels.
      if(!reusable){
        const labels=hud.find(depthHudSelector);
        if(!labels.length){cache.delete(id);continue;}
        const group=new Konva.Group({listening:false});
        for(const label of labels)group.add(label.clone({opacity:1,visible:true,listening:false}));
        const b=group.getClientRect();
        const bounds={x:Math.floor(b.x)-1,y:Math.floor(b.y)-1,width:Math.ceil(b.width)+3,height:Math.ceil(b.height)+3};
        const canvas=group.toCanvas({...bounds,pixelRatio:density});
        group.destroy();entry={key,poseKey:'',points:[],node,hud,canvas,bounds};cache.set(id,entry);
      }
      const poseKey=[layer.scaleX(),layer.scaleY(),node.x(),node.y(),hud.x(),hud.y(),hud.rotation()].join(':');
      if(entry!.poseKey!==poseKey){const b=entry!.bounds,matrix=inverse.copy().multiply(hud.getAbsoluteTransform());entry!.points=[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x,y:b.y+b.height},{x:b.x+b.width,y:b.y+b.height}].map(p=>matrix.point(p));entry!.poseKey=poseKey;}const points=entry!.points;
      result.push({id,canvas:entry!.canvas,points,opacity:node.getAbsoluteOpacity(),emphasized:emphasized(id)});
    }
    for(const id of cache.keys())if(!present.has(id))cache.delete(id);
    return result;
  };
}
