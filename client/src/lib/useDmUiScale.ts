import {useEffect,useState} from 'react';
import {safeSetItem} from './storage';
const key='dnd:dm-ui-scale:v1',eventName='dnd:dm-ui-scale';
function readScale(){try{const value=Number(localStorage.getItem(key));return Number.isFinite(value)&&value>=.7&&value<=1.4?value:1;}catch{return 1;}}
export function useDmUiScale(){
 const [scale,setScale]=useState(readScale);
 useEffect(()=>{const sync=()=>setScale(readScale());window.addEventListener(eventName,sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener(eventName,sync);window.removeEventListener('storage',sync);};},[]);
 useEffect(()=>{document.documentElement.style.setProperty('--dm-ui-scale',String(scale));},[scale]);
 return {scale,setScale:(value:number)=>{const next=Math.max(.7,Math.min(1.4,value));safeSetItem(key,String(next));setScale(next);window.dispatchEvent(new Event(eventName));}};
}
