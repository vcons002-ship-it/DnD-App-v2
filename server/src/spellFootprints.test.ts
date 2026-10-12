import {describe,it,expect} from 'vitest';
import {tokenInSpellArea,tokenInSpellRadius,areaExcludesCaster,spellAreaFor,type SpellArea} from '../../shared/spellAreas.js';
import {createSession,createMap,setActiveMap,createCharacter,createToken,resizeToken,createMonsterTemplate,instantiateMonster,getMonster,getCharacter,drainHpFx} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {resolveAbilityRoll} from './combat.js';
import {getSpell} from './spells/srd.js';
import {withDiceSource} from '../../shared/dice.js';

describe('spell footprint intersections',()=>{
 const p={mapId:'map',points:[{x:0,y:0}],angle:0},caster={x:0,y:0};
 const hit=(spec:SpellArea,x:number,y:number,widthFt=5,angle=0,px=1)=>tokenInSpellArea(spec,{...p,angle},caster,{x:x*px,y:y*px,widthFt},px);
 it.each(['sphere','cylinder','emanation'] as const)('%s includes the overlapping footprint but not a separated base',kind=>{
  const spec={kind,sizeFt:20,rangeFt:60};
  expect(hit(spec,22.5,0)).toBe(true);expect(hit(spec,22.51,0)).toBe(false);
  expect(hit(spec,24.9,0,10)).toBe(true);expect(hit(spec,25.1,0,10)).toBe(false);
  expect(tokenInSpellRadius(caster,{x:7.4,y:0,widthFt:5},5,1)).toBe(true);
 });
 it('tests corners against the real rectangle rather than its expanded bounding box',()=>{
  const cube:SpellArea={kind:'cube',sizeFt:20,rangeFt:60};
  expect(hit(cube,12,0)).toBe(true);expect(hit(cube,11.7,11.7)).toBe(true);expect(hit(cube,12,12)).toBe(false);
 });
 it('includes line sides and end caps using each creature size and map scale',()=>{
  const spec=spellAreaFor(getSpell('Lightning Bolt')!)!;
  expect(hit(spec,50,4.9)).toBe(true);expect(hit(spec,50,5.1)).toBe(false);
  expect(hit(spec,50,7.4,10)).toBe(true);expect(hit(spec,50,7.6,10)).toBe(false);
  expect(hit(spec,102.4,0)).toBe(true);expect(hit(spec,102.6,0)).toBe(false);
  expect(hit(spec,102,4.5)).toBe(false);
  expect(hit(spec,-4.9,50,5,Math.PI/2,17)).toBe(true);
  expect(hit(spec,-5.1,50,5,Math.PI/2,17)).toBe(false);
  expect(areaExcludesCaster(spec)).toBe(true);
 });
 it('includes cone edges but excludes the diagonal beyond its end corner',()=>{
  const cone:SpellArea={kind:'cone',sizeFt:15,rangeFt:0,self:true};
  expect(hit(cone,10,7)).toBe(true);expect(hit(cone,10,8)).toBe(false);
  expect(hit(cone,17,9.5)).toBe(false);expect(areaExcludesCaster(cone)).toBe(true);
 });
 it('unions multiple areas without depending on the cosmetic base size',()=>{
  const spec:SpellArea={kind:'sphere',sizeFt:20,rangeFt:150,count:2};
  expect(tokenInSpellArea(spec,{...p,points:[{x:0,y:0},{x:100,y:0}]},caster,{x:122,y:0,widthFt:5,miniatureWidthFt:.1} as {x:number;y:number;widthFt:number},1)).toBe(true);
 });
});

describe('Lightning Bolt resolution and its chosen line effect',()=>{
 it.each([3,4])('hits footprint overlaps, respects cover and defenses, and emits one caster-to-endpoint bolt at level %i',level=>{
  const session=createSession('Footprint audit'),map=createMap(session.id,{name:'Arena'});setActiveMap(session.id,map.id);
  const caster=createCharacter(session.id,{name:'Sorcerer',className:'Sorcerer',level:9,maxHp:100,stats:{CHA:20}}),px=map.gridSizePx/map.feetPerSquare;
  createToken({mapId:map.id,kind:'pc',refId:caster.id,x:0,y:0});
  const make=(name:string,x:number,y:number,widthFt=5,extra:Record<string,unknown>={})=>{
   const template=createMonsterTemplate(session.id,{name,maxHp:100,stats:{DEX:10},...extra}),m=instantiateMonster(template.id)!;
   const token=createToken({mapId:map.id,kind:'monster',refId:m.id,x:x*px,y:y*px});resizeToken(token.id,widthFt);return m;
  };
  const edge=make('Overlap',30,4.8),large=make('Large overlap',50,7.4,10),outside=make('Outside',30,5.1),blocked=make('Covered',90,0),immune=make('Immune',60,0,5,{immunities:['lightning']});
  editMapWalls(session.id,map.id,{add:{id:'wall',ax:80*px,ay:-20*px,bx:80*px,by:20*px}});
  const spell={...getSpell('Lightning Bolt')!,id:'bolt'};
  withDiceSource(sides=>sides.map(s=>s===20?1:4),()=>expect(resolveAbilityRoll(session.id,'Sorcerer',caster,spell,level,undefined,undefined,undefined,{mapId:map.id,points:[{x:0,y:0}],angle:0})).toBe(true));
  const damage=(8+level-3)*4;
  expect(getMonster(edge.id)!.curHp).toBe(100-damage);expect(getMonster(large.id)!.curHp).toBe(100-damage);
  for(const m of [outside,blocked,immune])expect(getMonster(m.id)!.curHp).toBe(100);
  expect(getCharacter(caster.id)!.curHp).toBe(100);
  const events=drainHpFx(session.id),areas=events.filter(e=>e.areaPosition);
  expect(areas).toHaveLength(1);expect(areas[0]).toMatchObject({spell:'Lightning Bolt',delta:0,areaPosition:{mapId:map.id,x:0,y:0,radiusFt:2.5,end:{x:100*px,y:0}},sourcePosition:{mapId:map.id,x:0,y:0}});
  expect(events.filter(e=>e.delta<0).every(e=>e.suppressSpellVisual&&e.impact?.id===areas[0].impact?.id)).toBe(true);
 });
 it('still draws the bolt for an empty rotated line',()=>{
  const session=createSession('Empty bolt'),map=createMap(session.id,{name:'Arena'});setActiveMap(session.id,map.id);
  const caster=createCharacter(session.id,{name:'Caster',className:'Sorcerer',level:5,maxHp:100});createToken({mapId:map.id,kind:'pc',refId:caster.id,x:100,y:200});
  withDiceSource(sides=>sides.map(()=>4),()=>resolveAbilityRoll(session.id,'Caster',caster,{...getSpell('Lightning Bolt')!,id:'bolt'},3,undefined,undefined,undefined,{mapId:map.id,points:[{x:0,y:0}],angle:Math.PI/2}));
  const events=drainHpFx(session.id);expect(events).toHaveLength(1);
  expect(events[0].areaPosition!.x).toBe(100);expect(events[0].areaPosition!.end!.x).toBeCloseTo(100);
  expect(events[0].areaPosition!.end!.y).toBeCloseTo(200+100*map.gridSizePx/map.feetPerSquare);
 });
});
