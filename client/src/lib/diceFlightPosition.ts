/** DOM rectangles include CSS zoom; translate() coordinates do not. */
export function diceFlightPoint(root:{left:number;top:number;width:number},localWidth:number,x:number,y:number){
 const scale=root.width/localWidth||1;
 return {x:(x-root.left)/scale,y:(y-root.top)/scale};
}

export const DIE_FLASH_MS=460;
export const DIE_FLIGHT_MS=650;
export const DIE_REVEAL_MS=DIE_FLASH_MS+DIE_FLIGHT_MS;
/** The flash stays on the face. Only the lift-off phase travels to the box. */
export function diceFlightKeyframes(sx:number,sy:number,tx:number,ty:number,emphasis:number):{offset:number;transform:string;opacity:number}[]{
 const pose=(x:number,y:number,scale=1)=>`translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${scale})`;
 const frames:{offset:number;transform:string;opacity:number}[]=[
  {offset:0,transform:pose(sx,sy),opacity:1},
  {offset:120/DIE_REVEAL_MS,transform:pose(sx,sy,1.18+emphasis*.65),opacity:1},
  {offset:DIE_FLASH_MS/DIE_REVEAL_MS,transform:pose(sx,sy),opacity:1},
 ];
 for(let i=1;i<=40;i++){
  const p=i/40,travel=p*p*(3-2*p);
  frames.push({offset:(DIE_FLASH_MS+p*DIE_FLIGHT_MS)/DIE_REVEAL_MS,
   transform:pose(sx+(tx-sx)*travel,sy+(ty-sy)*travel-Math.sin(travel*Math.PI)*Math.min(65,Math.abs(ty-sy)*.2),1-travel*.0625),opacity:1});
 }
 return frames;
}
