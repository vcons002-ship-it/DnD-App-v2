export type DiceEntrySide = 'bottom' | 'top' | 'left' | 'right';
export type TrayDie = {sides:number;value:number;crit?:boolean;index:number;set:number;tens?:boolean;ones?:boolean;negative?:boolean;percentileValue?:number};
export type Toss = {settleTimes:number[];wallHits:number;frames:Float32Array;frameCount:number;step:number;radius:number;trayScale?:number;topFaces:number[];duration:number;
  /** Recorded strikes for the dice sounds (absent: silent playback). */
  impacts?:import('./diceImpacts.js').DiceImpact[]};
export function physicalDice(dice:TrayDie[]):TrayDie[] {
  return dice.flatMap(d=>d.sides===100 ? [{...d,sides:10,percentileValue:d.value,value:Math.floor((d.value%100)/10)*10,tens:true},{...d,sides:10,percentileValue:d.value,value:d.value%10,ones:true}] : [d]);
}
/** Assign once before playback: no face changes or corrective rotation during the toss. */
export function trayFaceValues(die:TrayDie,top:number):number[]{
  const offset=die.tens?die.value/10:die.ones?die.value:die.value-1;
  return Array.from({length:die.sides},(_,i)=>{
    const v=((i-top+offset)%die.sides+die.sides)%die.sides;
    return die.tens?v*10:die.ones?v:v+1;
  });
}

/** Relative face strength; percentile halves share their full d100 result. */
export function dieResultStrength(die:TrayDie):number {
  const sides=die.percentileValue===undefined?die.sides:100;
  const value=die.percentileValue??die.value;
  return Math.max(0,Math.min(1,(value-1)/Math.max(1,sides-1)));
}
export function dieResultTier(die:TrayDie):'max'|'high'|'normal'|'low'|'min' {
  if(die.sides===20&&die.percentileValue===undefined || (die.percentileValue??die.value)<1)return 'normal';
  const strength=dieResultStrength(die);
  return strength===1?'max':strength>=.75?'high':strength===0?'min':strength<=.25?'low':'normal';
}

/** Reveal in result-box order after every die stops, with an even cadence. */
export function diceRevealTimes(settleTimes:number[],playbackRate:number):number[] {
  const start=Math.max(0,...settleTimes)/playbackRate;
  return settleTimes.map((_,i)=>start+i*.16);
}

/** Visual intensity at either end; d20s keep their separate outcome effects. */
export function dieResultEmphasis(die:TrayDie):number {
 const tier=dieResultTier(die),strength=dieResultStrength(die);
 return tier==='normal'?0:tier==='low'||tier==='min'?1-strength:strength;
}
export function dieResultLabel(die:TrayDie):string {
 const tier=dieResultTier(die);
 return tier==='max'?'MAX':tier==='high'?'HIGH':tier==='min'?'MIN':tier==='low'?'LOW':'';
}
