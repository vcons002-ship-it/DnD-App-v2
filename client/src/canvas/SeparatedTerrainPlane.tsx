import {forwardRef,useImperativeHandle,useLayoutEffect,useRef} from 'react';
import type {LegacyMotionAtlas} from '../../../shared/legacyMotion';
import type {BattlefieldView} from './miniatureProjection';
import type {RasterPlaneHandle} from './LegacyRasterPlane';
import {renderedImage} from '../lib/renderImages';

/** Linear interpolation of retained artwork variants. Complementary alpha masks
 * plus additive premultiplied composition preserve translucent artwork too. */
export const SeparatedTerrainPlane=forwardRef<RasterPlaneHandle,{atlas:LegacyMotionAtlas;view:BattlefieldView}>(function SeparatedTerrainPlane({atlas,view},ref){
 const root=useRef<HTMLDivElement>(null),layers=useRef<(HTMLImageElement|null)[]>([]),latest=useRef({atlas,view}),index=useRef(0);latest.current={atlas,view};
 const camera=(v:BattlefieldView)=>{const b=latest.current.atlas.bounds;if(root.current)root.current.style.transform=`translate(${v.x+b.x*v.scale}px,${v.y+b.y*v.scale}px) scale(${v.scale/b.scale})`;};
 const paint=(i:number)=>{index.current=i;const a=latest.current.atlas,col=i%a.columns,row=Math.floor(i/a.columns);
  for(const [n,img] of layers.current.entries())if(img){img.style.maskPosition=`${n===0?'0px 0px, ':''}${-col*a.frameWidth}px ${-row*a.frameHeight}px`;img.dataset.frame=String(i);}
 };
 useImperativeHandle(ref,()=>({camera,frame:paint}),[]);useLayoutEffect(()=>{camera(view);paint(atlas.count===1?0:Math.min(index.current,atlas.count-1));});
 const color=renderedImage(atlas.colorBase?.key),gray=renderedImage(atlas.base?.key),mask=renderedImage(atlas.lightMask?.key);
 if(!color||!gray||!mask)return null;
 return <div ref={root} data-testid="separated-terrain" style={{position:'absolute',left:0,top:0,width:atlas.frameWidth,height:atlas.frameHeight,transformOrigin:'0 0',isolation:'isolate',pointerEvents:'none'}}>
  {[gray,color].map((picture,i)=><img key={i} ref={el=>{layers.current[i]=el;}} src={picture.src} alt="" draggable={false} style={{position:'absolute',inset:0,width:atlas.frameWidth,height:atlas.frameHeight,maxWidth:'none',mixBlendMode:'plus-lighter',maskImage:`${i===0?'linear-gradient(#000,#000), ':''}url("${mask.src}")`,maskComposite:i===0?'exclude':undefined,maskRepeat:'no-repeat',maskMode:'alpha'}}/>)}
 </div>;
});
