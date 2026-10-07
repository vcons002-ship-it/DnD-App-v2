import {commandWord,isStandardCommand,commandInstruction} from '../../shared/commandSpell.js';
import {effectiveStats} from '../../shared/modifiers.js';
import {spellcastingMod} from '../../shared/spellMath.js';
import {profBonusFor} from '../../shared/combatMath.js';
import {proficiencyBonus} from '../../shared/skills.js';
import {spellcastingKeyFor} from '../../shared/spellExecution.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {hasLineOfSight} from '../../shared/mapWalls.js';
import type {SheetAbility,TokenKind,RollEntry} from '../../shared/types.js';
import {newId} from './db.js';
import {getCharacter,getMonster,getSessionById,getMap,getToken,listTokens,addRollLog,setCondition} from './sessions.js';
import {resolveForcedSave} from './combat.js';

export function commandTargetError(sid:string,entry:RollEntry,tokenId:string):string|undefined {
  const fx=entry.apply?.effect,target=getToken(tokenId),map=target&&getMap(target.mapId);
  const caster=fx&&listTokens(map?.id??'').find(t=>t.kind===fx.casterKind&&t.refId===fx.casterId);
  if(!fx?.commandWord||!target||!map||map.sessionId!==sid||map.id!==getSessionById(sid)?.activeMapId||!caster)return 'Place the caster and choose a creature on the active map.';
  if(tokenDistanceFt({...caster,widthFt:0},{...target,widthFt:0},map)>60||!hasLineOfSight(caster,target,map.walls))return 'Command requires a visible target within 60 feet.';
  const e=target.kind==='pc'?getCharacter(target.refId):getMonster(target.refId);
  if(!e||e.curHp<=0||target.kind==='monster'&&'objectKind' in e&&e.objectKind)return 'Choose a living creature for Command.';
  if((entry.apply?.consumedTargets??[]).some(id=>{const t=getToken(id);return t?.kind===target.kind&&t.refId===target.refId;}))return 'That creature already saved against this Command.';
  if((entry.apply?.consumedTargets?.length??0)>=(entry.apply?.maxTargets??1))return 'All targets for this Command have been resolved.';
  if(fx.expiresAt<=Date.now())return 'This Command targeting window has ended.';
}

export function castCommand(sid:string,roller:string,kind:TokenKind,id:string,a:SheetAbility,level:number,word:string,targetTokenId?:string):string|undefined {
  const e=kind==='pc'?getCharacter(id):getMonster(id),mapId=getSessionById(sid)?.activeMapId;
  if(!e||e.sessionId!==sid||!mapId||!listTokens(mapId).some(t=>t.kind===kind&&t.refId===id))return 'Place the caster on the active map before casting Command.';
  const selected=commandWord(word);
  if(!selected)return 'Choose a command or enter one word (up to 32 letters).';
  if(!isStandardCommand(selected)&&!getSessionById(sid)?.commandCustomWords)return 'The DM must enable custom Command words in Combat settings.';
  const scores=kind==='pc'?effectiveStats(e).scores:e.stats;
  const dc=a.roll?.dc??(8+(kind==='pc'?proficiencyBonus(e.level):profBonusFor({stats:scores,level:e.level,isMonster:true}))+spellcastingMod(scores,spellcastingKeyFor('className'in e?e:{},a)));
  const entry:Omit<RollEntry,'id'>={createdAt:Date.now(),roller,label:'Command',expr:`Command: ${selected}`,total:0,detail:`Command: ${selected}. ${commandInstruction(selected)} Choose up to ${level} target(s); Wisdom saves resolve before the command takes effect on their next turn.`,
    apply:{amount:0,dc,save:'WIS',saveDamage:'none',targetMode:level>1?'multiple':'single',maxTargets:level,owner:kind==='pc'?id:undefined,
      effect:{casterKind:kind,casterId:id,spell:'Command',castLevel:level,condition:`Command: ${selected}`,commandWord:selected,durationRounds:1,expiresAt:Date.now()+60000,castId:newId(),concentrationConditionId:''}}};
  if(targetTokenId){const error=commandTargetError(sid,{...entry,id:''},targetTokenId);if(error)return error;}
  const logged=addRollLog(sid,entry);
  if(targetTokenId)resolveForcedSave(sid,logged.id,targetTokenId);
}

export function resolveCommandInstruction(sid:string,kind:TokenKind,id:string,conditionId:string):string|undefined {
  const e=kind==='pc'?getCharacter(id):getMonster(id),c=e?.conditions.find(c=>c.id===conditionId&&c.combatEffect?.spell==='Command');
  if(!e||e.sessionId!==sid||!c)return 'That command has already ended.';
  if(!c.combatEffect!.commandStarted&&getSessionById(sid)?.combatRound)return 'This command resolves on the target’s next turn.';
  if(c.combatEffect!.commandResolved)return 'This command has already been marked resolved.';
  setCondition(kind,id,{...c,combatEffect:{...c.combatEffect!,commandResolved:true}});
  addRollLog(sid,{roller:'Command',label:'Command resolved',expr:c.label,total:0,detail:`${e.name}: ${c.label} resolved. The effect ends at the end of this turn.`});
}
