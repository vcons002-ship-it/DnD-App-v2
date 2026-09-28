import {useSyncExternalStore} from 'react';
import type {EnvironmentQuality} from '../../../shared/mapEnvironment';
const key='dnd-environment-quality';
const event='dnd-environment-quality-change';
const read=():EnvironmentQuality=>{
  try {const value=localStorage.getItem(key);return value==='high'||value==='low'||value==='off'?value:'auto';}
  catch {return 'auto';}
};
function subscribe(listener:()=>void){
  window.addEventListener(event,listener);window.addEventListener('storage',listener);
  return()=>{window.removeEventListener(event,listener);window.removeEventListener('storage',listener);};
}
export function useEnvironmentQuality(){
  const quality=useSyncExternalStore(subscribe,read,()=> 'auto' as const);
  const setQuality=(value:EnvironmentQuality)=>{
    try {localStorage.setItem(key,value);}catch {return;}
    window.dispatchEvent(new Event(event));
  };
  return {quality,setQuality};
}
