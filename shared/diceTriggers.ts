import type {RollReveal} from './types.js';
/** Indices refer to the original damage dice, including critical dice, never riders. */
export function matchingDiceTrigger(faces:number[],title='Orb can leap!'):RollReveal['diceTrigger']{
 const groups=new Map<number,number[]>();
 faces.forEach((face,index)=>{const indices=groups.get(face)??[];indices.push(index);groups.set(face,indices);});
 const matches=[...groups].filter(([,indices])=>indices.length>1).map(([value,indices])=>({value,indices}));
 return matches.length?{title,detail:'Matching damage dice',diceCount:faces.length,groups:matches}:undefined;
}
export const DICE_TRIGGER_HOLD_MS=1800;
