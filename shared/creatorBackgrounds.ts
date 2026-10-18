import type {AbilityKey} from './skills.js';
import type {StartingItem} from './startingEquipment2024.js';

/** Reviewed 2024 Free Rules presets whose origin feats the creator supports.
 * Other origins remain explicit custom choices; a name alone grants no rules.
 * https://www.dndbeyond.com/sources/dnd/br-2024/character-origins */
export const GAMING_SETS=['Dice Set','Dragonchess Set','Playing Card Set','Three-Dragon Ante Set'];
export const CREATOR_BACKGROUNDS:{id:string;name:string;summary:string;abilities:AbilityKey[];skills:string[];feat:string;tools:string[];items:StartingItem[];gold:number;weapons:string[]}[]=[
 {id:'soldier',name:'Soldier',summary:'Military training, weapon experience and battlefield discipline.',abilities:['STR','DEX','CON'],skills:['Athletics','Intimidation'],feat:'Savage Attacker',tools:GAMING_SETS,items:[{name:'Spear',qty:1},{name:'Shortbow',qty:1},{name:'Arrows',qty:20},{name:'Chosen Background Tool',qty:1},{name:"Healer's Kit",qty:1},{name:'Quiver',qty:1},{name:"Clothes, Traveler's",qty:1}],gold:14,weapons:['Spear','Shortbow']},
 {id:'criminal',name:'Criminal',summary:'A past spent working quietly, opening locks and staying alert.',abilities:['DEX','CON','INT'],skills:['Sleight of Hand','Stealth'],feat:'Alert',tools:["Thieves' Tools"],items:[{name:'Dagger',qty:2},{name:"Thieves' Tools",qty:1},{name:'Crowbar',qty:1},{name:'Pouch',qty:2},{name:"Clothes, Traveler's",qty:1}],gold:16,weapons:['Dagger']},
];
export const creatorBackground=(id?:string)=>CREATOR_BACKGROUNDS.find(b=>b.id===id);

/** A receipt is immutable history; each occurrence (including tied rolls) is
 * allocated once to the current destination ability rather than its roll slot. */
export function rolledScoreAssignments(scores:Record<AbilityKey,number>,pool:number[]):(AbilityKey|undefined)[]{
 const available=(['STR','DEX','CON','INT','WIS','CHA'] as AbilityKey[]).slice();
 return pool.map(value=>{const i=available.findIndex(a=>scores[a]===value);return i<0?undefined:available.splice(i,1)[0];});
}
