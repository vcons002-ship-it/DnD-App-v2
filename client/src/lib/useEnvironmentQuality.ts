import {useSyncExternalStore} from 'react';
import type {EnvironmentQuality} from '../../../shared/mapEnvironment';
import {graphicsBudget,parseGraphicsQuality} from '../../../shared/graphicsQuality';
const key='dnd-environment-quality';
const event='dnd-environment-quality-change';
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
  const setQuality=(value:EnvironmentQuality)=>{
    try {localStorage.setItem(key,value);}catch {return;}
    window.dispatchEvent(new Event(event));
  };
  return {quality,setQuality,budget:graphicsBudget(quality,viewportWidth)};
}
/** Capture a stable budget when a dice scene is created; never resize midway through a roll. */
export const currentGraphicsBudget=()=>graphicsBudget(readGraphicsQuality(),window.innerWidth);
