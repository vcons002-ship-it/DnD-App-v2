import {simulateToss} from './dicePhysics';
import type {TrayDie} from './diceTrayTypes';
self.onmessage=(event:MessageEvent<{dice:TrayDie[];seed:number}>)=>{
  try {const toss=simulateToss(event.data.dice,event.data.seed);self.postMessage({toss},{transfer:[toss.frames.buffer]});}
  catch(error){self.postMessage({error:String(error)});}
};
