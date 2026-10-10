/** Visual shadow scheduling only; doors, fog and combat never use this clock. */
export function shadowRefreshDue(now:number,last:number,key:string,renderedKey:string,force:boolean,fps=30){
  return (force||key!==renderedKey)&&(force||!Number.isFinite(last)||now-last>=1000/fps-.5);
}
/** Point-source projection onto the map plane; contact vertices stay attached. */
export function projectFloorShadow(point:{x:number;y:number;z:number},source:{x:number;y:number;z:number},floor=0){
  const height=Math.max(.001,source.y-floor),separation=Math.max(height*.08,source.y-point.y);
  const stretch=Math.max(0,point.y-floor)/separation;
  return {x:point.x+(point.x-source.x)*stretch,y:floor,z:point.z+(point.z-source.z)*stretch};
}
