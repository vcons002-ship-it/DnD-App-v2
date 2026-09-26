import type {DiceEntrySide} from './diceTrayTypes.js';
/** Seat assignment is stable per roller; a viewer always sits at the bottom. */
export function diceEntrySide(isOwnRoll:boolean,rollerId:string):DiceEntrySide {
  if(isOwnRoll)return 'bottom';
  let hash=2166136261;
  for(const char of rollerId)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return (['left','top','right'] as const)[hash%3];
}
