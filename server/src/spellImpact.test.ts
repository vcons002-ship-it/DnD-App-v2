import {describe,it,expect,vi,afterEach} from 'vitest';
import {spellImpactName,spellImpactStyle,spellLightEnvelope,spellEmissionEnvelope,persistentSpellVisual,LINKED_SPELL_FX} from '../../shared/spellImpact.js';
import {spellEmissionIrradiance,lightIrradiance} from '../../shared/lightFalloff.js';
import {createSession,createMap,setActiveMap,createCharacter,createMonsterTemplate,instantiateMonster,createToken,drainHpFx,listRollLog,getMonster} from './sessions.js';
import {resolveAbilityRoll,resolveForcedSave} from './combat.js';
import {getSpell} from './spells/srd.js';
afterEach(()=>vi.restoreAllMocks());

describe('spell impact identity and lighting',()=>{
 it.each(LINKED_SPELL_FX)('%s preserves its cosmetic identity and has an existing-style luminous effect',spell=>{
  expect(spellImpactName(`${spell} + secret modifier 18`)).toBe(spell);
  expect(spellImpactStyle({spell,delta:-10,damageType:'force'})).toMatchObject({color:expect.stringMatching(/^#[a-f0-9]{6}$/),duration:expect.any(Number)});
 });
 it('renders active restraints from spell provenance, not a manual paralysis or the caster concentration chip',()=>{
  const condition={id:'hold',label:'Paralyzed',aura:'red' as const,isConcentration:false,combatEffect:{spell:'Hold Person',casterId:'mage',casterKind:'pc' as const,concentration:true}};
  expect(persistentSpellVisual(condition)).toBe('Hold Person');
  expect(persistentSpellVisual({...condition,combatEffect:undefined})).toBeUndefined();
  expect(persistentSpellVisual({...condition,isConcentration:true})).toBeUndefined();
  expect(persistentSpellVisual({...condition,label:'Incapacitated',combatEffect:{...condition.combatEffect,parentConditionId:'hold'}})).toBeUndefined();
 });
 it('uses a canonical cosmetic name without forwarding hidden weapon or modifier details',()=>{
  expect(spellImpactName('Secret longbow + Ensnaring Strike CRIT + 12')).toBe('Ensnaring Strike');
  expect(spellImpactName('Hunter’s Mark CRIT')).toBe("Hunter's Mark");
  expect(spellImpactName('Longbow + DEX')).toBeUndefined();
 });
 it('gives hunter spells their own forms even when their damage is piercing or zero',()=>{
  expect(spellImpactStyle({spell:'Hail of Thorns',damageType:'piercing',delta:-6})?.kind).toBe('arrows');
  expect(spellImpactStyle({spell:'Ensnaring Strike',damageType:'piercing',delta:0})?.kind).toBe('vines');
  expect(spellImpactStyle({spell:"Hunter's Mark",delta:0})?.kind).toBe('mark');
  expect(spellImpactStyle({damageType:'piercing',delta:-6})).toBeUndefined();
  expect(spellImpactStyle({delta:10,effect:'loot'})).toBeUndefined();
 });
 it('uses distinct elemental colors and a bounded, smooth fade',()=>{
  const fire=spellImpactStyle({damageType:'fire',delta:-8})!,ice=spellImpactStyle({damageType:'cold',delta:-8})!;
  expect(fire.color).not.toBe(ice.color);
  expect(spellLightEnvelope(-1,1200)).toBe(0);expect(spellLightEnvelope(0,1200)).toBe(0);
  expect(spellLightEnvelope(250,1200)).toBe(1);expect(spellLightEnvelope(1200,1200)).toBe(0);
  let last=1;for(let age=324;age<1200;age+=10){const value=spellLightEnvelope(age,1200);expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(last);last=value;}
 });
 it('keeps elemental hits their own color when Hunter\'s Mark also adds damage',()=>{
  expect(spellImpactStyle({spell:"Hunter's Mark",damageType:'fire',delta:-16})).toEqual(spellImpactStyle({damageType:'fire',delta:-16}));
  expect(spellImpactStyle({spell:'Lightning Arrow',damageType:'lightning',delta:-16})).toMatchObject({kind:'arrows',projectiles:1});
  expect(spellImpactStyle({spell:'Searing Smite',damageType:'slashing',delta:-16})?.color).toBe(spellImpactStyle({damageType:'fire',delta:-16})?.color);
 });
 it.each(['Hail of Thorns','Ensnaring Strike',"Hunter's Mark",'Fireball'])('%s emits light only while its visible glow is active',spell=>{
  const style=spellImpactStyle({spell,damageType:'fire',delta:-8})!;
  const values=Array.from({length:style.duration},(_,age)=>spellEmissionEnvelope(age,style));
  expect(spellEmissionEnvelope(0,style)).toBe(0);
  expect(spellEmissionEnvelope(style.duration,style)).toBe(0);
  if(style.kind==='burst')expect(values.filter(v=>v>0).length).toBeLessThan(550);
  expect(Math.max(...values)).toBe(1);
  const peak=values.indexOf(1);expect(values.slice(peak).every((v,i,a)=>i===0||v<=a[i-1])).toBe(true);
  if(style.kind==='arrows')expect(spellEmissionEnvelope(style.duration*.4,style)).toBeGreaterThan(.8);
  expect(spellEmissionIrradiance(15,15,1)).toBeLessThan(lightIrradiance(15,15,1)/100);
 });
 it('rejects standalone Hail casts because the spell belongs to a ranged hit',()=>{
  const s=createSession('Spell light'),map=createMap(s.id,{name:'Dungeon'});setActiveMap(s.id,map.id);
  const caster=createCharacter(s.id,{name:'Ranger',className:'Ranger',level:5,stats:{WIS:18}});
  expect(resolveAbilityRoll(s.id,'Ranger',caster,{...getSpell('Hail of Thorns')!,id:'hail'},1)).toBe(false);
  expect(drainHpFx(s.id)).toHaveLength(0);
 });
});
