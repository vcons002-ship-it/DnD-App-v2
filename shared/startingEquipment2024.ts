/** 2024 Free Rules, Core Class Traits / Starting Equipment.
 * https://www.dndbeyond.com/sources/dnd/br-2024/character-classes
 * Quantities live in inventory; an attack appears once per weapon type. */
import type {CoreClass} from './characterProgression.js';
export type StartingItem={name:string;qty:number};
export type StarterKit={id:string;name:string;description:string;weapons:string[];armor:'none'|'leather'|'studded'|'shirt'|'chain';shield?:boolean;items:StartingItem[];gold:number};
const item=(name:string,qty=1):StartingItem=>({name,qty});
const pack=(id:string,name:string,weapons:string[],armor:StarterKit['armor'],gold:number,items:StartingItem[],shield=false):StarterKit=>({id,name,weapons,armor,gold,items,shield,description:[...items.map(i=>`${i.qty>1?`${i.qty} `:''}${i.name}`),`${gold} GP`].join(', ')});
const gold=(amount:number):StarterKit=>pack('gold',`Gold alternative · ${amount} GP`,[],'none',amount,[]);
export const STARTER_KITS:Record<CoreClass,StarterKit[]>={
  barbarian:[pack('axe','A · Greataxe & handaxes',['Greataxe','Handaxe'],'none',15,[item('Greataxe'),item('Handaxe',4),item("Explorer's Pack")]),gold(75)],
  bard:[pack('duelist','A · Bard equipment',['Dagger'],'leather',19,[item('Leather Armor'),item('Dagger',2),item('Musical Instrument'),item("Entertainer's Pack")]),gold(90)],
  cleric:[pack('guard','A · Cleric equipment',['Mace'],'shirt',7,[item('Chain Shirt'),item('Shield'),item('Mace'),item('Holy Symbol'),item("Priest's Pack")],true),gold(110)],
  druid:[pack('wanderer','A · Druid equipment',['Sickle','Quarterstaff'],'leather',9,[item('Leather Armor'),item('Shield'),item('Sickle'),item('Druidic Focus (Quarterstaff)'),item("Explorer's Pack"),item('Herbalism Kit')],true),gold(50)],
  fighter:[pack('greatsword','A · Greatsword & chain mail',['Greatsword','Flail','Javelin'],'chain',4,[item('Chain Mail'),item('Greatsword'),item('Flail'),item('Javelin',8),item("Dungeoneer's Pack")]),pack('archer','B · Archer & twin blades',['Scimitar','Shortsword','Longbow'],'studded',11,[item('Studded Leather Armor'),item('Scimitar'),item('Shortsword'),item('Longbow'),item('Arrows',20),item('Quiver'),item("Dungeoneer's Pack")]),gold(155)],
  monk:[pack('staff','A · Spear & daggers',['Spear','Dagger'],'none',11,[item('Spear'),item('Dagger',5),item('Chosen Tool'),item("Explorer's Pack")]),gold(50)],
  paladin:[pack('guardian','A · Longsword & shield',['Longsword','Javelin'],'chain',9,[item('Chain Mail'),item('Shield'),item('Longsword'),item('Javelin',6),item('Holy Symbol'),item("Priest's Pack")],true),gold(150)],
  ranger:[pack('archer','A · Ranger equipment',['Scimitar','Shortsword','Longbow'],'studded',7,[item('Studded Leather Armor'),item('Scimitar'),item('Shortsword'),item('Longbow'),item('Arrows',20),item('Quiver'),item('Druidic Focus (Sprig of Mistletoe)'),item("Explorer's Pack")]),gold(150)],
  rogue:[pack('scout','A · Rogue equipment',['Dagger','Shortsword','Shortbow'],'leather',8,[item('Leather Armor'),item('Dagger',2),item('Shortsword'),item('Shortbow'),item('Arrows',20),item('Quiver'),item("Thieves' Tools"),item("Burglar's Pack")]),gold(100)],
  sorcerer:[pack('focus','A · Sorcerer equipment',['Spear','Dagger'],'none',28,[item('Spear'),item('Dagger',2),item('Arcane Focus (Crystal)'),item("Dungeoneer's Pack")]),gold(50)],
  warlock:[pack('pact','A · Warlock equipment',['Sickle','Dagger'],'leather',15,[item('Leather Armor'),item('Sickle'),item('Dagger',2),item('Arcane Focus (Orb)'),item('Book (Occult Lore)'),item("Scholar's Pack")]),gold(100)],
  wizard:[pack('scholar','A · Wizard equipment',['Dagger','Quarterstaff'],'none',5,[item('Dagger',2),item('Arcane Focus (Quarterstaff)'),item('Robe'),item('Spellbook'),item("Scholar's Pack")]),gold(55)],
};
export const INSTRUMENTS=['Bagpipes','Drum','Dulcimer','Flute','Horn','Lute','Lyre','Pan Flute','Shawm','Viol'];
export const ARTISAN_TOOLS=["Alchemist's Supplies","Brewer's Supplies","Calligrapher's Supplies","Carpenter's Tools","Cartographer's Tools","Cobbler's Tools","Cook's Utensils","Glassblower's Tools","Jeweler's Tools","Leatherworker's Tools","Mason's Tools","Painter's Supplies","Potter's Tools","Smith's Tools","Tinker's Tools","Weaver's Tools","Woodcarver's Tools"];
// The creator supports custom backgrounds. Taking the published 50-GP
// alternative avoids inventing a package for a free-text background.
export const BACKGROUND_STARTING_GOLD=50;
export const ARMOR_NAMES={leather:'Leather Armor',studded:'Studded Leather Armor',shirt:'Chain Shirt',chain:'Chain Mail'};
