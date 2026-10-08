export const DRUK_EXPLOSION_DELAY=.85;

/** Cosmetic strength uses the natural face, including d20s, never modifiers or
 * the sum of a pool. Unknown/moving dice retain their ordinary material. */
export function diceRollPower(sides:number,value:number|null|undefined){
 const known=Number.isInteger(sides)&&sides>1&&Number.isInteger(value)&&value!>=1&&value!<=sides;
 return {known,strength:known?(value!-1)/(sides-1):.35,maximum:known&&value===sides};
}

/** Smooth material changes, with one eruption per confirmed maximum. Repeated
 * network frames/result holds cannot restart it; an unreadable reroll resets it. */
export function createRollPowerState(sides:number){
 let result=diceRollPower(sides,null),strength=result.strength,last:number|undefined,born=-Infinity,revision=0;
 return {
  setResult(value:number|null|undefined,percentileValue?:number){
   const next=diceRollPower(percentileValue===undefined?sides:100,value==null?null:percentileValue??value);
   if(next.maximum&&!result.maximum){born=NaN;revision++;}
   if(!next.maximum)born=-Infinity;
   result=next;
  },
  advance(now:number){
   if(Number.isNaN(born))born=now;
   const dt=last===undefined?0:Math.max(0,Math.min(.1,(now-last)/1000));last=now;
   strength+=(result.strength-strength)*(1-Math.exp(-dt*9));
   return {...result,strength,age:result.maximum?Math.max(0,(now-born)/1000):Infinity,revision};
  },
 };
}
