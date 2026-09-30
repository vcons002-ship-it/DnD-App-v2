import {describe,it,expect,vi,afterEach} from 'vitest';
import {spellImpactName,spellImpactStyle,spellLightEnvelope,spellEmissionEnvelope} from '../../shared/spellImpact.js';
import {spellEmissionIrradiance,lightIrradiance} from '../../shared/lightFalloff.js';
import {createSession,createMap,setActiveMap,createCharacter,createMonsterTemplate,instantiateMonster,createToken,drainHpFx,listRollLog,getMonster} from './sessions.js';
import {resolveAbilityRoll,resolveForcedSave} from './combat.js';
import {getSpell} from './spells/srd.js';
afterEach(()=>vi.restoreAllMocks());

describe('spell impact identity and lighting',()=>{
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
 it('preserves the Hail of Thorns identity and the exact save reveal on a real cast',()=>{
  vi.spyOn(Math,'random').mockReturnValue(.5);
  const s=createSession('Spell light'),map=createMap(s.id,{name:'Dungeon'});setActiveMap(s.id,map.id);
  const caster=createCharacter(s.id,{name:'Ranger',className:'Ranger',level:5,stats:{WIS:18}});
  const monster=instantiateMonster(createMonsterTemplate(s.id,{name:'Goblin',maxHp:50,stats:{DEX:1}}).id)!;
  const target=createToken({mapId:map.id,kind:'monster',refId:monster.id,x:200,y:200});
  const ability={...getSpell('Hail of Thorns')!,id:'hail'};
  expect(resolveAbilityRoll(s.id,'Ranger',caster,ability,1,undefined,target.id)).toBe(true);
  const cast=listRollLog(s.id).find(r=>r.apply)!;expect(cast).toBeTruthy();
  expect(drainHpFx(s.id)).toHaveLength(0);
  resolveForcedSave(s.id,cast.id,target.id);
  const events=drainHpFx(s.id);expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({spell:'Hail of Thorns',damageType:'piercing',refId:monster.id});
  const reveal=listRollLog(s.id).find(r=>r.id===events[0].rollId)!;
  expect(reveal.reveal?.kind).toBe('check');
  expect(reveal.label).toBe('DEX save');
  expect(events[0].delta).toBe(getMonster(monster.id)!.curHp-50);
 });
});
