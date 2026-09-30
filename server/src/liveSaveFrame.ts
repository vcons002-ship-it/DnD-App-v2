import type {LiveDiceFrame} from '../../shared/liveDiceTypes.js';
import type {SaveDieInfo} from '../../shared/dice.js';

/** Remove hidden save dice entirely, including their poses, results and labels. */
export function shapeSaveFrame(frame:LiveDiceFrame,saves:SaveDieInfo[],labelFor:(target:SaveDieInfo['target'])=>string|undefined):LiveDiceFrame|null {
 const entries=frame.sides.map((_,i)=>({i,save:saves[(frame.dieOffset??0)+i]})).map(e=>({...e,label:e.save&&labelFor(e.save.target)})).filter(e=>e.label!==undefined);
 if(!entries.length)return null;
 const groups=new Map<string,string>();
 const {dieOffset,...base}=frame;
 const pick=<T>(values:T[])=>entries.map(e=>values[e.i]);
 return {...base,sides:pick(frame.sides),sets:pick(frame.sets),critical:pick(frame.critical),percentile:pick(frame.percentile),values:pick(frame.values),rerolls:pick(frame.rerolls),
   poses:entries.flatMap(e=>frame.poses.slice(e.i*7,e.i*7+7)),target:undefined,
   saveDice:entries.map(({save,label})=>{if(!groups.has(save.group))groups.set(save.group,String(groups.size));return {label:label!,modifier:save.modifier,dc:save.dc,group:groups.get(save.group)!,mode:save.mode,autoFail:save.autoFail};})};
}
