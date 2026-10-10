import {useMemo,useSyncExternalStore} from 'react';
import {createAdaptiveGraphics} from '../../../shared/adaptiveGraphics';
import type {EnvironmentQuality} from '../../../shared/mapEnvironment';
import {graphicsBudget,parseGraphicsQuality} from '../../../shared/graphicsQuality';
const key='dnd-environment-quality';
const event='dnd-environment-quality-change';
const adaptive=createAdaptiveGraphics(typeof window!=='undefined'&&window.innerWidth<900?'balanced':'high');
let warmUntil=0;
/** Loading/shader preparation is excluded, rather than permanently lowering quality after joining. */
export function recordGraphicsFrame(now:number,continuous:boolean,loading:boolean){
  if(loading)warmUntil=now+3000;
  const changed=adaptive.sample(now,readGraphicsQuality()==='auto'&&continuous&&!document.hidden&&now>=warmUntil);
  if(changed)window.dispatchEvent(new Event(event));
}
export const readGraphicsQuality=():EnvironmentQuality=>{
  try {return parseGraphicsQuality(localStorage.getItem(key));}
  catch {return 'auto';}
};
function subscribe(listener:()=>void){
  window.addEventListener(event,listener);window.addEventListener('storage',listener);
  return()=>{window.removeEventListener(event,listener);window.removeEventListener('storage',listener);};
}
export function useEnvironmentQuality(){
  const quality=useSyncExternalStore(subscribe,readGraphicsQuality,()=> 'auto' as const);
  const viewportWidth=useSyncExternalStore(listener=>{window.addEventListener('resize',listener);return()=>window.removeEventListener('resize',listener);},()=>window.innerWidth,()=>1440);
  const autoTier=useSyncExternalStore(subscribe,()=>adaptive.tier,()=> 'high' as const);
  const setQuality=(value:EnvironmentQuality)=>{
    try {localStorage.setItem(key,value);}catch {return;}
    window.dispatchEvent(new Event(event));
  };
  const budget=useMemo(()=>graphicsBudget(quality,viewportWidth,quality==='auto'?(viewportWidth<900&&autoTier==='high'?'balanced':autoTier):undefined),[quality,viewportWidth,autoTier]);
  return {quality,setQuality,budget};
}
/** Capture a stable budget when a dice scene is created; never resize midway through a roll. */
export const currentGraphicsBudget=()=>graphicsBudget(readGraphicsQuality(),window.innerWidth,window.innerWidth<900&&adaptive.tier==='high'?'balanced':adaptive.tier);
