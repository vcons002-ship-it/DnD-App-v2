import type {StateSnapshot} from '../../../shared/types';
import type {LegacyMotion,LegacyMotionFrame} from '../../../shared/legacyMotion';
import {equal} from '../../../shared/stateDelta';

/** A plan is already authorized by the server. Share immutable appearance
 * records across its frames, including legacy servers sending inline records.
 * Never carry a prior plan's membership into a replacement snapshot. */
export function createMotionSnapshots(source:StateSnapshot,plan:LegacyMotion){
 const pool=<T extends {id:string}>(initial:T[])=>{
  const values=new Map<string,T[]>();for(const item of initial)values.set(item.id,[item]);
  return (item:T)=>{const variants=values.get(item.id)??[];const previous=variants.find(v=>v===item||equal(v,item));
   if(previous)return previous;variants.push(item);values.set(item.id,variants);return item;};
 };
 const token=pool(source.tokens),monster=pool(source.monsters);
 const normalizeToken=(value:StateSnapshot['tokens'][number])=>token(plan.moves[value.id]?{...value,...plan.moves[value.id].to}:value);
 const entityTokens=plan.entities?.tokens.map(normalizeToken);
 const entityMonsters=plan.entities?.monsters.map(monster);
 const baseTokensById=new Map(source.tokens.map(t=>[t.id,t]));
 const baseMonstersById=new Map(source.monsters.map(m=>[m.id,m]));
 const sameList=<T>(a:T[]|undefined,b:T[]|undefined)=>a===b||(!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]));
 const sameFrameEntities=(a:LegacyMotionFrame,b:LegacyMotionFrame)=>
  sameList(a.tokenIds,b.tokenIds)&&
  (a.tokenRefs&&b.tokenRefs?sameList(a.tokenRefs,b.tokenRefs):!a.tokenRefs&&!b.tokenRefs&&!a.tokens?.length&&!b.tokens?.length)&&
  (a.monsterRefs&&b.monsterRefs?sameList(a.monsterRefs,b.monsterRefs):!a.monsterRefs&&!b.monsterRefs&&!a.monsters?.length&&!b.monsters?.length)&&
  !a.tokenSprites&&!b.tokenSprites;
 let previous=source;
 let previousFrame:LegacyMotionFrame|undefined;
 return plan.frames.map(frame=>{
  if(previousFrame&&sameFrameEntities(frame,previousFrame)){
   if(frame.legacyGeometry===previous.legacyGeometry&&frame.visionRaster===previous.visionRaster&&frame.visionTiles===previous.visionTiles){
    previousFrame=frame;return previous;
   }
   previous={...previous,legacyGeometry:frame.legacyGeometry,visionRaster:frame.visionRaster,visionTiles:frame.visionTiles};
   previousFrame=frame;return previous;
  }
  const frameTokens=frame.tokenRefs
   ?frame.tokenRefs.flatMap(i=>entityTokens?.[i]?[entityTokens[i]]:[])
   :frame.tokens?.map(normalizeToken)??[];
  const tokensById=frameTokens.length?new Map(baseTokensById):baseTokensById;
  for(const value of frameTokens)tokensById.set(value.id,value);
  const selected=frame.tokenIds.flatMap(id=>tokensById.has(id)?[tokensById.get(id)!]:[]);
  const tokens=sameList(previous.tokens,selected)?previous.tokens:selected;
  const frameMonsters=frame.monsterRefs
   ?frame.monsterRefs.flatMap(i=>entityMonsters?.[i]?[entityMonsters[i]]:[])
   :frame.monsters?.map(monster)??[];
  let monsters:StateSnapshot['monsters'];
  if(tokens===previous.tokens&&!frameMonsters.length&&previousFrame&&!previousFrame.monsterRefs?.length&&!previousFrame.monsters?.length){
   monsters=previous.monsters;
  }else{
   const ids=new Set(tokens.filter(t=>t.kind==='monster').map(t=>t.refId));
   const monstersById=frameMonsters.length?new Map(baseMonstersById):baseMonstersById;
   for(const value of frameMonsters)monstersById.set(value.id,value);
   const selectedMonsters=ids.size?[...monstersById.values()].filter(m=>ids.has(m.id)):[];
   monsters=sameList(previous.monsters,selectedMonsters)?previous.monsters:selectedMonsters;
  }
  const sprites=frame.tokenSprites?{...source.tokenSprites,...frame.tokenSprites}:source.tokenSprites;
  const tokenSprites=previous.tokenSprites===sprites||equal(previous.tokenSprites,sprites)?previous.tokenSprites:sprites;
  previous={...source,tokens,monsters,tokenSprites,legacyGeometry:frame.legacyGeometry,visionRaster:frame.visionRaster,visionTiles:frame.visionTiles};
  previousFrame=frame;
  return previous;
 });
}
