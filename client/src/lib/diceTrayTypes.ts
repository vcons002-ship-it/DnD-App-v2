export type TrayDie = {sides:number;value:number;crit?:boolean;index:number;set:number;tens?:boolean;ones?:boolean;negative?:boolean};
export type Toss = {frames:Float32Array;frameCount:number;step:number;radius:number;topFaces:number[];duration:number};
export function physicalDice(dice:TrayDie[]):TrayDie[] {
  return dice.flatMap(d=>d.sides===100 ? [{...d,sides:10,value:Math.floor((d.value%100)/10)*10,tens:true},{...d,sides:10,value:d.value%10,ones:true}] : [d]);
}
/** Assign once before playback: no face changes or corrective rotation during the toss. */
export function trayFaceValues(die:TrayDie,top:number):number[]{
  const offset=die.tens?die.value/10:die.ones?die.value:die.value-1;
  return Array.from({length:die.sides},(_,i)=>{
    const v=((i-top+offset)%die.sides+die.sides)%die.sides;
    return die.tens?v*10:die.ones?v:v+1;
  });
}
