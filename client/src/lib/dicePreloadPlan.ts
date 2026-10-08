import {diceThemeForRoll,type DiceTheme} from '../../../shared/diceThemes';

/** Start at session entry, before a character is claimed; prioritize that
 * character once known. A bounded theme list avoids warming a whole catalog. */
export function dicePreloadPlan(classes:readonly string[],ownClass:string|undefined,dm:boolean):DiceTheme[]{
 const candidates=dm?[diceThemeForRoll('',true)]:[
  ...(ownClass===undefined?[]:[diceThemeForRoll(ownClass)]),
  ...classes.map(name=>diceThemeForRoll(name)),
 ];
 const unique=[...new Map(candidates.map(theme=>[theme.id,theme])).values()].slice(0,3);
 const dmTheme=diceThemeForRoll('',true);
 if(!unique.some(theme=>theme.id===dmTheme.id))unique.push(dmTheme);
 return unique;
}
