import {simulateToss} from './dicePhysics';
import type {TrayDie,DiceEntrySide} from './diceTrayTypes';
self.onmessage=(event:MessageEvent<{dice:TrayDie[];seed:number;entrySide?:DiceEntrySide}>)=>{
  try {const toss=simulateToss(event.data.dice,event.data.seed,event.data.entrySide);self.postMessage({toss},{transfer:[toss.frames.buffer]});}
  catch(error){self.postMessage({error:String(error)});}
};
