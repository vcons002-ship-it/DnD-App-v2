import {forwardRef,useImperativeHandle,useLayoutEffect,useRef} from 'react';
import type {RasterAsset} from '../../../shared/serverRendering';
import type {BattlefieldView} from './miniatureProjection';
import {renderedImage} from '../lib/renderImages';
export type RasterPlaneHandle={frame:(index:number)=>void;camera:(view:BattlefieldView)=>void};
/** A decoded server atlas is moved with CSS. No canvas filtering, visibility
 * calculation, image decoding or React state change happens per animation tick. */
export const LegacyRasterPlane=forwardRef<RasterPlaneHandle,{asset:RasterAsset;bounds:Omit<RasterAsset,'key'>;view:BattlefieldView;columns?:number;frameWidth?:number;frameHeight?:number;testId?:string}>(function LegacyRasterPlane(p,ref){
 const img=useRef<HTMLImageElement>(null),plane=useRef<HTMLDivElement>(null),scaled=useRef<HTMLDivElement>(null),index=useRef(0),latest=useRef(p);latest.current=p;
 const placement=useRef('');
 const camera=(view:BattlefieldView)=>{const b=latest.current.bounds,k=view.scale/b.scale,key=[view.x,view.y,view.scale,b.x,b.y,b.width,b.height,b.scale].join(':');if(placement.current===key)return;placement.current=key;if(plane.current){Object.assign(plane.current.style,{left:`${view.x+b.x*view.scale}px`,top:`${view.y+b.y*view.scale}px`,width:`${b.width*k}px`,height:`${b.height*k}px`});}if(scaled.current)scaled.current.style.transform=`scale(${k})`;};
 const paint=(value:number)=>{index.current=value;const v=latest.current;if(!img.current)return;const col=value%(v.columns??1),row=Math.floor(value/(v.columns??1));img.current.style.transform=`translate(${-col*(v.frameWidth??v.asset.width)}px,${-row*(v.frameHeight??v.asset.height)}px)`;img.current.dataset.frame=String(value);};
 useImperativeHandle(ref,()=>({frame:paint,camera}),[]);useLayoutEffect(()=>paint(p.columns?index.current:0),[p.asset,p.columns]);useLayoutEffect(()=>camera(p.view));
 const picture=renderedImage(p.asset.key),b=p.bounds,k=p.view.scale/b.scale;
 if(!picture)return null;
 return <div ref={plane} data-testid={p.testId} data-world-x={b.x} data-world-y={b.y} data-raster-scale={b.scale} style={{position:'absolute',left:p.view.x+b.x*p.view.scale,top:p.view.y+b.y*p.view.scale,width:b.width*k,height:b.height*k,overflow:'hidden',pointerEvents:'none'}}><div ref={scaled} style={{width:p.asset.width,height:p.asset.height,transform:`scale(${k})`,transformOrigin:'0 0'}}><img ref={img} src={picture.src} draggable={false} alt="" style={{position:'absolute',left:0,top:0,width:p.asset.width,height:p.asset.height,maxWidth:'none',willChange:p.columns?'transform':undefined}}/></div></div>;
});
