import {rollDicePool,withDiceMetadata,withDiceSource,type Advantage,type SaveDieInfo} from '../../shared/dice.js';
import {rollSavingThrow,profBonusFor,type Combatant} from '../../shared/combatMath.js';
import {abilityMod} from '../../shared/skills.js';

/** All area saves share one throw while keeping advantage and target identity. */
export function rollSaveBatch(requests:{target:SaveDieInfo['target'];c:Combatant;ability:string;dc:number;mode?:Advantage;proficient:boolean;extra:number;autoFail:boolean;passEffect?:string;failEffect?:string}[],label:string){
 const saveDice=requests.flatMap((r,i)=>Array.from({length:r.mode?2:1},()=>({target:r.target,modifier:abilityMod(r.c.stats[r.ability])+(r.proficient?profBonusFor(r.c):0)+r.extra,dc:r.dc,group:String(i),mode:r.mode,autoFail:r.autoFail,passEffect:r.passEffect,failEffect:r.failEffect})));
 const rolls=withDiceMetadata({label,saveDice},()=>rollDicePool(requests.map(r=>({expr:r.mode?'2d20':'1d20'}))));
 return requests.map((r,i)=>({...withDiceSource(()=>rolls[i]!.rolls,()=>rollSavingThrow(r.c,r.ability,r.dc,r.mode,r.proficient)),faces:rolls[i]!.rolls}));
}
