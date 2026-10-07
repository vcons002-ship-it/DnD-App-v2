import type {SheetAbility,Condition} from './types.js';

/** Reviewed 2024 profiles; explicit manual/homebrew entries remain untouched. */
export function advancedSpell(a:Partial<SheetAbility>):'invisibility'|'spike growth'|'counterspell'|'dispel magic'|undefined {
  if(a.type!=='spell'||a.source==='custom'||a.executionProfile==='manual')return;
  const name=a.name?.trim().toLowerCase(),levels:Record<string,number>={'invisibility':2,'spike growth':2,'counterspell':3,'dispel magic':3};
  if(!name||a.level!==levels[name])return;
  if(a.roll && !(a.roll.kind==='damage'&&(name==='spike growth'?['0','2d4']:['0']).includes(a.roll.dice??'')&&!a.roll.scaleDice&&!a.roll.save&&!a.roll.damageBonus))return;
  return name as ReturnType<typeof advancedSpell>;
}
export const isInvisible=(e:{conditions:readonly Condition[]}|undefined|null)=>!!e?.conditions.some(c=>c.label.trim().toLowerCase()==='invisible');

/** Circular segment intervals let overlapping terrain count its movement only once. */
export function spikeInterval(a:{x:number;y:number},b:{x:number;y:number},center:{x:number;y:number},radiusPx:number):[number,number]|undefined {
  const dx=b.x-a.x,dy=b.y-a.y,x=a.x-center.x,y=a.y-center.y,A=dx*dx+dy*dy;
  if(A<1e-12)return;
  const B=2*(x*dx+y*dy),C=x*x+y*y-radiusPx*radiusPx,D=B*B-4*A*C;
  if(D<=0)return;
  const lo=Math.max(0,(-B-Math.sqrt(D))/(2*A)),hi=Math.min(1,(-B+Math.sqrt(D))/(2*A));
  return hi>lo?[lo,hi]:undefined;
}
export function travelInSpikes(a:{x:number;y:number},b:{x:number;y:number},center:{x:number;y:number},radiusPx:number,feetPerPixel:number){
  const interval=spikeInterval(a,b,center,radiusPx);
  return interval?(interval[1]-interval[0])*Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*feetPerPixel:0;
}
export function subtractIntervals(interval:[number,number],covered:readonly [number,number][]):[number,number][] {
  let result:[number,number][]=[interval];
  for(const [lo,hi] of covered)result=result.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[...(lo>a?[[a,Math.min(lo,b)] as [number,number]]:[]),...(hi<b?[[Math.max(hi,a),b] as [number,number]]:[])]);
  return result;
}
export function difficultTravel(a:{x:number;y:number},b:{x:number;y:number},zones:readonly {x:number;y:number;radiusFt:number}[],pxPerFoot:number){
  const covered:[number,number][]=[],length=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))/pxPerFoot;
  let distance=0;
  for(const zone of zones){const interval=spikeInterval(a,b,zone,zone.radiusFt*pxPerFoot);if(!interval)continue;distance+=subtractIntervals(interval,covered).reduce((n,[lo,hi])=>n+(hi-lo)*length,0);covered.push(interval);}
  return distance;
}
