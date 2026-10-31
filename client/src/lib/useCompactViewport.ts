import {useEffect,useState} from 'react';

// Include a phone held sideways; larger tablet and desktop layouts stay intact.
export const COMPACT_VIEWPORT='(max-width: 600px), (max-width: 1000px) and (max-height: 500px)';
// Toolbars need grouping on tablets and mobile desktop-site viewports too.
// Keep this independent of the narrower character-panel presentation.
export const COMPACT_TOOLBAR_VIEWPORT='(max-width: 1000px), (max-width: 1366px) and (pointer: coarse)';
export function useCompactViewport(media=COMPACT_VIEWPORT){
 const [compact,setCompact]=useState(()=>matchMedia(media).matches);
 useEffect(()=>{const query=matchMedia(media),change=()=>setCompact(query.matches);change();query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[media]);
 return compact;
}
