import {useSyncExternalStore} from 'react';
const key='dnd-server-rendering',event='dnd-server-rendering-change';
export function readServerRendering(){try{return localStorage.getItem(key)!=='off';}catch{return true;}}
export function setServerRendering(enabled:boolean){
 try{localStorage.setItem(key,enabled?'on':'off');}catch{}
 window.dispatchEvent(new Event(event));
}
export function useServerRendering(){
 return useSyncExternalStore(listener=>{
  window.addEventListener(event,listener);window.addEventListener('storage',listener);
  return()=>{window.removeEventListener(event,listener);window.removeEventListener('storage',listener);};
 },readServerRendering,()=>true);
}
