import type {LiveDiceFrame} from '../../../shared/liveDiceTypes';
import type {RollReveal} from '../../../shared/types';
import {flattenDamageDice} from '../../../shared/diceVisuals';

/** Reuse a completed authoritative throw, never a synthetic replacement die.
 * Save batches already present their own arithmetic and cannot be borrowed by
 * the damage summary that follows them. Match separate damage-type throws by
 * their recorded sides/faces; compound rider damage retains the latest tray. */
export function resultTrayFor(frames:Iterable<LiveDiceFrame>,reveal:RollReveal):LiveDiceFrame|undefined {
  if(!reveal.physical)return undefined;
  const candidates=[...frames].filter(frame=>frame.done&&!frame.saveDice).reverse();
  const d20=reveal.kind==='check'||(reveal.kind==='attack'||!reveal.kind)&&reveal.damage===undefined;
  const expected=d20?[{sides:20,value:reveal.d20}]:flattenDamageDice(reveal.damageDice);
  const diceFor=(frame:LiveDiceFrame)=>{
    const dice:{sides:number;value:number|null}[]=[];
    for(let i=0;i<frame.sides.length;i++){
      if(frame.mode&&frame.kept!==undefined&&frame.sets[i]!==frame.kept)continue;
      if(frame.percentile[i]==='tens'){
        const tens=frame.values[i],ones=frame.values[++i];
        dice.push({sides:100,value:tens===null||ones===null?null:(tens-1)*10+ones-1||100});
      }else dice.push({sides:frame.sides[i],value:frame.values[i]});
    }
    return dice;
  };
  const matches=(frame:LiveDiceFrame,faces:typeof expected)=>{
    const dice=diceFor(frame);
    return faces.length>0&&dice.length===faces.length&&dice.every((die,i)=>die.sides===faces[i].sides&&die.value===faces[i].value);
  };
  const matched=candidates.find(frame=>matches(frame,expected));
  // Weapon and rider dice are separate throws. A later area burst must not
  // become the backdrop for their combined weapon calculation.
  const lastComponent=!d20&&reveal.damageDice?.length
    ? flattenDamageDice(reveal.damageDice.slice(-1)):[];
  return matched??candidates.find(frame=>matches(frame,lastComponent))??
    (d20?candidates.find(frame=>frame.sides.every(side=>side===20)):candidates[0]);
}
