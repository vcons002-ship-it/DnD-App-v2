import { db,newId } from './db.js';
import { createCharacter,getCharacter,type CharacterInput } from './sessions.js';
import { creatorError,creatorPreview,CLASS_IDENTITY,CREATOR_SPECIES,ORIGIN_FEATS,type CreatorCatalog,type CreatorChoices } from '../../shared/characterCreation.js';
import { CORE_CLASSES_2024,classProgression2024,alwaysPreparedSpells2024,type ClassProgression } from '../../shared/characterProgression.js';
import type { Character,SheetAbility } from '../../shared/types.js';
import { featureChoices2024,levelingFeature,selectedFeatureAbility,LEVELING_FEATS } from './levelingCatalog.js';
import { getFeature } from './features/srd.js';
import { getAllSpells,getSpell } from './spells/srd.js';
import { traitsForRace } from './races/srd.js';
import { getWeapon,weaponTags,searchWeapons } from './weapons/srd.js';
import { getMastery } from './masteries/srd.js';
import {rollDice} from '../../shared/dice.js';
import {statRollFromFaces,statGroupFromFaces,completeStatRoll,type CreatorStatDraft,type CreatorStatRollRequest} from '../../shared/characterCreation.js';
import {creatorBackground} from '../../shared/creatorBackgrounds.js';
import {STARTING_PACK_CONTENTS} from '../../shared/startingEquipment2024.js';

// Tables (character_creation_requests, character_stat_rolls) live in db.ts.
export function savedCreatorStatRoll(sessionId:string,ownerKey:string,rollId:string):CreatorStatDraft|undefined {
  const row=db.prepare('SELECT result FROM character_stat_rolls WHERE session_id=? AND owner_key=? AND roll_id=?').get(sessionId,ownerKey,rollId) as {result:string}|undefined;
  return row?JSON.parse(row.result):undefined;
}
/** Each player gets one fresh set beyond their first unspent stat roll (the
 *  creator's "Roll all (new set)"). Past that, asking for another returns the
 *  latest set (`kept`), so a player can't re-roll until the numbers look good.
 *  Spending a roll on a character frees the next one. The DM is not limited. */
export const OPEN_STAT_ROLLS_PER_PLAYER=2;
export function rollCreatorStats(sessionId:string,ownerKey:string,request:CreatorStatRollRequest):CreatorStatDraft&{kept?:boolean} {
  let saved=savedCreatorStatRoll(sessionId,ownerKey,request.rollId);
  if(!saved&&ownerKey!=='dm'){
    const unspent=db.prepare('SELECT roll_id FROM character_stat_rolls WHERE session_id=? AND owner_key=? AND used_by IS NULL ORDER BY rowid DESC').all(sessionId,ownerKey) as {roll_id:string}[];
    const open=unspent.length>=OPEN_STAT_ROLLS_PER_PLAYER?unspent[0]:undefined;
    if(open){
      request={...request,rollId:open.roll_id};saved=savedCreatorStatRoll(sessionId,ownerKey,open.roll_id)!;
      if(request.index===undefined||saved.groups[request.index])return {...saved,kept:true};
    }
  }
  if(request.index===undefined&&saved)return saved;
  if(request.index!==undefined&&saved?.groups[request.index])return saved;
  const result:CreatorStatDraft=request.index===undefined?statRollFromFaces(request.rollId,rollDice('24d6')!.rolls)
    :saved??{id:request.rollId,groups:Array(6).fill(null),scores:Array(6).fill(null)};
  if(request.index!==undefined){const group=statGroupFromFaces(rollDice('4d6')!.rolls);result.groups[request.index]=group;result.scores[request.index]=group.total;}
  db.prepare('INSERT INTO character_stat_rolls (session_id,owner_key,roll_id,result) VALUES(?,?,?,?) ON CONFLICT(session_id,owner_key,roll_id) DO UPDATE SET result=excluded.result').run(sessionId,ownerKey,request.rollId,JSON.stringify(result));
  return result;
}

const shell=(className:string):Character=>({className,subclass:'',level:1,stats:{},sheetAbilities:[],modifiers:[],proficientSkills:[]} as unknown as Character);
function startingClassFeature(name:string,model:Character,p:ClassProgression):SheetAbility {
 const label=/^lay on hands$/i.test(name)?'Lay on Hands':name;
 const base=label==='Lay on Hands'?undefined:getFeature(label)??getSpell(label);
 const descriptions:Record<string,string>={
  'Unarmored Defense':p.classKey==='monk'?'Without armor or a shield, your AC is 10 + Dexterity modifier + Wisdom modifier. This is included in the creator’s AC.':'Without armor, your AC is 10 + Dexterity modifier + Constitution modifier. A shield can still apply. This is included in the creator’s AC.',
  'Weapon Mastery':'Choose the weapons you have mastered. Their individual mastery effects are added to your sheet and become available with the matching weapon.',
  'Divine Order':'Choose Protector for martial weapons and heavy armor, or Thaumaturge for another Cleric cantrip and a Wisdom-based bonus to Arcana and Religion checks.',
  'Primal Order':'Choose Warden for martial weapons and medium armor, or Magician for another Druid cantrip and a Wisdom-based bonus to Arcana and Nature checks.',
  'Druidic':'You know the secret Druidic language. Speak with Animals is always prepared and is added to your spellbook. Resolve hidden messages with your DM.',
  'Innate Sorcery':'As a Bonus Action, awaken your innate magic for 1 minute: your Sorcerer spell save DC increases by 1 and your Sorcerer spell attack rolls have Advantage. Two uses recover on a Long Rest; apply these temporary benefits with your DM.',
  'Ritual Adept':'You can cast a Ritual spell from your spellbook as a ritual without preparing it. Ritual casting takes 10 extra minutes and does not use a spell slot; arrange the ritual with your DM.',
 };
 return {...levelingFeature(label,model,p),...(base??{}),id:'',source:'srd',sourceClass:p.classKey,
  ...(descriptions[label]?{description:descriptions[label]}:{}),
  ...(base?.useCounter?{useCounter:{...base.useCounter,max:p.resourceMaxima[base.useCounter.name]??base.useCounter.max}}:{})};
}
function creatorSpeciesTraits(race:string):SheetAbility[]{
  const traits:SheetAbility[]=traitsForRace(race).filter(t=>t.edition==='2024'&&!['Large Form','Celestial Revelation'].includes(t.name)).map(t=>({...t,id:'',source:'srd'}));
  const add=(name:string,description:string,meta='Rules reference · discuss situational effects with your DM')=>traits.push({id:'',name,description,meta,type:'ability',source:'srd',school:`${race} trait (2024)`,tags:['race','trait','2024']});
  if(['Dwarf','Elf','Gnome','Dragonborn','Tiefling','Aasimar'].includes(race)&&!traits.some(t=>/darkvision/i.test(t.name)))add('Darkvision',`See better in dim light and darkness within ${race==='Dwarf'?120:60} feet. Darkness vision and walls follow your map's visibility settings.`,'Included in species vision');
  if(race==='Human')add('Versatile','Choose an additional Origin feat. Its choices and benefits are included below.','Bonus origin feat selected in this builder');
  if(race==='Elf')add('Elven Lineage','Choose Drow, High Elf or Wood Elf with your DM. The lineage determines your starting cantrip, vision or speed, and later spells. Configure the chosen lineage on your sheet.');
  if(race==='Gnome')add('Gnomish Lineage','Choose Forest Gnome or Rock Gnome with your DM. Add its starting spells to the spellbook and choose Intelligence, Wisdom or Charisma for their casting ability.');
  if(race==='Goliath')add('Giant Ancestry','Choose a giant ancestry with your DM. It grants a limited-use benefit such as teleporting, reducing damage or adding damage after a hit. Configure that choice on the sheet.');
  if(race==='Dragonborn')add('Draconic Ancestry','Choose a dragon ancestry with your DM, then set Breath Weapon and resistance to its damage type on your sheet.');
  if(race==='Aasimar'){
    add('Celestial Resistance','You resist necrotic and radiant damage.','Included in resistances');
    add('Light Bearer','You know the Light cantrip and cast it using Charisma.','Cantrip added to your spellbook');
  }
  return traits;
}
export function characterCreatorCatalog():CreatorCatalog {
  return {spells:getAllSpells().filter(s=>s.type==='spell'&&(s.level===0||s.level===1)).map(s=>({...s,id:'',source:'srd'})),
    choices:Object.fromEntries(CORE_CLASSES_2024.map(c=>{
      const p=classProgression2024(c,1)!,choices=featureChoices2024(shell(c),p);
      if(p.features.includes('Weapon Mastery'))choices.push({key:'masteries',label:'Weapon masteries',count:c==='fighter'?3:2,
        options:searchWeapons('',100).filter(w=>c!=='rogue'||w.category==='simple'||w.properties.some(p=>['finesse','light'].includes(p))).map(w=>({name:w.name,description:`${w.mastery} mastery for ${w.name}.`}))});
      return [c,choices];
    })),
    traits:Object.fromEntries(CREATOR_SPECIES.map(r=>[r,creatorSpeciesTraits(r)])),
    classFeatures:Object.fromEntries(CORE_CLASSES_2024.map(c=>{const p=classProgression2024(c,1)!;return [c,p.features.map(name=>startingClassFeature(name,shell(c),p))];})),
    originFeats:ORIGIN_FEATS.map(name=>({...getFeature(name),id:'',name,type:getFeature(name)?.type??'ability',description:LEVELING_FEATS.find(f=>f.name===name)!.description})),
    speciesNotes:{Elf:['Choose your elven lineage with your DM after creation. Keen Senses needs one of Insight, Perception or Survival selected on your sheet.'],Gnome:['Choose Forest or Rock Gnome and its spells with your DM after creation.'],Goliath:['Choose Giant Ancestry with your DM. Large Form starts at level 5 and is not a level-one ability.'],Dragonborn:['Choose Draconic Ancestry and configure breath damage and resistance on the sheet. Flight starts at level 5.'],Tiefling:['Choose a Fiendish Legacy and its casting ability with your DM. Add its resistance, starting cantrip and Thaumaturgy on the sheet.'],Aasimar:['Celestial Revelation starts at level 3 and is not a level-one ability.']}};
}
export function buildStarterCharacter(c:CreatorChoices):CharacterInput {
  const catalog=characterCreatorCatalog();
  for(const step of [0,1,2,3,4]){const error=creatorError(c,step,catalog);if(error)throw new Error(error);}
  const {stats,hp,ac,equipment,gold,speed}=creatorPreview(c), cls=CLASS_IDENTITY[c.className],progression=classProgression2024(c.className,1,'',stats)!;
  const model={...shell(c.className),stats};
  const abilities:SheetAbility[]=progression.features.map(name=>({...startingClassFeature(name,model,progression),id:newId()}));
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
  const background=creatorBackground(c.backgroundId),tool=c.backgroundTool??background?.tools[0];
  abilities.push({id:newId(),name:`Background: ${c.background.trim()}`,type:'ability',source:background?'srd':'custom',school:background?'2024 background':'Custom background',
    description:`${c.backgroundSkills.join(', ')} proficiency. ${tool?`${tool} tool proficiency. `:''}${c.originFeat} origin feat. Ability increases: ${Object.entries(c.boosts).filter(([,v])=>v).map(([a,v])=>`${a} +${v}`).join(', ')}. ${c.backgroundEquipment==='package'?'Background equipment package included.':'Background equipment alternative: 50 GP.'}`,tags:['background','2024']});
  const spellKey=(name:string)=>name.toLowerCase().replace(/[’']/g,'');
  const always=alwaysPreparedSpells2024(c.className,'',1).map(name=>catalog.spells.find(s=>spellKey(s.name)===spellKey(name))?.name).filter((name):name is string=>!!name);
  for(const name of [...new Set([...c.cantrips,...c.spells,...always])]) {
    const s=getSpell(name)!;
    abilities.push({...s,id:newId(),source:'srd',sourceClass:c.className,prepared:s.level===0||c.prepared.includes(name)||always.includes(name),
      ...(always.includes(name)?{tags:[...(s.tags??[]),'always-prepared']}:{})});
  }
  if(c.species==='Aasimar'&&!abilities.some(a=>a.type==='spell'&&a.name==='Light'))abilities.push({...getSpell('Light')!,id:newId(),prepared:true,roll:getSpell('Light')?.roll?{...getSpell('Light')!.roll!,castingAbility:'CHA'}:undefined});
  const weapons=equipment.weapons.map(name=>{const w=getWeapon(name)!;return {name:w.name,kind:w.kind,damage:w.damage,versatileDamage:w.versatileDamage,damageType:w.damageType,range:w.range,tags:weaponTags(w),diceOnly:true};});
  if(c.className==='monk')weapons.push({name:'Unarmed Strike',kind:'melee',damage:'1d6',versatileDamage:undefined,damageType:'bludgeoning',range:'5 ft',tags:['unarmed','finesse'],diceOnly:true});
  // Armor is a saved baseline, following the app's existing equipment model.
  const resources=Object.fromEntries(Object.entries(progression.resourceMaxima).map(([key,max])=>[key,{max,used:0}]));
  for(const a of abilities)if(a.useCounter&&!resources[a.useCounter.name])resources[a.useCounter.name]={max:a.useCounter.max,used:0};
  return {name:c.name.trim(),race:c.species,className:cls.title,level:1,maxHp:hp,armorClass:ac,gold,speed:`${speed} ft`,stats,weapons,resources,
    appearance:c.tokenCrafting?.appearance?.trim(),
    resistances:c.species==='Dwarf'?['poison']:c.species==='Aasimar'?['necrotic','radiant']:[],
    proficientSkills:[...c.backgroundSkills,...c.skills,...c.extraSkills],saveProficiencies:cls.saves,modifiers,sheetAbilities:abilities,
    items:equipment.items.map(i=>({id:newId(),...i,note:`2024 starting equipment${STARTING_PACK_CONTENTS[i.name]?` · Pack contains: ${STARTING_PACK_CONTENTS[i.name]}`:''}${i.name===equipment.wornArmor?.name&&equipment.wornArmor.stealthDisadvantage?' · Disadvantage on Stealth checks':''}`,equipped:i.name===equipment.wornArmor?.name||i.name==='Shield'&&equipment.shield})),
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
    if(c.method==='roll'){
      const spent=db.prepare('SELECT used_by FROM character_stat_rolls WHERE session_id=? AND owner_key=? AND roll_id=?').get(sessionId,ownerKey,c.rolled!.id) as {used_by:string|null}|undefined;
      if(spent?.used_by)throw new Error('Those rolled stats already belong to another character. Roll again for this one.');
    }
    const created=createCharacter(sessionId,opts);
    db.prepare('INSERT INTO character_creation_requests VALUES(?,?,?,?)').run(sessionId,ownerKey,c.requestId,created.id);
    if(c.method==='roll')db.prepare('UPDATE character_stat_rolls SET used_by=? WHERE session_id=? AND owner_key=? AND roll_id=?').run(created.id,sessionId,ownerKey,c.rolled!.id);
    return created;
  })();
}
