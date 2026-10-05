import type {Condition,SheetAbility} from './types.js';

export const COMMAND_WORDS = ['Approach','Drop','Flee','Grovel','Halt'] as const;
export function isCommandSpell(a:SheetAbility):boolean {
  if(a.type!=='spell'||a.name.trim().toLowerCase()!=='command'||a.level!==1||a.source==='custom'||a.executionProfile==='manual')return false;
  const r=a.roll;
  return !r || r.kind==='save'&&(!r.save||r.save==='WIS')&&(!r.dice||r.dice==='0')&&!r.damageType&&!r.scaleDice&&
    Object.keys(r).every(k=>r[k as keyof typeof r]===undefined||['kind','save','dice','baseLevel','targetMode','saveDamage','castingAbility','dc'].includes(k))&&
    (r.baseLevel===undefined||r.baseLevel===1)&&(r.saveDamage===undefined||r.saveDamage==='none');
}
export function commandWord(value:unknown):string|undefined {
  if(typeof value!=='string')return;
  const word=value.trim();
  if(!/^[\p{L}][\p{L}\p{M}'’-]{0,31}$/u.test(word))return;
  return COMMAND_WORDS.find(v=>v.toLowerCase()===word.toLowerCase())??word;
}
export const isStandardCommand=(word:string)=>COMMAND_WORDS.some(v=>v===word);
export function activeCommand(source:{conditions?:readonly Condition[]}):Condition|undefined {
  return source.conditions?.find(c=>c.combatEffect?.spell==='Command'&&c.combatEffect.commandStarted&&isStandardCommand(c.combatEffect.commandWord??''));
}
export function commandInstruction(word:string):string {
  switch(word){
    case 'Approach':return 'Move toward the caster by the shortest direct route. End your turn when you get within 5 feet.';
    case 'Drop':return 'Drop what you are holding, then end your turn. The DM tracks the dropped items.';
    case 'Flee':return 'Spend your turn moving away from the caster by the fastest available means.';
    case 'Grovel':return 'Fall Prone, then end your turn.';
    case 'Halt':return 'Do not move or take an action or Bonus Action on this turn.';
    default:return 'The DM interprets this custom one-word command. Resolve it on this turn.';
  }
}
