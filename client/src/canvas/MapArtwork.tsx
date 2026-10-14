import {useEffect,useRef,useState} from 'react';
import {Image,type KonvaNodeEvents} from 'react-konva';
import type Konva from 'konva';
import {useImage} from './useImage';
import {acquireAnimatedMap} from './animatedMapMedia';
import {requestBattlefieldFrame,cancelBattlefieldFrame} from './battlefieldFrame';

/** Local animation setting affects artwork only, never visibility or movement. */
export function MapArtwork({url,videoPath,onPlaybackError,...props}:{url:string;videoPath?:string|null;onPlaybackError?:()=>void}&Omit<Konva.ImageConfig,'image'>&KonvaNodeEvents){
 const poster=useImage(url),node=useRef<Konva.Image>(null);
 const errorHandler=useRef(onPlaybackError);errorHandler.current=onPlaybackError;
 const [video,setVideo]=useState<HTMLVideoElement|null>(null);
 useEffect(()=>{
  setVideo(null);if(!videoPath)return;
  const handle=acquireAnimatedMap(videoPath),e=handle.entry;let pending=0,notified=false;
  const update=()=>{setVideo(e.ready&&!e.failed?e.video:null);if(e.failed&&!notified){notified=true;errorHandler.current?.();}};
  const draw=()=>{if(!pending)pending=requestBattlefieldFrame(()=>{pending=0;node.current?.getLayer()?.draw();});};
  e.listeners.add(update);e.frameListeners.add(draw);update();
  return()=>{cancelBattlefieldFrame(pending);e.listeners.delete(update);e.frameListeners.delete(draw);handle.release();};
 },[videoPath]);
 return poster?<Image {...props} ref={node} image={video??poster}/>:null;
}
