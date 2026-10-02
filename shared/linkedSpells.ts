import type { AbilityRoll, Condition, SheetAbility } from './types.js';

export const spellKey = (name: string) => name.replace(/[\u2018\u2019]/g, "'").trim().toLowerCase();
/** Cosmetic offsets only: duplicates never change the caster's footprint. */
export const MIRROR_IMAGE_SPREAD = 1.15;
type Profile = { level: number; kind: 'attack' | 'control' | 'mixed' | 'repeat' | 'mirror' | 'heat'; roll?: AbilityRoll; concentration?: boolean; rounds?: number; action?: string };
const profiles: Record<string, Profile> = {
  'sorcerous burst': { level:0,kind:'attack',roll:{kind:'attack',dice:'1d8',scaleDice:'1d8',baseLevel:0,damageTypeChoices:['acid','cold','fire','lightning','poison','psychic','thunder']} },
  'ice knife': {level:1,kind:'attack',roll:{kind:'attack',dice:'1d10',baseLevel:1,damageType:'piercing'}},
  "melf's acid arrow": {level:2,kind:'attack',roll:{kind:'attack',dice:'4d4',scaleDice:'1d4',baseLevel:2,damageType:'acid'}},
  'vampiric touch': {level:3,kind:'repeat',concentration:true,action:'Magic action',roll:{kind:'attack',dice:'3d6',scaleDice:'1d6',baseLevel:3,damageType:'necrotic'}},
  'witch bolt': {level:1,kind:'repeat',concentration:true,action:'Bonus action',roll:{kind:'attack',dice:'2d12',scaleDice:'1d12',baseLevel:1,damageType:'lightning'}},
  'spiritual weapon': {level:2,kind:'repeat',concentration:true,action:'Bonus action',roll:{kind:'attack',dice:'1d8',scaleDice:'1d8',baseLevel:2,damageType:'force',damageBonus:'spellcasting'}},
  'flame blade': {level:2,kind:'repeat',concentration:true,rounds:100,action:'Magic action',roll:{kind:'attack',dice:'3d6',scaleDice:'1d6',baseLevel:2,damageType:'fire',damageBonus:'spellcasting'}},
  'call lightning': {level:3,kind:'repeat',concentration:true,rounds:100,action:'Magic action',roll:{kind:'save',dice:'3d10',scaleDice:'1d10',baseLevel:3,save:'DEX',saveDamage:'half',damageType:'lightning',targetMode:'single'}},
  'heat metal': {level:2,kind:'heat',concentration:true,action:'Bonus action',roll:{kind:'damage',dice:'2d8',scaleDice:'1d8',baseLevel:2,damageType:'fire',targetMode:'single'}},
  'hold monster': {level:5,kind:'control',concentration:true,roll:{kind:'save',save:'WIS',saveDamage:'none',baseLevel:5,targetMode:'single'}},
  'phantasmal killer': {level:4,kind:'control',concentration:true,roll:{kind:'save',dice:'4d10',scaleDice:'1d10',baseLevel:4,save:'WIS',saveDamage:'half',targetMode:'single',damageType:'psychic'}},
  'mirror image': {level:2,kind:'mirror',roll:{kind:'damage',dice:'0',baseLevel:2,targetMode:'single'}},
  'ice storm': {level:4,kind:'mixed',roll:{kind:'save',save:'DEX',saveDamage:'half',baseLevel:4,targetMode:'multiple'}},
  'flame strike': {level:5,kind:'mixed',roll:{kind:'save',save:'DEX',saveDamage:'half',baseLevel:5,targetMode:'multiple'}},
  'meteor swarm': {level:9,kind:'mixed',roll:{kind:'save',save:'DEX',saveDamage:'half',baseLevel:9,targetMode:'multiple'}},
  'guiding bolt': {level:1,kind:'attack',roll:{kind:'attack',dice:'4d6',scaleDice:'1d6',baseLevel:1,damageType:'radiant'}},
  'ray of frost': {level:0,kind:'attack',roll:{kind:'attack',dice:'1d8',scaleDice:'1d8',baseLevel:0,damageType:'cold'}},
  'ray of sickness': {level:1,kind:'attack',roll:{kind:'attack',dice:'2d8',scaleDice:'1d8',baseLevel:1,damageType:'poison'}},
  'chill touch': {level:0,kind:'attack',roll:{kind:'attack',dice:'1d10',scaleDice:'1d10',baseLevel:0,damageType:'necrotic'}},
  'shocking grasp': {level:0,kind:'attack',roll:{kind:'attack',dice:'1d8',scaleDice:'1d8',baseLevel:0,damageType:'lightning'}},
};
const oldDice: Record<string,string[]> = {'chill touch':['1d8'], 'witch bolt':['1d12'], 'ice storm':['2d8','2d10'], 'flame strike':['4d6','5d6'], 'meteor swarm':['40d6'], 'flame blade':['3d6'], 'spiritual weapon':['1d8']};

/** Only recognizable shipped profiles acquire mechanics. Authored formulas and
 * explicit manual/custom entries continue to belong to their author. */
export function linkedSpellProfile(a: SheetAbility): Profile | undefined {
  const key=spellKey(a.name),p=profiles[key];
  if(!p || a.type!=='spell' || a.level!==p.level || a.source==='custom' || a.executionProfile==='manual')return;
  const r=a.roll;
  if(r){
    if(r.kind!==p.roll?.kind)return;
    const dice=(r.dice??'').replace(/\s/g,'').toLowerCase();
    if(dice && dice!==(p.roll?.dice??'').toLowerCase() && !(oldDice[key]??[]).includes(dice))return;
    if(r.save && r.save!==p.roll?.save)return;
    if(r.instances || r.healingMode || r.healingBonus || r.damageBonus && r.damageBonus!==p.roll?.damageBonus)return;
    const legacyScale=key==='chill touch'?['1d8']:key==='ice storm'?['1d8','1d10']:key==='flame strike'?['1d6']:[];
    if(r.scaleDice && r.scaleDice!==p.roll?.scaleDice && !legacyScale.includes(r.scaleDice))return;
    if(r.damageType && p.roll?.damageType && r.damageType!==p.roll.damageType && !['ice storm','flame strike','meteor swarm'].includes(key))return;
  } else if(!['mirror','control','mixed'].includes(p.kind))return;
  return p;
}
export function linkedSpellRoll(a: SheetAbility): AbilityRoll | undefined {
  const p=linkedSpellProfile(a);
  return p?.roll ? {...p.roll,...(a.roll?.castingAbility?{castingAbility:a.roll.castingAbility}:{}),...(a.roll?.attackBonus!==undefined?{attackBonus:a.roll.attackBonus}:{}),...(a.roll?.dc!==undefined?{dc:a.roll.dc}:{})} : undefined;
}
export const mirrorImageCount = (conditions: readonly Condition[]) => Math.min(3,Math.max(0,conditions.find(c=>spellKey(c.label)==='mirror image')?.combatEffect?.duplicates??0));
export type LinkedSpellContext = {spell:string;abilityId:string;casterKind:'pc'|'monster';casterId:string;castLevel:number;dc:number;modifier:number};
