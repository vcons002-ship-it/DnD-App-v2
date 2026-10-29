import {useSyncExternalStore} from 'react';

export type DiceRenderingPreference='auto'|'3d'|'2d';
const key='dnd-dice-rendering',event='dnd-dice-rendering-change';
let unavailable=false;
let generation=0;
export const diceGraphicsGeneration=()=>generation;
export function readDiceRenderingPreference():DiceRenderingPreference{
 try{const value=localStorage.getItem(key);return value==='3d'||value==='2d'?value:'auto';}catch{return 'auto';}
}
export const readDiceRenderingMode=() => readDiceRenderingPreference()==='2d'||unavailable?'2d' as const:'3d' as const;
export function reportDiceGraphicsFailure(){if(!unavailable){unavailable=true;generation++;window.dispatchEvent(new Event(event));}}
function subscribe(listener:()=>void){window.addEventListener(event,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(event,listener);window.removeEventListener('storage',listener);};}
export function useDiceRendering(){
 const preference=useSyncExternalStore(subscribe,readDiceRenderingPreference,()=> 'auto' as const);
 const mode=useSyncExternalStore(subscribe,readDiceRenderingMode,()=> '2d' as const);
 const setPreference=(value:DiceRenderingPreference)=>{try{localStorage.setItem(key,value);}catch{return;}unavailable=false;window.dispatchEvent(new Event(event));};
 return {preference,mode,setPreference};
}
