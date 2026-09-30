import type {HpFxEvent} from './types.js';

export type SpellImpactStyle={kind:'burst'|'arrows'|'vines'|'mark';color:string;radiusFt:number;strength:number;duration:number;projectiles?:number};
const colors:Record<string,string>={fire:'#ff702c',cold:'#72cbff',lightning:'#96cfff',thunder:'#b9a7ff',acid:'#b5ed43',poison:'#68d868',necrotic:'#a471df',radiant:'#ffe6a0',force:'#bc9bff',psychic:'#ff79cd'};
/** Only cosmetic spell identifiers cross the FX channel, never a hidden
 * attack's full title, weapon details or modifier breakdown. */
export function spellImpactName(source:string|undefined):string|undefined{
  const name=(source??'').replace(/[’‘]/g,"'").toLowerCase();
  return ['Ensnaring Strike','Entangle','Hail of Thorns','Conjure Barrage','Conjure Volley','Lightning Arrow','Searing Smite','Thunderous Smite','Wrathful Smite','Divine Smite','Fireball','Lightning Bolt','Cone of Cold',"Hunter's Mark",'Hex']
    .find(candidate=>name.includes(candidate.toLowerCase()));
}
/** Cosmetic identity only. Does not infer damage, conditions or visibility. */
export function spellImpactStyle(event:Pick<HpFxEvent,'spell'|'damageType'|'delta'|'effect'>):SpellImpactStyle|undefined{
  if(event.effect==='loot')return;
  const name=(event.spell??'').replace(/[’‘]/g,"'").toLowerCase();
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
