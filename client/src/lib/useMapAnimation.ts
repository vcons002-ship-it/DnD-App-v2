import {useSyncExternalStore} from 'react';
const key='dnd-map-animation',event='dnd-map-animation-change';
const read=()=>{try{const saved=localStorage.getItem(key);return saved?saved!=='off':!window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{return true;}};
export function useMapAnimation(){
 const enabled=useSyncExternalStore(f=>{window.addEventListener(event,f);window.addEventListener('storage',f);return()=>{window.removeEventListener(event,f);window.removeEventListener('storage',f);};},read,()=>true);
 return {enabled,setEnabled(value:boolean){try{localStorage.setItem(key,value?'on':'off');}catch{}window.dispatchEvent(new Event(event));}};
}
