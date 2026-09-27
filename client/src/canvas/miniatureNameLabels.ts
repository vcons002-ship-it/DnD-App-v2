import Konva from 'konva';

export type MiniatureNameLabel = {
  id: string;
  canvas: HTMLCanvasElement;
  /** Top-left, top-right, bottom-left, bottom-right in map coordinates. */
  points: {x:number;y:number}[];
  opacity: number;
  emphasized: boolean;
};

/** Rasterize the existing name/tag typography only when its content changes.
 * Positions follow the live Konva transforms, including drag and camera rotation. */
export function createMiniatureNameReader() {
  const cache=new Map<string,{key:string;canvas:HTMLCanvasElement;bounds:{x:number;y:number;width:number;height:number}}>();
  return (layer:Konva.Layer|null,emphasized:(id:string)=>boolean):MiniatureNameLabel[]=>{
    if(!layer){cache.clear();return [];}
    const inverse=layer.getAbsoluteTransform().copy().invert();
    const density=Math.min(4,Math.max(2,Math.ceil(layer.scaleX()*Math.min(2,window.devicePixelRatio||1))));
    const present=new Set<string>();
    const result:MiniatureNameLabel[]=[];
    for(const node of layer.find<Konva.Group>('.token')) {
      if(!node.visible()||node.getAbsoluteOpacity()<=0)continue;
      const id=node.getAttr('tokenId') as string;
      const hud=node.findOne<Konva.Group>('.token-upright-hud');
      if(!hud)continue;
      const labels=hud.find('.token-label, .token-tracking-tag');
      if(!labels.length)continue;
      present.add(id);
      // The original Konva labels become invisible after their GPU copy renders.
      // Normalize that presentation opacity out of the texture cache key.
      const key=JSON.stringify([density,...labels.map(label=>{
        const obj=label.toObject();obj.attrs={...obj.attrs,opacity:1};return obj;
      })]);
      let entry=cache.get(id);
      if(!entry||entry.key!==key){
        const group=new Konva.Group({listening:false});
        for(const label of labels)group.add(label.clone({opacity:1,listening:false}));
        const b=group.getClientRect();
        const bounds={x:Math.floor(b.x)-1,y:Math.floor(b.y)-1,width:Math.ceil(b.width)+3,height:Math.ceil(b.height)+3};
        const canvas=group.toCanvas({...bounds,pixelRatio:density});
        group.destroy();entry={key,canvas,bounds};cache.set(id,entry);
      }
      const b=entry.bounds,matrix=inverse.copy().multiply(hud.getAbsoluteTransform());
      const points=[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x,y:b.y+b.height},{x:b.x+b.width,y:b.y+b.height}].map(p=>matrix.point(p));
      result.push({id,canvas:entry.canvas,points,opacity:node.getAbsoluteOpacity(),emphasized:emphasized(id)});
    }
    for(const id of cache.keys())if(!present.has(id))cache.delete(id);
    return result;
  };
}
