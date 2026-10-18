import {useEffect,useState} from 'react';

// Include a phone held sideways; larger tablet and desktop layouts stay intact.
export const COMPACT_VIEWPORT='(max-width: 600px), (max-width: 1000px) and (max-height: 500px)';
export function useCompactViewport(){
 const [compact,setCompact]=useState(()=>matchMedia(COMPACT_VIEWPORT).matches);
 useEffect(()=>{const query=matchMedia(COMPACT_VIEWPORT),change=()=>setCompact(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 return compact;
}
