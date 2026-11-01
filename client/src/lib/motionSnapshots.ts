import type {StateSnapshot} from '../../../shared/types';
import type {LegacyMotion} from '../../../shared/legacyMotion';
import {motionFrameTokens,motionFrameMonsters} from '../../../shared/legacyMotion';
import {equal} from '../../../shared/stateDelta';

/** A plan is already authorized by the server. Share immutable appearance
 * records across its frames, including legacy servers sending inline records.
 * Never carry a prior plan's membership into a replacement snapshot. */
export function createMotionSnapshots(source:StateSnapshot,plan:LegacyMotion){
 const pool=<T extends {id:string}>(initial:T[])=>{
  const values=new Map<string,T[]>();for(const item of initial)values.set(item.id,[item]);
  return (item:T)=>{const variants=values.get(item.id)??[];const previous=variants.find(v=>equal(v,item));
   if(previous)return previous;variants.push(item);values.set(item.id,variants);return item;};
 };
 const token=pool(source.tokens),monster=pool(source.monsters);
 const sameList=<T>(a:T[],b:T[])=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 let previous=source;
 return plan.frames.map(frame=>{
  const tokensById=new Map(source.tokens.map(t=>[t.id,t]));
  for(const value of motionFrameTokens(plan,frame))tokensById.set(value.id,token(plan.moves[value.id]?{...value,...plan.moves[value.id].to}:value));
  const selected=frame.tokenIds.flatMap(id=>tokensById.has(id)?[tokensById.get(id)!]:[]);
  const tokens=sameList(previous.tokens,selected)?previous.tokens:selected;
  const ids=new Set(tokens.filter(t=>t.kind==='monster').map(t=>t.refId));
  const monstersById=new Map(source.monsters.map(m=>[m.id,m]));
  for(const value of motionFrameMonsters(plan,frame))monstersById.set(value.id,monster(value));
  const selectedMonsters=[...monstersById.values()].filter(m=>ids.has(m.id));
  const monsters=sameList(previous.monsters,selectedMonsters)?previous.monsters:selectedMonsters;
  const sprites=frame.tokenSprites?{...source.tokenSprites,...frame.tokenSprites}:source.tokenSprites;
  const tokenSprites=equal(previous.tokenSprites,sprites)?previous.tokenSprites:sprites;
  previous={...source,tokens,monsters,tokenSprites,legacyGeometry:frame.legacyGeometry,visionRaster:frame.visionRaster,visionTiles:frame.visionTiles};
  return previous;
 });
}
