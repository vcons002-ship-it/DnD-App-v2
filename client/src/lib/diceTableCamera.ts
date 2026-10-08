export type DiceTableSeat={id:string;name:string;themeId:string;x:number;y:number;side:'bottom'|'left'|'right'|'top'};
export const DICE_TABLE_PAN_MS=900;
export const DICE_TABLE_ZOOM_MS=420;

/** The far edge belongs to the DM, never to an arbitrarily hashed player. */
export function diceTableSeats(party:readonly {id:string;name:string;className:string}[],ownId:string|undefined,themeFor:(className:string)=>string):DiceTableSeat[]{
 const ordered=[...party].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 const own=ordered.find(c=>c.id===ownId)??ordered[0];
 const seats:DiceTableSeat[]=own?[{id:own.id,name:own.name,themeId:themeFor(own.className),x:0,y:-18,side:'bottom'}]:[];
 ordered.filter(c=>c!==own).forEach((c,i)=>seats.push({id:c.id,name:c.name,themeId:themeFor(c.className),x:i%2?-24:24,y:Math.floor(i/2)*12,side:i%2?'left':'right'}));
 seats.push({id:'dm',name:'DM',themeId:'dm-neutral-roll',x:0,y:18,side:'top'});
 return seats;
}

/** A gentle zoom out along the trip exposes the shared table between trays. */
export function diceTableCameraPose(from:{x:number;y:number}|undefined,to:{x:number;y:number},progress:number){
 const p=Math.max(0,Math.min(1,progress)),e=p*p*(3-2*p);
 const dx=from?from.x-to.x:0,dy=from?from.y-to.y:0;
 const initial=!from;
 return {x:(initial?-to.x:dx)*(1-e),y:(initial?-to.y:dy)*(1-e),lift:initial?110*(1-e):Math.sin(Math.PI*p)*(Math.hypot(dx,dy)>1?35:2.5)};
}
