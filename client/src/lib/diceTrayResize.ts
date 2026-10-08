/** Physical growth inside the fixed roll viewport; the outer card never scales. */
export function trayResizeAt(from:number,to:number,elapsedMs:number){
 const progress=Math.max(0,Math.min(1,elapsedMs/460));
 const ease=progress*progress*(3-2*progress);
 const scale=from+(to-from)*ease;
 // Smaller trays leave space around their rim; bigger pools use more of it.
 const footprint=(s:number)=>.66+.32*(1-1/(s*s));
 const viewScale=from/footprint(from)+(to/footprint(to)-from/footprint(from))*ease;
 return {progress,scale,viewScale};
}
