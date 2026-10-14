import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSession,getCharacter } from './sessions.js';
import { buildStarterCharacter,characterCreatorCatalog,createGuidedCharacter,rollCreatorStats } from './characterCreator.js';
import {withDiceSource} from '../../shared/dice.js';
import { CLASS_IDENTITY,STARTER_KITS,suggestedScores,creatorError,creatorPreview,statRollFromFaces,assignRolledScores,completeStatRoll,type CreatorChoices } from '../../shared/characterCreation.js';
import { CORE_CLASSES_2024,type CoreClass } from '../../shared/characterProgression.js';
import { SKILLS } from '../../shared/skills.js';
import { grantLevelUp,getLevelUpPlan,applyLevelUp } from './leveling.js';

function choices(className:CoreClass='fighter'):CreatorChoices {
  const cat=characterCreatorCatalog(),cls=CLASS_IDENTITY[className],stats=suggestedScores(className);
  const c:CreatorChoices={requestId:randomUUID(),name:'New hero',species:'Human',className,method:'array',scores:stats,background:'Wayfarer',boosts:{[cls.priority[0]]:2,[cls.priority[1]]:1},originFeat:'Tough',humanFeat:'Alert',
    backgroundSkills:['Performance','Sleight of Hand'],skills:cls.skills.filter(s=>!['Performance','Sleight of Hand'].includes(s)).slice(0,cls.skillCount),extraSkills:[],kitId:STARTER_KITS[className][0].id,features:{},cantrips:[],spells:[],prepared:[]};
  c.extraSkills=SKILLS.map(s=>s.name).filter(s=>![...c.backgroundSkills,...c.skills].includes(s)).slice(0,1);
  for(const f of cat.choices[className]??[])if(!f.when&&f.key!=='orderCantrip')c.features[f.key]=f.key==='expertise'?c.skills.slice(0,f.count):f.options.slice(0,f.count).map(o=>o.name);
  const p=creatorPreview(c).progression,spells=cat.spells.filter(s=>s.classes?.includes(className));
  c.cantrips=spells.filter(s=>s.level===0).slice(0,p.cantrips).map(s=>s.name);
  c.spells=spells.filter(s=>s.level===1).slice(0,className==='wizard'?6:p.preparedSpells).map(s=>s.name);
  c.prepared=c.spells.slice(0,p.preparedSpells);
  return c;
}
describe('guided character creation',()=>{
  it('drops exactly one lowest die per group, including ties and range extremes',()=>{
    const r=statRollFromFaces('test',[1,1,1,1,6,6,6,6,2,5,3,4,6,1,4,3,2,2,2,2,5,3,5,3]);
    expect(r.scores).toEqual([3,18,12,13,6,13]);expect(r.groups.map(g=>g.dropped)).toEqual([0,0,0,1,0,1]);
    expect(()=>statRollFromFaces('test',Array(24).fill(7))).toThrow();
  });
  it('saves authoritative stats and safely recovers the same roll without rolling again',()=>{
    const s=createSession(),request={rollId:randomUUID(),className:'fighter' as const,name:'Hero'};
    const rolled=withDiceSource(()=>Array(24).fill(6),()=>rollCreatorStats(s.id,'a',request));
    expect(rolled.scores).toEqual(Array(6).fill(18));
    const recovered=withDiceSource(()=>{throw new Error('should not roll twice');},()=>rollCreatorStats(s.id,'a',request));
    expect(recovered).toEqual(rolled);
    const complete=completeStatRoll(rolled)!;
    const input={...choices(),method:'roll' as const,rolled:complete,scores:assignRolledScores('fighter',complete.scores)};
    expect(createGuidedCharacter(s.id,'a',input).stats.STR).toBe(20);
    expect(()=>createGuidedCharacter(s.id,'b',{...input,requestId:randomUUID()})).toThrow('this session');
    const altered={...input,requestId:randomUUID(),scores:{...input.scores,STR:17},rolled:{...rolled,scores:[17,18,18,18,18,18]}};
    expect(()=>createGuidedCharacter(s.id,'a',altered)).toThrow('each score once');
  });
  it('rolls one ability per request, preserves prior scores, and never advances itself',()=>{
    const s=createSession(),request={rollId:randomUUID(),className:'fighter' as const,name:'Hero'},counts:number[]=[];
    let draft=withDiceSource(sides=>{counts.push(sides.length);return [6,5,4,1];},()=>rollCreatorStats(s.id,'a',{...request,index:0}));
    expect(draft.scores).toEqual([15,null,null,null,null,null]);expect(completeStatRoll(draft)).toBeUndefined();
    const retry=withDiceSource(()=>{throw new Error('already rolled');},()=>rollCreatorStats(s.id,'a',{...request,index:0}));expect(retry).toEqual(draft);
    for(let index=1;index<6;index++)draft=withDiceSource(sides=>{counts.push(sides.length);return [2,2,2,2];},()=>rollCreatorStats(s.id,'a',{...request,index}));
    expect(counts).toEqual([4,4,4,4,4,4]);expect(completeStatRoll(draft)?.scores).toEqual([15,6,6,6,6,6]);
    const c=choices(),rolled=completeStatRoll(draft)!;
    expect(createGuidedCharacter(s.id,'a',{...c,method:'roll',rolled,scores:assignRolledScores('fighter',rolled.scores)}).stats.STR).toBe(17);
  });
  it.each(CORE_CLASSES_2024)('builds a playable level-one %s with a validated sheet',className=>{
    const c=choices(className),cat=characterCreatorCatalog();
    for(let step=0;step<4;step++)expect(creatorError(c,step,cat)).toBeNull();
    const s=createSession('Creator test'),made=createGuidedCharacter(s.id,'tester',c);
    expect(made.level).toBe(1);expect(made.armorClass).toBe(creatorPreview(c).ac);expect(made.maxHp).toBe(creatorPreview(c).hp);
    expect(made.weapons.length).toBeGreaterThan(0);expect(made.weapons.every(w=>w.diceOnly&&w.attackBonus===undefined)).toBe(true);
    expect(made.saveProficiencies).toEqual(CLASS_IDENTITY[className].saves);
    expect(made.proficientSkills).toHaveLength(CLASS_IDENTITY[className].skillCount+3);
    expect(made.leveling?.classes).toEqual([{className,level:1}]);
    expect(made.items.length).toBeGreaterThan(0);expect(made.resources['Heroic Inspiration']?.max).toBe(1);
    for(const [key,max] of Object.entries(creatorPreview(c).progression.spellSlots))expect(made.spellSlots[key]?.max).toBe(max);
  });
  it('uses the 2024 packages, quantities, class gold and background gold alternative',()=>{
    const fighter=createGuidedCharacter(createSession().id,'a',choices());
    expect(fighter.weapons.map(w=>w.name)).toEqual(['Greatsword','Flail','Javelin']);expect(fighter.items.find(i=>i.name==='Javelin')?.qty).toBe(8);expect(fighter.gold).toBe(54);
    const ranger=buildStarterCharacter(choices('ranger'));expect(ranger.items?.find(i=>i.name==='Arrows')?.qty).toBe(20);expect(ranger.items?.some(i=>i.name==='Studded Leather Armor')).toBe(true);
    const cleric=buildStarterCharacter(choices('cleric'));expect(cleric.items?.some(i=>i.name==='Chain Shirt')).toBe(true);
    const cash=createGuidedCharacter(createSession().id,'a',{...choices(),kitId:'gold'});expect(cash.gold).toBe(205);expect(cash.items).toEqual([]);expect(cash.weapons).toEqual([]);
  });
  it('validates the selected held weapon before creation and resets invalid equipment choices',()=>{
    const c=choices(),cat=characterCreatorCatalog();
    expect(creatorError({...c,tokenCrafting:{enabled:true,appearance:'Green orc',heldWeapon:'Longbow'}},4,cat)).toContain('Choose which');
    expect(creatorError({...c,tokenCrafting:{enabled:true,appearance:'Green orc',heldWeapon:'Flail'}},4,cat)).toBeNull();
    expect(creatorError({...c,kitId:'gold',tokenCrafting:{enabled:true,appearance:'Green orc',heldWeapon:'Flail'}},4,cat)).toContain('Choose which');
    expect(creatorError({...c,kitId:'gold',tokenCrafting:{enabled:true,appearance:'Green orc',heldWeapon:'Unarmed'}},4,cat)).toBeNull();
  });
  it('returns the same character after a lost acknowledgement',()=>{
    const s=createSession(),c=choices();const first=createGuidedCharacter(s.id,'a',c);
    expect(createGuidedCharacter(s.id,'a',c).id).toBe(first.id);
    expect(createGuidedCharacter(s.id,'b',c).id).not.toBe(first.id);
  });
  it('rejects invalid arrays, oversized point buys, duplicated skills and injected spells',()=>{
    const c=choices();
    expect(()=>buildStarterCharacter({...c,scores:{...c.scores,STR:20}})).toThrow('8 and 15');
    expect(()=>buildStarterCharacter({...c,scores:{...c.scores,INT:15}})).toThrow('each standard');
    expect(()=>buildStarterCharacter({...c,method:'points',scores:{STR:15,DEX:15,CON:15,INT:15,WIS:15,CHA:15}})).toThrow('27');
    expect(()=>buildStarterCharacter({...c,skills:['Athletics','Athletics']})).toThrow('class skills');
    expect(()=>buildStarterCharacter({...c,spells:['Fireball']})).toThrow('first-level');
    expect(()=>buildStarterCharacter({...c,humanFeat:'Tough'})).toThrow('bonus feat');
    expect(()=>buildStarterCharacter({...choices('wizard'),features:{fightingStyle:['Defense']}})).toThrow('does not belong');
  });
  it('handles wizard spellbook/prepared allowance and ranger always-prepared mark',()=>{
    const w=buildStarterCharacter(choices('wizard')).sheetAbilities!;
    expect(w.filter(s=>s.type==='spell'&&s.level===1)).toHaveLength(6);
    expect(w.filter(s=>s.type==='spell'&&s.level===1&&s.prepared)).toHaveLength(4);
    const r=buildStarterCharacter(choices('ranger')).sheetAbilities!;
    expect(r.find(s=>/^hunter.s mark$/i.test(s.name))?.prepared).toBe(true);
  });
  it('uses unarmored defense and grants Dwarf toughness at creation',()=>{
    const b=choices('barbarian');expect(creatorPreview(b).ac).toBe(13);
    expect(creatorPreview({...b,species:'Dwarf'}).hp).toBe(creatorPreview(b).hp+1);
  });
  it('ignores leftover Human choices after switching species, and calculates Defense armor',()=>{
    const c=choices();c.originFeat='Alert';c.humanFeat='Tough';
    expect(creatorPreview({...c,species:'Orc'}).hp).toBe(creatorPreview(c).hp-2);
    expect(creatorPreview({...c,features:{...c.features,fightingStyle:['Defense']}}).ac).toBe(17);
  });
  it('can level a starter character through the existing guide without rebuilding it',()=>{
    const s=createSession(),c=createGuidedCharacter(s.id,'tester',choices('fighter'));
    const grant=grantLevelUp(s.id,c.id);expect(grant.ok).toBe(true);
    const p=getLevelUpPlan(s.id,c.id);expect(p.ok).toBe(true);if(!p.ok||!grant.ok)return;
    const result=applyLevelUp(s.id,{characterId:c.id,expectedLevel:1,grantId:grant.value.leveling!.pending!.id,choices:{hpMethod:'fixed'}});
    expect(result.ok).toBe(true);expect(getCharacter(c.id)?.level).toBe(2);
    expect(getCharacter(c.id)?.maxHp).toBe(c.maxHp+6+2+2);
  });
});
