import type {LiveDiceFrame} from '../../../shared/liveDiceTypes';

/** Use only recipient-shaped names/DCs; never infer a hidden DC from a result. */
export function saveRollHeading(frame:LiveDiceFrame,title=frame.label,attacker?:string){
 if(!/\bsav(?:e|es|ing throw|ing throws)\b/i.test(title)||frame.saveDice?.[0]?.rollKind==='initiative')return title;
 const names=[...new Set(frame.saveDice?.map(save=>save.name??save.label)??[frame.target??attacker??frame.roller])];
 const who=names.length>3?`${names.slice(0,3).join(', ')} +${names.length-3} others`:names.join(', ');
 const dcs=[...new Set(frame.saveDice?.map(save=>save.dc).filter((dc):dc is number=>dc!==undefined&&dc>0)??[])];
 const label=title.replace(/\bsaves?\b/i,match=>match.toLowerCase()==='saves'?'Saving Throws':'Saving Throw');
 return `${who} — ${label}${dcs.length===1?` · DC ${dcs[0]}`:''}`;
}
