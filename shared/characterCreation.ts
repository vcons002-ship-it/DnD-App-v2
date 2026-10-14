/** Level-one sheets with 2024 class starting packages and the 50-GP
 * background alternative. Choices are validated again on the server. */
import { CORE_CLASSES_2024, classProgression2024, type CoreClass } from './characterProgression.js';
import { abilityMod, SKILLS, type AbilityKey } from './skills.js';
import type { LevelUpFeatureChoice } from './levelingTypes.js';
import type { SheetAbility } from './types.js';

export const CREATOR_ABILITIES: AbilityKey[] = ['STR','DEX','CON','INT','WIS','CHA'];
export const STANDARD_ARRAY = [15,14,13,12,10,8];
export const POINT_COST: Record<number,number> = {8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
export const CREATOR_SPECIES = ['Human','Elf','Dwarf','Halfling','Orc','Gnome','Goliath','Dragonborn','Tiefling','Aasimar'] as const;
export const ORIGIN_FEATS = ['Tough','Alert','Savage Attacker','Skilled'] as const;
export const STARTER_MAGIC: Partial<Record<CoreClass,{cantrips:string[];spells:string[]}>> = {
  bard:{cantrips:['Vicious Mockery','Mage Hand'],spells:['Healing Word','Dissonant Whispers','Faerie Fire','Thunderwave']},
  cleric:{cantrips:['Sacred Flame','Guidance','Thaumaturgy'],spells:['Bless','Cure Wounds','Guiding Bolt','Healing Word']},
  druid:{cantrips:['Guidance','Produce Flame'],spells:['Cure Wounds','Entangle','Faerie Fire','Thunderwave']},
  paladin:{cantrips:[],spells:['Bless','Cure Wounds']},
  ranger:{cantrips:[],spells:['Cure Wounds','Hail of Thorns']},
  sorcerer:{cantrips:['Fire Bolt','Mage Hand','Shocking Grasp','Sorcerous Burst'],spells:['Chromatic Orb','Shield']},
  warlock:{cantrips:['Eldritch Blast','Mage Hand'],spells:['Hex','Armor of Agathys']},
  wizard:{cantrips:['Fire Bolt','Mage Hand','Prestidigitation'],spells:['Magic Missile','Shield','Mage Armor','Burning Hands','Detect Magic','Sleep']},
};
export function suggestedMagic(className:CoreClass,spells:SheetAbility[],level:number,count:number):string[] {
  const normalize=(s:string)=>s.toLowerCase().replace(/[’']/g,'');
  const preferred=STARTER_MAGIC[className]?.[level===0?'cantrips':'spells']??[];
  const available=spells.filter(s=>s.classes?.includes(className)&&s.level===level);
  return [...available].sort((a,b)=>{
    const rank=(name:string)=>{const n=preferred.findIndex(s=>normalize(s)===normalize(name));return n===-1?100:n;};
    return rank(a.name)-rank(b.name)||a.name.localeCompare(b.name);
  }).slice(0,count).map(s=>s.name);
}
export const CLASS_IDENTITY: Record<CoreClass,{title:string;symbol:string;color:string;summary:string;priority:AbilityKey[];saves:AbilityKey[];skills:string[];skillCount:number}> = {
  barbarian: {title:'Barbarian',symbol:'✦',color:'#d17747',summary:'Meet danger head-on. Rage, endure, and hit hard.',priority:['STR','CON','DEX','WIS','CHA','INT'],saves:['STR','CON'],skills:['Animal Handling','Athletics','Intimidation','Nature','Perception','Survival'],skillCount:2},
  bard: {title:'Bard',symbol:'♫',color:'#d19fc4',summary:'Inspire your allies and weave magic into every story.',priority:['CHA','DEX','CON','WIS','INT','STR'],saves:['DEX','CHA'],skills:SKILLS.map(s=>s.name),skillCount:3},
  cleric: {title:'Cleric',symbol:'☀',color:'#d7bf7e',summary:'Channel divine power to heal, protect, and smite.',priority:['WIS','CON','STR','DEX','CHA','INT'],saves:['WIS','CHA'],skills:['History','Insight','Medicine','Persuasion','Religion'],skillCount:2},
  druid: {title:'Druid',symbol:'❧',color:'#88b58c',summary:'Wield the wild magic of beasts, earth, and sky.',priority:['WIS','CON','DEX','INT','CHA','STR'],saves:['INT','WIS'],skills:['Animal Handling','Arcana','Insight','Medicine','Nature','Perception','Religion','Survival'],skillCount:2},
  fighter: {title:'Fighter',symbol:'⚔',color:'#c8ae7b',summary:'Master your weapons and hold the line.',priority:['STR','CON','DEX','WIS','CHA','INT'],saves:['STR','CON'],skills:['Acrobatics','Animal Handling','Athletics','History','Insight','Intimidation','Persuasion','Perception','Survival'],skillCount:2},
  monk: {title:'Monk',symbol:'◈',color:'#a5baca',summary:'Turn discipline and swift strikes into a weapon.',priority:['DEX','WIS','CON','STR','INT','CHA'],saves:['STR','DEX'],skills:['Acrobatics','Athletics','History','Insight','Religion','Stealth'],skillCount:2},
  paladin: {title:'Paladin',symbol:'✧',color:'#d5bf88',summary:'Stand for your oath with steel and healing magic.',priority:['STR','CHA','CON','WIS','DEX','INT'],saves:['WIS','CHA'],skills:['Athletics','Insight','Intimidation','Medicine','Persuasion','Religion'],skillCount:2},
  ranger: {title:'Ranger',symbol:'➶',color:'#9ab87e',summary:'Track your quarry and strike with blade, bow, and spell.',priority:['DEX','WIS','CON','STR','INT','CHA'],saves:['STR','DEX'],skills:['Animal Handling','Athletics','Insight','Investigation','Nature','Perception','Stealth','Survival'],skillCount:3},
  rogue: {title:'Rogue',symbol:'♠',color:'#af9ac1',summary:'Find the opening. Strike precisely and disappear.',priority:['DEX','CON','CHA','INT','WIS','STR'],saves:['DEX','INT'],skills:['Acrobatics','Athletics','Deception','Insight','Intimidation','Investigation','Perception','Persuasion','Sleight of Hand','Stealth'],skillCount:4},
  sorcerer: {title:'Sorcerer',symbol:'ϟ',color:'#cb7b88',summary:'Unleash the magic that lives within you.',priority:['CHA','CON','DEX','WIS','INT','STR'],saves:['CON','CHA'],skills:['Arcana','Deception','Insight','Intimidation','Persuasion','Religion'],skillCount:2},
  warlock: {title:'Warlock',symbol:'☽',color:'#ad91cd',summary:'Draw strange power from a pact beyond the ordinary.',priority:['CHA','CON','DEX','WIS','INT','STR'],saves:['WIS','CHA'],skills:['Arcana','Deception','History','Intimidation','Investigation','Nature','Religion'],skillCount:2},
  wizard: {title:'Wizard',symbol:'✺',color:'#8eaed1',summary:'Build a spellbook and bend the world through study.',priority:['INT','CON','DEX','WIS','CHA','STR'],saves:['INT','WIS'],skills:['Arcana','History','Insight','Investigation','Medicine','Religion'],skillCount:2},
};

export {STARTER_KITS,type StarterKit} from './startingEquipment2024.js';
import {STARTER_KITS,INSTRUMENTS,ARTISAN_TOOLS,BACKGROUND_STARTING_GOLD} from './startingEquipment2024.js';

export type CreatorChoices = {
  requestId:string; name:string; species:string; className:CoreClass;
  method:'array'|'points'|'roll'; scores:Record<AbilityKey,number>; rolled?:CreatorStatRoll;
  background:string; boosts:Partial<Record<AbilityKey,number>>; originFeat:string; humanFeat?:string;
  backgroundSkills:string[]; skills:string[]; extraSkills:string[];
  kitId:string; equipmentTool?:string; features:Record<string,string[]>; cantrips:string[]; spells:string[]; prepared:string[];
  tokenCrafting?:{enabled:boolean;appearance:string;heldWeapon?:string};
};
export type CreatorCatalog = {spells:SheetAbility[]; choices:Partial<Record<CoreClass,LevelUpFeatureChoice[]>>;traits:Record<string,SheetAbility[]>};
export type CreatorResult = {ok:true;characterId:string}|{ok:false;error:string};
export type CreatorStatGroup = {faces:number[];dropped:number;total:number};
export type CreatorStatRoll = {id:string;groups:CreatorStatGroup[];scores:number[]};
export type CreatorStatDraft = {id:string;groups:(CreatorStatGroup|null)[];scores:(number|null)[]};
export type CreatorStatRollRequest = {rollId:string;className:CoreClass;name:string;index?:number};
export type CreatorStatRollResult = {ok:true;roll:CreatorStatDraft}|{ok:false;error:string};
export function statGroupFromFaces(faces:number[]):CreatorStatGroup {
  if(faces.length!==4||faces.some(f=>!Number.isInteger(f)||f<1||f>6))throw new Error('Each stat needs four six-sided dice.');
  const dropped=faces.indexOf(Math.min(...faces));
  return {faces,dropped,total:faces.reduce((n,f)=>n+f,0)-faces[dropped]};
}
export function completeStatRoll(draft:CreatorStatDraft):CreatorStatRoll|undefined {
  if(draft.groups.length!==6||draft.groups.some(g=>!g)||draft.scores.length!==6||draft.scores.some(s=>s===null))return undefined;
  return {id:draft.id,groups:draft.groups as CreatorStatGroup[],scores:draft.scores as number[]};
}
export function statRollFromFaces(id:string,faces:number[]):CreatorStatRoll {
  if(faces.length!==24||faces.some(f=>!Number.isInteger(f)||f<1||f>6))throw new Error('Stat rolls need 24 six-sided dice.');
  const groups=Array.from({length:6},(_,i)=>statGroupFromFaces(faces.slice(i*4,i*4+4)));
  return {id,groups,scores:groups.map(g=>g.total)};
}
export function assignRolledScores(className:CoreClass,scores:number[]):Record<AbilityKey,number> {
  const ordered=[...scores].sort((a,b)=>b-a);
  return Object.fromEntries(CLASS_IDENTITY[className].priority.map((a,i)=>[a,ordered[i]])) as Record<AbilityKey,number>;
}

export function suggestedScores(className:CoreClass):Record<AbilityKey,number> {
  return Object.fromEntries(CLASS_IDENTITY[className].priority.map((a,i)=>[a,STANDARD_ARRAY[i]])) as Record<AbilityKey,number>;
}
export const pointCost = (scores:Record<AbilityKey,number>) => CREATOR_ABILITIES.reduce((n,a)=>n+(POINT_COST[scores[a]]??100),0);
export function creatorStats(c:CreatorChoices):Record<AbilityKey,number> {
  return Object.fromEntries(CREATOR_ABILITIES.map(a=>[a,c.scores[a]+(c.boosts[a]??0)])) as Record<AbilityKey,number>;
}
export function creatorHeldWeapons(c:CreatorChoices):string[]{
  return [...(STARTER_KITS[c.className].find(k=>k.id===c.kitId)?.weapons??[]),'Unarmed'];
}
export function creatorPreview(c:CreatorChoices) {
  const stats=creatorStats(c), p=classProgression2024(c.className,1)!, k=STARTER_KITS[c.className].find(k=>k.id===c.kitId)??STARTER_KITS[c.className][0];
  const dex=abilityMod(stats.DEX), con=abilityMod(stats.CON), wis=abilityMod(stats.WIS);
  let ac=k.armor==='chain'?16:k.armor==='shirt'?13+Math.min(2,dex):k.armor==='studded'?12+dex:k.armor==='leather'?11+dex:10+dex;
  if(k.armor==='none'&&c.className==='barbarian')ac+=con;
  if(k.armor==='none'&&c.className==='monk')ac+=wis;
  const toughness=c.originFeat==='Tough'||c.species==='Human'&&c.humanFeat==='Tough';
  const defense=c.features.fightingStyle?.includes('Defense')&&k.armor!=='none'?1:0;
  return {stats,hp:Math.max(1,p.hitDie+con)+(toughness?2:0)+(c.species==='Dwarf'?1:0),ac:ac+(k.shield?2:0)+defense,gold:k.gold+BACKGROUND_STARTING_GOLD,hitDie:p.hitDie,kit:k,progression:p};
}
export function creatorError(c:CreatorChoices,step:number,catalog?:CreatorCatalog):string|null {
  if(!c||!CORE_CLASSES_2024.includes(c.className)||!CREATOR_SPECIES.includes(c.species as typeof CREATOR_SPECIES[number]))return 'Choose a class and species.';
  if(step===0)return c.name.trim().length>=1&&c.name.trim().length<=60?null:'Give your character a name (up to 60 characters).';
  if(step===4){
    if(c.tokenCrafting?.enabled&&!creatorHeldWeapons(c).includes(c.tokenCrafting.heldWeapon??''))return 'Choose which equipped weapon your token will hold, or choose Unarmed.';
    if(c.tokenCrafting&&(typeof c.tokenCrafting.enabled!=='boolean'||typeof c.tokenCrafting.appearance!=='string'||c.tokenCrafting.appearance.length>600||c.tokenCrafting.enabled&&!c.tokenCrafting.appearance.trim()))return 'Describe your hero’s appearance in 1–600 characters to craft their token.';
    return null;
  }
  if(!CREATOR_ABILITIES.every(a=>Number.isInteger(c.scores?.[a])&&c.scores[a]>=(c.method==='roll'?3:8)&&c.scores[a]<=(c.method==='roll'?18:15)))return c.method==='roll'?'Rolled ability scores must be between 3 and 18.':'Base ability scores must be between 8 and 15.';
  if(c.method==='array'&&JSON.stringify(Object.values(c.scores).sort((a,b)=>b-a))!==JSON.stringify(STANDARD_ARRAY))return 'Use each standard-array score once.';
  if(c.method==='points'&&pointCost(c.scores)>27)return 'Spend no more than 27 ability points.';
  if(c.method==='roll'&&(!c.rolled||c.rolled.scores.length!==6||JSON.stringify(CREATOR_ABILITIES.map(a=>c.scores[a]).sort((a,b)=>b-a))!==JSON.stringify([...c.rolled.scores].sort((a,b)=>b-a))))return 'Roll your six scores, then use each score once.';
  if(!['array','points','roll'].includes(c.method))return 'Choose an ability-score method.';
  const boosts=Object.entries(c.boosts??{});
  if(boosts.some(([a,n])=>!CREATOR_ABILITIES.includes(a as AbilityKey)||!Number.isInteger(n)||n<0||n>2)||boosts.reduce((n,[,v])=>n+v,0)!==3)return 'Choose +2 and +1 to different abilities, or three +1 increases.';
  if(!c.background?.trim()||c.background.length>60)return 'Name your background.';
  if(!ORIGIN_FEATS.includes(c.originFeat as typeof ORIGIN_FEATS[number])||(c.species==='Human'&&(!ORIGIN_FEATS.includes(c.humanFeat as typeof ORIGIN_FEATS[number])||c.humanFeat===c.originFeat)))return 'Choose an origin feat (and a different bonus feat for a Human).';
  if(step===1)return null;
  const uniqueValid=(list:string[],allowed:string[],count:number)=>Array.isArray(list)&&list.length===count&&new Set(list).size===count&&list.every(s=>allowed.includes(s));
  const all=SKILLS.map(s=>s.name), cls=CLASS_IDENTITY[c.className];
  if(!uniqueValid(c.backgroundSkills,all,2))return 'Choose two background skills.';
  if(!uniqueValid(c.skills,cls.skills.filter(s=>!c.backgroundSkills.includes(s)),cls.skillCount))return `Choose ${cls.skillCount} different class skills.`;
  const extras=(c.species==='Human'?1:0)+(c.originFeat==='Skilled'||c.species==='Human'&&c.humanFeat==='Skilled'?3:0);
  if(!uniqueValid(c.extraSkills,all.filter(s=>![...c.backgroundSkills,...c.skills].includes(s)),extras))return `Choose ${extras} additional skill${extras===1?'':'s'}.`;
  if(!STARTER_KITS[c.className].some(k=>k.id===c.kitId))return 'Choose a starting loadout.';
  if(c.equipmentTool!==undefined&&!(c.className==='bard'?INSTRUMENTS:c.className==='monk'?[...ARTISAN_TOOLS,...INSTRUMENTS]:[]).includes(c.equipmentTool))return 'Choose a valid starting instrument or tool.';
  if(!catalog)return 'The character catalog is still loading.';
  const featureKeys=new Set((catalog.choices[c.className]??[]).map(f=>f.key));
  if(!c.features||Object.entries(c.features).some(([key,names])=>!Array.isArray(names)||names.length>0&&!featureKeys.has(key)))return 'A selected feature does not belong to this class.';
  for(const f of catalog.choices[c.className]??[]) {
    if(f.key==='orderCantrip')continue; // counted in the main cantrip picker
    if(f.when&&!c.features[f.when.key]?.includes(f.when.option))continue;
    const allowed=f.key==='expertise'?[...c.backgroundSkills,...c.skills,...c.extraSkills]:f.options.map(o=>o.name);
    if(!uniqueValid(c.features[f.key]??[],allowed,f.count))return `Choose ${f.count} option${f.count===1?'':'s'} for ${f.label}.`;
  }
  if(step===2)return null;
  const p=classProgression2024(c.className,1)!;
  const bonus=c.features.order?.some(s=>['Thaumaturge','Magician'].includes(s))?1:0;
  const allowed=catalog.spells.filter(s=>s.classes?.includes(c.className));
  if(!uniqueValid(c.cantrips,allowed.filter(s=>s.level===0).map(s=>s.name),p.cantrips+bonus))return `Choose ${p.cantrips+bonus} cantrips.`;
  const spellCount=c.className==='wizard'?6:p.preparedSpells;
  if(!uniqueValid(c.spells,allowed.filter(s=>s.level===1).map(s=>s.name),spellCount))return `Choose ${spellCount} first-level spells.`;
  if(!uniqueValid(c.prepared,c.spells,p.preparedSpells))return `Prepare ${p.preparedSpells} spells.`;
  return null;
}
