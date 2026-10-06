import type {Condition,CreatureAbility} from './types.js';
export function seesInvisible(e:{conditions:readonly Condition[];abilities?:readonly CreatureAbility[]},distanceFt:number){
  if(e.conditions.some(c=>/^see invisibility|^truesight$/i.test(c.label)))return true;
  const traits=(e.abilities??[]).map(a=>`${a.name} ${a.description}`).join(' ');
  return [...traits.matchAll(/(?:blindsight|truesight)\s*:?\s*(\d+)\s*(?:ft|feet)/ig)].some(m=>distanceFt<=Number(m[1]));
}
