import {describe,it,expect,vi,afterEach} from 'vitest';
import {createSession,createMap,setActiveMap,createCharacter,createMonsterTemplate,instantiateMonster,createToken,
  setSheetAbility,setResource,getCharacter,getMonster,setManualDamage,listRollLog,drainHpFx,setConcentration,setTokenHidden,updateMonster} from './sessions.js';
import {resolveAttack,resolveAttackDamage} from './combat.js';
import {resolveHitFeature,hitOptions} from './hitFeatures.js';
import {getSpell} from './spells/srd.js';
import {buildSnapshot} from './visibility.js';
import {db} from './db.js';
import {runLiveCommand} from './liveRolls.js';
import type {PhysicalDiceInfo} from '../../shared/dice.js';
import {castMark} from './marks.js';

afterEach(()=>vi.restoreAllMocks());
function fixture(){
 const s=createSession('Hail'),map=createMap(s.id,{name:'Arena'});setActiveMap(s.id,map.id);setManualDamage(s.id,true);
 const ch=createCharacter(s.id,{name:'Varis',className:'Ranger',level:6,maxHp:100,stats:{DEX:20,WIS:20},weapons:[{name:'Bow',kind:'ranged',damage:'1d8',damageType:'piercing',attackBonus:50}]});
 const ab={...getSpell('Hail of Thorns')!,id:'hail'};setSheetAbility('pc',ch.id,ab);setResource(ch.id,'spellSlots','L2',{max:3,used:0});
 const at=createToken({mapId:map.id,kind:'pc',refId:ch.id,x:0,y:0});
 const spawn=(name:string,x:number,y:number,extra:Record<string,unknown>={})=>{
  const m=instantiateMonster(createMonsterTemplate(s.id,{name,maxHp:100,armorClass:1,stats:{DEX:10},...extra}).id)!;
  return {m,t:createToken({mapId:map.id,kind:'monster',refId:m.id,x,y})};
 };
 const main=spawn('Goblin',200,200),near=spawn('Ally',250,250,{disposition:'friendly',stats:{DEX:30}}),far=spawn('Far',301,200),wall=spawn('Behind wall',200,250);
 db.prepare('UPDATE maps SET walls=? WHERE id=?').run(JSON.stringify([{id:'block',ax:175,ay:225,bx:215,by:225}]),map.id);
 vi.spyOn(Math,'random').mockReturnValue(.5);
 const attack=()=>{expect(resolveAttack(s.id,'Varis',at.id,main.t.id,0)).toBe(true);return listRollLog(s.id).filter(r=>r.pending).at(-1)!;};
 return {s,map,ch,ab,at,main,near,far,wall,spawn,attack};
}
describe('Hail of Thorns on a ranged hit',()=>{
 it('offers the spell only on ranged hits and leaves normal damage as the default',()=>{
  const f=fixture(),c=getCharacter(f.ch.id)!;
  expect(hitOptions(f.s.id,c,f.at,f.main.t,c.weapons[0])).toHaveLength(1);
  expect(hitOptions(f.s.id,c,f.at,f.main.t,{...c.weapons[0],kind:'melee'})).toHaveLength(0);
  resolveAttackDamage(f.s.id,'Varis',f.attack().id);
  expect(getCharacter(c.id)!.spellSlots.L2.used).toBe(0);expect(getMonster(f.near.m.id)!.curHp).toBe(100);
  updateMonster(f.main.m.id,{objectKind:'chest'});
  expect(hitOptions(f.s.id,c,f.at,f.main.t,c.weapons[0])).toHaveLength(0);
 });
 it('spends once, preserves concentration, rolls one pool, saves allies, respects walls and range',()=>{
  const f=fixture();setConcentration('pc',f.ch.id,"Hunter's Mark");const hit=f.attack();
  expect(resolveHitFeature(f.s.id,'Varis',hit.id,f.ab.id,2).ok).toBe(true);
  expect(getMonster(f.main.m.id)!.curHp).toBe(78); // bow 5+5, burst 6+6
  expect(getMonster(f.near.m.id)!.curHp).toBe(94); // save halves shared 12
  expect(getMonster(f.far.m.id)!.curHp).toBe(100);expect(getMonster(f.wall.m.id)!.curHp).toBe(100);
  expect(getCharacter(f.ch.id)!.conditions.some(c=>c.label.includes("Hunter's Mark"))).toBe(true);
  expect(getCharacter(f.ch.id)!.spellSlots.L2.used).toBe(1);
  expect(resolveHitFeature(f.s.id,'Varis',hit.id,f.ab.id,2).ok).toBe(false);
  const impact=drainHpFx(f.s.id),area=impact.filter(e=>e.areaWidthFt);
  expect(impact.filter(e=>e.damageParts?.[0].spell==='Hail of Thorns').map(e=>e.damageParts)).toEqual([
    [{amount:12,damageType:'piercing',spell:'Hail of Thorns'}],
    [{amount:6,damageType:'piercing',spell:'Hail of Thorns'}],
  ]);
  expect(area).toHaveLength(1);expect(area[0]).toMatchObject({refId:f.main.m.id,areaWidthFt:15,spell:'Hail of Thorns'});
  expect(new Set(impact.map(e=>e.rollId)).size).toBe(1);
  expect(listRollLog(f.s.id).find(r=>r.id===area[0].rollId)?.reveal?.damageDice?.[0].faces).toEqual([6,6]);
 });
 it('does not double the area dice on a critical hit and applies immunity after saves',()=>{
  const f=fixture();vi.spyOn(Math,'random').mockReturnValue(.999);updateMonster(f.near.m.id,{immunities:['piercing']});
  resolveHitFeature(f.s.id,'Varis',f.attack().id,f.ab.id,2);
  const hail=listRollLog(f.s.id).find(r=>r.label==='Hail of Thorns')!;
  expect(hail.reveal!.damageDice).toHaveLength(1);expect(hail.reveal!.damageDice![0].faces).toEqual([10,10]);
  expect(hail.reveal!.damageDice![0].critical).toBeUndefined();expect(getMonster(f.near.m.id)!.curHp).toBe(100);
 });
 it('respects active Rage resistance after a successful save',()=>{
  const f=fixture();setSheetAbility('monster',f.near.m.id,{id:'rage',name:'Rage',type:'stance',description:'',stance:{active:true,appliesTo:'all',grantsResistances:['piercing']}});
  resolveHitFeature(f.s.id,'Varis',f.attack().id,f.ab.id,2);
  expect(getMonster(f.near.m.id)!.curHp).toBe(97); // shared 12 / save 2 / resistance 2
 });
 it('damages hidden bystanders without exposing their save log to a player',()=>{
  const f=fixture();setTokenHidden(f.near.t.id,true);resolveHitFeature(f.s.id,'Varis',f.attack().id,f.ab.id,2);
  expect(getMonster(f.near.m.id)!.curHp).toBe(94);
  expect(buildSnapshot(f.s.id,'dm',f.map.id)!.rollLog.some(r=>r.reveal?.visibilityTarget?.refId===f.near.m.id)).toBe(true);
  expect(buildSnapshot(f.s.id,'player')!.rollLog.some(r=>r.reveal?.visibilityTarget?.refId===f.near.m.id)).toBe(false);
 });
 it('replays live saves atomically with per-creature audience metadata and no duplicate slot spend',async()=>{
  const f=fixture(),hit=f.attack(),requests:{sides:number[];info?:PhysicalDiceInfo}[]=[];
  await runLiveCommand(()=>{expect(resolveHitFeature(f.s.id,'Varis',hit.id,f.ab.id,2).ok).toBe(true);},()=>{},
    {label:'Hail',roller:'Varis',className:'Ranger'},async(sides,_publish,_meta,_seed,info)=>{
      requests.push({sides,info});expect(getCharacter(f.ch.id)!.spellSlots.L2.used).toBe(0);return sides.map(s=>Math.ceil(s/2));
    });
  expect(requests.map(r=>r.sides)).toEqual([[10,10],[20,20]]);
  expect(requests[1].info?.label).toBe('Hail of Thorns — DEX Saving Throws');
  expect(requests[1].info?.saveDice?.map(d=>d.target.refId)).toEqual([f.main.m.id,f.near.m.id]);
  expect(getCharacter(f.ch.id)!.spellSlots.L2.used).toBe(1);
 });
 it.each([false,true])('presents bow modifiers on the weapon throw before mark/burst/saves (mark=%s), atomically',async(mark)=>{
  const f=fixture(),order:string[]=[],calculations:any[]=[];let reading=false;
  if(mark){
    const ab={id:'mark',name:"Hunter's Mark",type:'spell' as const,level:1,description:'',tags:['concentration']};setSheetAbility('pc',f.ch.id,ab);
    expect(castMark(f.s.id,'pc',f.ch.id,ab,f.main.t.id,1)).toBe(true);
  }
  const dice:Parameters<typeof runLiveCommand>[3]=async(sides,publish,meta)=>{
    order.push(`dice:${sides.join(',')}`);
    expect(getMonster(f.main.m.id)!.curHp).toBe(100);
    expect(getCharacter(f.ch.id)!.spellSlots.L2.used).toBe(0);
    const values=sides.map(s=>s===20?10:4);
    publish({id:`throw:${order.length}`,seq:1,label:meta.label,roller:'Varis',className:'Ranger',sides,values,
      poses:sides.flatMap(()=>[0,0,1,0,0,0,1]),radius:1,elapsed:3,done:true,sets:sides.map(()=>0),
      critical:sides.map(()=>false),percentile:sides.map(()=>null),rerolls:sides.map(()=>0)});
    return values;
  };
  const meta={label:'Bow',roller:'Varis',className:'Ranger'};
  await runLiveCommand(()=>{resolveAttack(f.s.id,'Varis',f.at.id,f.main.t.id,0);},()=>{},meta,dice);
  const hit=listRollLog(f.s.id).find(r=>r.pending)!;order.length=0;
  await runLiveCommand(()=>{expect(resolveHitFeature(f.s.id,'Varis',hit.id,f.ab.id,2).ok).toBe(true);},frame=>{
    reading=frame.resultHoldMs!==undefined;
    if(reading){
      order.push('reading hold');expect(frame.resultHoldMs).toBe(2500);
      expect(getMonster(f.main.m.id)!.curHp).toBe(100);
      expect(getCharacter(f.ch.id)!.spellSlots.L2.used).toBe(0);
    }
    if(frame.calculation){order.push('bow calculation');calculations.push(frame.calculation);
      expect(frame.sides,'DEX is calculated over the weapon die, not the mark d6').toEqual([8]);
      expect(getMonster(f.main.m.id)!.curHp).toBe(100);
      expect(getCharacter(f.ch.id)!.spellSlots.L2.used).toBe(0);
    }
  },{...meta,waitForPresentation:async()=>{if(!reading)order.push('calculation hold');}},dice);
  expect(order).toEqual(['dice:8','bow calculation','calculation hold',...(mark?['dice:6','reading hold']:[]),'dice:10,10','reading hold','dice:20,20']);
  expect(calculations).toHaveLength(1);
  expect(calculations[0]).toMatchObject({title:'Bow — Damage Roll',damage:9,damageMods:[{label:'DEX',value:5}]});
  expect(listRollLog(f.s.id).find(r=>r.label==='Damage')?.reveal?.presentedLive).toBe(true);
  expect(getMonster(f.main.m.id)!.curHp).toBe(mark?79:83);
  expect(getCharacter(f.ch.id)!.spellSlots.L2.used).toBe(1);
 });
});
