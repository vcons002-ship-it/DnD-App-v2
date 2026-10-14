import {ARTISAN_TOOLS,BACKGROUND_STARTING_GOLD} from '../../shared/startingEquipment2024.js';
import { db,newId } from './db.js';
import { createCharacter,getCharacter,type CharacterInput } from './sessions.js';
import { creatorError,creatorPreview,CLASS_IDENTITY,CREATOR_SPECIES,ORIGIN_FEATS,type CreatorCatalog,type CreatorChoices } from '../../shared/characterCreation.js';
import { CORE_CLASSES_2024,classProgression2024 } from '../../shared/characterProgression.js';
import type { Character,SheetAbility } from '../../shared/types.js';
import { featureChoices2024,levelingFeature,selectedFeatureAbility,LEVELING_FEATS } from './levelingCatalog.js';
import { getFeature } from './features/srd.js';
import { getAllSpells,getSpell } from './spells/srd.js';
import { traitsForRace } from './races/srd.js';
import { getWeapon,weaponTags,searchWeapons } from './weapons/srd.js';
import { getMastery } from './masteries/srd.js';
import {rollDice} from '../../shared/dice.js';
import {statRollFromFaces,statGroupFromFaces,completeStatRoll,type CreatorStatDraft,type CreatorStatRollRequest} from '../../shared/characterCreation.js';

// A lost acknowledgement can be retried safely, including after a server restart.
db.exec(`CREATE TABLE IF NOT EXISTS character_creation_requests (
  session_id TEXT NOT NULL, owner_key TEXT NOT NULL, request_id TEXT NOT NULL,
  character_id TEXT NOT NULL, PRIMARY KEY(session_id,owner_key,request_id))`);
db.exec(`CREATE TABLE IF NOT EXISTS character_stat_rolls (
  session_id TEXT NOT NULL, owner_key TEXT NOT NULL, roll_id TEXT NOT NULL,
  result TEXT NOT NULL, PRIMARY KEY(session_id,owner_key,roll_id))`);
export function savedCreatorStatRoll(sessionId:string,ownerKey:string,rollId:string):CreatorStatDraft|undefined {
  const row=db.prepare('SELECT result FROM character_stat_rolls WHERE session_id=? AND owner_key=? AND roll_id=?').get(sessionId,ownerKey,rollId) as {result:string}|undefined;
  return row?JSON.parse(row.result):undefined;
}
export function rollCreatorStats(sessionId:string,ownerKey:string,request:CreatorStatRollRequest):CreatorStatDraft {
  const saved=savedCreatorStatRoll(sessionId,ownerKey,request.rollId);
  if(request.index===undefined&&saved)return saved;
  if(request.index!==undefined&&saved?.groups[request.index])return saved;
  const result:CreatorStatDraft=request.index===undefined?statRollFromFaces(request.rollId,rollDice('24d6')!.rolls)
    :saved??{id:request.rollId,groups:Array(6).fill(null),scores:Array(6).fill(null)};
  if(request.index!==undefined){const group=statGroupFromFaces(rollDice('4d6')!.rolls);result.groups[request.index]=group;result.scores[request.index]=group.total;}
  db.prepare('INSERT INTO character_stat_rolls VALUES(?,?,?,?) ON CONFLICT(session_id,owner_key,roll_id) DO UPDATE SET result=excluded.result').run(sessionId,ownerKey,request.rollId,JSON.stringify(result));
  return result;
}

const shell=(className:string):Character=>({className,subclass:'',level:1,stats:{},sheetAbilities:[],modifiers:[],proficientSkills:[]} as unknown as Character);
export function characterCreatorCatalog():CreatorCatalog {
  return {spells:getAllSpells().filter(s=>s.type==='spell'&&(s.level===0||s.level===1)).map(s=>({...s,id:'',source:'srd'})),
    choices:Object.fromEntries(CORE_CLASSES_2024.map(c=>{
      const p=classProgression2024(c,1)!,choices=featureChoices2024(shell(c),p);
      if(p.features.includes('Weapon Mastery'))choices.push({key:'masteries',label:'Weapon masteries',count:c==='fighter'?3:2,
        options:searchWeapons('',100).filter(w=>c!=='rogue'||w.category==='simple'||w.properties.some(p=>['finesse','light'].includes(p))).map(w=>({name:w.name,description:`${w.mastery} mastery for ${w.name}.`}))});
      return [c,choices];
    })),
    traits:Object.fromEntries(CREATOR_SPECIES.map(r=>[r,traitsForRace(r).filter(t=>t.edition==='2024').map(t=>({...t,id:'',source:'srd'}))]))};
}
export function buildStarterCharacter(c:CreatorChoices):CharacterInput {
  const catalog=characterCreatorCatalog();
  for(const step of [0,1,2,3,4]){const error=creatorError(c,step,catalog);if(error)throw new Error(error);}
  const {stats,hp,ac,kit}=creatorPreview(c), cls=CLASS_IDENTITY[c.className],progression=classProgression2024(c.className,1,'',stats)!;
  const model={...shell(c.className),stats};
  const abilities:SheetAbility[]=progression.features.map(name=>{
    const base=getFeature(name)??getSpell(name);
    return {...levelingFeature(name,model,progression),...(base??{}),id:newId(),source:'srd',sourceClass:c.className,
      ...(base?.useCounter?{useCounter:{...base.useCounter,max:progression.resourceMaxima[base.useCounter.name]??base.useCounter.max}}:{})};
  });
  const modifiers:Character['modifiers']=[];
  for(const [key,names] of Object.entries(c.features)) {
    // Never accept arbitrary feature text or unknown choice keys from a client.
    const choice=catalog.choices[c.className]?.find(f=>f.key===key);
    if(!choice||key==='orderCantrip'||choice.when&&!c.features[choice.when.key]?.includes(choice.when.option))continue;
    for(const name of names){abilities.push({...(key==='masteries'?getMastery(`${name} Mastery`)!:selectedFeatureAbility(key,name,model)),id:newId(),source:'srd'});
      if(key==='expertise')modifiers.push({id:newId(),source:`Expertise: ${name} (2024 level-up)`,target:{kind:'skill',skill:name},value:2});
      if(key==='order'&&['Thaumaturge','Magician'].includes(name))for(const skill of name==='Thaumaturge'?['Arcana','Religion']:['Arcana','Nature'])
        modifiers.push({id:newId(),source:`${cls.title} ${name} (2024 level-up)`,target:{kind:'skill',skill},value:Math.max(1,Math.floor((stats.WIS-10)/2))});
    }
  }
  for(const name of [c.originFeat,...(c.species==='Human'?[c.humanFeat!]:[])]) {
    if(!ORIGIN_FEATS.includes(name as typeof ORIGIN_FEATS[number]))continue;
    const feat=LEVELING_FEATS.find(f=>f.name===name)!;
    abilities.push({...getFeature(name),id:newId(),name,type:'ability',source:'srd',tags:['feat','origin','2024'],description:feat.description});
    if(name==='Alert')modifiers.push({id:newId(),source:'Alert',target:{kind:'initiative'},value:2});
  }
  abilities.push(...catalog.traits[c.species].map(t=>({...t,id:newId()})));
  abilities.push({id:newId(),name:`Background: ${c.background.trim()}`,type:'ability',source:'custom',school:'Custom background',
    description:`${c.backgroundSkills.join(', ')} proficiency. ${c.originFeat} origin feat. Ability increases: ${Object.entries(c.boosts).filter(([,v])=>v).map(([a,v])=>`${a} +${v}`).join(', ')}.`,tags:['background','2024']});
  const always=c.className==='ranger'?[catalog.spells.find(s=>/^hunter.s mark$/i.test(s.name))!.name]:[];
  for(const name of [...new Set([...c.cantrips,...c.spells,...always])]) {
    const s=getSpell(name)!;
    abilities.push({...s,id:newId(),source:'srd',sourceClass:c.className,prepared:s.level===0||c.prepared.includes(name)||always.includes(name),
      ...(always.includes(name)?{tags:[...(s.tags??[]),'always-prepared']}:{})});
  }
  const weapons=kit.weapons.map(name=>{const w=getWeapon(name)!;return {name:w.name,kind:w.kind,damage:w.damage,versatileDamage:w.versatileDamage,damageType:w.damageType,range:w.range,tags:weaponTags(w),diceOnly:true};});
  if(c.className==='monk')weapons.push({name:'Unarmed Strike',kind:'melee',damage:'1d6',versatileDamage:undefined,damageType:'bludgeoning',range:'5 ft',tags:['unarmed','finesse'],diceOnly:true});
  // Armor is a saved baseline, following the app's existing equipment model.
  const equipment=kit.items.map(i=>({...i,name:i.name==='Musical Instrument'?(c.equipmentTool??'Lute'):i.name==='Chosen Tool'?(c.equipmentTool??ARTISAN_TOOLS[3]):i.name}));
  const resources=Object.fromEntries(Object.entries(progression.resourceMaxima).map(([key,max])=>[key,{max,used:0}]));
  for(const a of abilities)if(a.useCounter&&!resources[a.useCounter.name])resources[a.useCounter.name]={max:a.useCounter.max,used:0};
  return {name:c.name.trim(),race:c.species,className:cls.title,level:1,maxHp:hp,armorClass:ac,gold:kit.gold+BACKGROUND_STARTING_GOLD,speed:c.species==='Goliath'?'35 ft':'30 ft',stats,weapons,resources,
    appearance:c.tokenCrafting?.appearance?.trim(),
    resistances:c.species==='Dwarf'?['poison']:[],
    proficientSkills:[...c.backgroundSkills,...c.skills,...c.extraSkills],saveProficiencies:cls.saves,modifiers,sheetAbilities:abilities,
    items:equipment.map(i=>({id:newId(),...i,note:'2024 class starting equipment',equipped:/armor|shirt|mail|shield/i.test(i.name)})),
    leveling:{rules:'2024',classes:[{className:c.className,level:1}],history:[]}};
}
export function createGuidedCharacter(sessionId:string,ownerKey:string,input:unknown):Character {
  const c=input as CreatorChoices;
  if(!c||typeof c.requestId!=='string'||!/^[\w-]{16,80}$/.test(c.requestId))throw new Error('Reopen the creator and try again.');
  return db.transaction(()=>{
    const previous=db.prepare('SELECT character_id FROM character_creation_requests WHERE session_id=? AND owner_key=? AND request_id=?').get(sessionId,ownerKey,c.requestId) as {character_id:string}|undefined;
    if(previous){const character=getCharacter(previous.character_id);if(character)return character;throw new Error('That character was removed. Start a new character.');}
    let opts:CharacterInput;
    if(c.method==='roll') {
      const rolled=typeof c.rolled?.id==='string'?savedCreatorStatRoll(sessionId,ownerKey,c.rolled.id):undefined;
      if(!rolled)throw new Error('Roll your starting stats in this session before creating the character.');
      const complete=completeStatRoll(rolled);
      if(!complete)throw new Error('Roll all six starting ability scores before creating the character.');
      c.rolled=complete; // Stored server faces are the only authority for the pool.
    }
    try{opts=buildStarterCharacter(c);}catch(error){throw new Error(error instanceof Error?error.message:'Check your character choices.');}
    const created=createCharacter(sessionId,opts);
    db.prepare('INSERT INTO character_creation_requests VALUES(?,?,?,?)').run(sessionId,ownerKey,c.requestId,created.id);
    return created;
  })();
}
