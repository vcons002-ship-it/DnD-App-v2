import type {Condition,HpFxEvent} from './types.js';

export type SpellImpactStyle={kind:'burst'|'arrows'|'vines'|'mark'|'chains'|'shards'|'acid'|'drain'|'haunt'|'flame'|'weapon'|'storm'|'meteor'|'poison'|'illusion';color:string;radiusFt:number;strength:number;duration:number;projectiles?:number};
export const LINKED_SPELL_FX=['Mirror Image','Sorcerous Burst','Ice Knife',"Melf's Acid Arrow",'Vampiric Touch','Hold Person','Hold Monster','Phantasmal Killer','Heat Metal','Witch Bolt','Spiritual Weapon','Flame Blade','Call Lightning','Ice Storm','Flame Strike','Meteor Swarm','Guiding Bolt','Ray of Frost','Ray of Sickness','Chill Touch','Shocking Grasp'];
const colors:Record<string,string>={fire:'#ff702c',cold:'#72cbff',lightning:'#96cfff',thunder:'#b9a7ff',acid:'#b5ed43',poison:'#68d868',necrotic:'#a471df',radiant:'#ffe6a0',force:'#bc9bff',psychic:'#ff79cd'};
/** Only cosmetic spell identifiers cross the FX channel, never a hidden
 * attack's full title, weapon details or modifier breakdown. */
export function spellImpactName(source:string|undefined):string|undefined{
  const name=(source??'').replace(/[’‘]/g,"'").toLowerCase();
  return ['Ensnaring Strike','Entangle','Hail of Thorns','Conjure Barrage','Conjure Volley','Lightning Arrow','Searing Smite','Thunderous Smite','Wrathful Smite','Divine Smite','Fireball','Lightning Bolt','Cone of Cold',"Hunter's Mark",'Hex']
    .concat(LINKED_SPELL_FX).find(candidate=>name.includes(candidate.toLowerCase()));
}
/** Cosmetic identity only. Does not infer damage, conditions or visibility. */
export function spellImpactStyle(event:Pick<HpFxEvent,'spell'|'damageType'|'delta'|'effect'>):SpellImpactStyle|undefined{
  if(event.effect==='loot')return;
  const name=(event.spell??'').replace(/[’‘]/g,"'").toLowerCase();
  const forms:Record<string,[SpellImpactStyle['kind'],string]>={
    'mirror image':['illusion','force'],'ice knife':['shards','cold'],"melf's acid arrow":['acid','acid'],
    'vampiric touch':['drain','necrotic'],'hold person':['chains','force'],'hold monster':['chains','force'],
    'phantasmal killer':['haunt','psychic'],'heat metal':['flame','fire'],'witch bolt':['burst','lightning'],
    'spiritual weapon':['weapon','force'],'flame blade':['weapon','fire'],'call lightning':['storm','lightning'],
    'ice storm':['storm','cold'],'flame strike':['flame','radiant'],'meteor swarm':['meteor','fire'],
    'guiding bolt':['burst','radiant'],'ray of frost':['shards','cold'],'ray of sickness':['poison','poison'],
    'chill touch':['drain','necrotic'],'shocking grasp':['burst','lightning'],
  };
  const form=forms[name];
  if(form)return {kind:form[0],color:event.delta>0?'#67e596':colors[form[1]],radiusFt:/storm|strike|call lightning/.test(name)?22:12,strength:2.1,duration:form[0]==='burst'?1000:1700};
  if(/ensnaring strike|entangl(?:e|ing|ed)?(?: strike)?/.test(name))return {kind:'vines',color:'#74d95c',radiusFt:9,strength:1.5,duration:1650};
  if(/hail of thorns|conjure barrage|conjure volley/.test(name))return {kind:'arrows',color:'#b9ef83',radiusFt:14,strength:2.1,duration:1600};
  if(name==='lightning arrow')return {kind:'arrows',color:colors.lightning,radiusFt:18,strength:2.6,duration:1100,projectiles:1};
  // A marked Fire Bolt stays fiery; the mark's green aura belongs to its cast
  // and to otherwise physical weapon hits, not to every elemental spell hit.
  if(/hunter's mark/.test(name)&&!colors[event.damageType??''])return {kind:'mark',color:'#9be891',radiusFt:10,strength:1.2,duration:1200};
  const spellType:Record<string,string>={'searing smite':'fire','thunderous smite':'thunder','wrathful smite':'necrotic','divine smite':'radiant'};
  const color=event.delta>0?'#67e596':colors[spellType[name]??event.damageType??'']??(name==='hex'?colors.necrotic:undefined);
  if(!color)return;
  return {kind:'burst',color,radiusFt:/fireball|lightning bolt|cone of cold/.test(name)?22:15,strength:2.6,duration:event.damageType==='lightning'?900:1200};
}

/** Active spell provenance, never a bare manual Paralyzed condition. The server
 * owns expiry and concentration cleanup; the client only depicts that state. */
export function persistentSpellVisual(condition:Condition):string|undefined{
  const fx=condition.combatEffect;if(!fx||condition.isConcentration||fx.parentConditionId)return;
  const name=spellImpactName(fx.spell);if(!name)return;
  if(condition.label==='Haste lethargy')return;
  if(fx.spellAction&&!['Flame Blade','Vampiric Touch'].includes(name))return;
  if(['Hold Person','Hold Monster','Phantasmal Killer','Heat Metal',"Melf's Acid Arrow",'Guiding Bolt','Ray of Frost','Ray of Sickness','Chill Touch','Shocking Grasp','Flame Blade','Vampiric Touch','Ensnaring Strike','Entangle'].includes(name))return name;
}

/** A quick rise, readable crest, then smooth decay. No rapid strobe. */
export function spellLightEnvelope(age:number,duration:number){
  const t=age/duration;
  if(t<0||t>=1)return 0;
  if(t<.09)return t/.09;
  if(t<.27)return 1;
  const fade=(t-.27)/.73;return 1-fade*fade*(3-2*fade);
}

/** The visible glow and the light it emits share this envelope. Elemental
 * impacts flare quickly; arrows and vines stay luminous as their forms move. */
export function spellEmissionEnvelope(age:number,style:SpellImpactStyle){
  return spellLightEnvelope(age,style.kind==='burst'?Math.min(550,style.duration):style.duration);
}
