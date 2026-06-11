// Curated D&D 5e item catalogue used to seed the cross-session item library.
//
// Descriptions are paraphrased from the System Reference Document (SRD), released
// by Wizards of the Coast under the Creative Commons / Open Game License — NOT
// copied from the proprietary 2024 Player's Handbook / Dungeon Master's Guide.
// Magic items are a representative SRD-safe selection (the full DMG catalogue is
// not open content). The library is framework-free data: { name, description,
// qtyDefault }, matching LibraryItem.

import type { ModTarget } from '../../../shared/types.js';

/** A preset magic effect (id + source are filled in when the item is saved —
 *  a blank source falls back to the item's name on the sheet). */
export type SrdItemModifier = { target: ModTarget; value: number; set?: boolean };

export type SrdItem = {
  name: string;
  description: string;
  qtyDefault?: number;
  /** Numeric effects the VTT auto-applies while the item is equipped. Items can
   *  carry several (e.g. Cloak of Protection = +1 AC AND +1 all saves);
   *  `set` floors an ability score at `value` instead of adding to it. */
  modifiers?: SrdItemModifier[];
  /** Loose grouping (not persisted) — kept for readability/maintenance. */
  category:
    | 'gear'
    | 'tool'
    | 'armor'
    | 'weapon'
    | 'consumable'
    | 'magic';
};

export const SRD_ITEMS: SrdItem[] = [
  // ---- Adventuring gear -----------------------------------------------------
  { category: 'gear', name: 'Backpack', description: 'A sturdy pack worn on the back; holds roughly 1 cubic foot / 30 lb of gear.' },
  { category: 'gear', name: 'Bedroll', description: 'Padded roll for sleeping outdoors; wards off the cold ground.' },
  { category: 'gear', name: 'Blanket', description: 'A warm woollen blanket.' },
  { category: 'gear', name: 'Rope, Hempen (50 ft)', description: 'Has 2 hit points and can be burst with a DC 17 Strength check.' },
  { category: 'gear', name: 'Rope, Silk (50 ft)', description: 'Lighter and stronger than hemp; 2 hit points, burst with a DC 17 Strength check.' },
  { category: 'gear', name: 'Grappling Hook', description: 'A many-pronged iron hook for anchoring a rope to ledges or battlements.' },
  { category: 'gear', name: 'Piton', description: 'An iron spike hammered into rock or wood to anchor a rope.', qtyDefault: 10 },
  { category: 'gear', name: 'Torch', description: 'Burns for 1 hour, casting bright light in a 20-ft radius and dim light 20 ft beyond. A lit torch deals 1 fire damage as an improvised weapon.', qtyDefault: 5 },
  { category: 'gear', name: 'Lantern, Hooded', description: 'Sheds bright light in a 30-ft radius and dim light 30 ft beyond; burns 1 hour on a flask of oil. You can lower the hood to dim it to a 5-ft radius.' },
  { category: 'gear', name: 'Lantern, Bullseye', description: 'Casts bright light in a 60-ft cone and dim light 60 ft beyond; burns 1 hour on a flask of oil.' },
  { category: 'gear', name: 'Oil (flask)', description: 'Fuels a lamp/lantern for 6 hours, or can be thrown (DC 8 hit) to splash a target; if ignited it deals 5 fire damage.', qtyDefault: 2 },
  { category: 'gear', name: 'Tinderbox', description: 'Flint, steel, and tinder for lighting fires; lighting a torch (or similar) takes an action.' },
  { category: 'gear', name: 'Candle', description: 'Burns 1 hour, giving bright light in a 5-ft radius and dim light 5 ft beyond.', qtyDefault: 5 },
  { category: 'gear', name: 'Rations (1 day)', description: 'Dry foods suitable for travel: jerky, dried fruit, hardtack, and nuts.', qtyDefault: 5 },
  { category: 'gear', name: 'Waterskin', description: 'Holds 4 pints of liquid.' },
  { category: 'gear', name: 'Mess Kit', description: 'A tin box with a cup and simple cutlery for cooking and eating on the road.' },
  { category: 'gear', name: 'Crowbar', description: 'Grants advantage on Strength checks where leverage helps, such as prying.' },
  { category: 'gear', name: 'Hammer', description: 'A light hammer for driving pitons and similar tasks.' },
  { category: 'gear', name: 'Hammer, Sledge', description: 'A heavy two-handed hammer for smashing through obstacles.' },
  { category: 'gear', name: 'Shovel', description: 'For digging trenches, graves, and the like.' },
  { category: 'gear', name: 'Pole (10 ft)', description: 'A simple wooden pole, handy for probing floors and triggering traps from a distance.' },
  { category: 'gear', name: 'Ladder (10 ft)', description: 'A standard wooden ladder.' },
  { category: 'gear', name: 'Chain (10 ft)', description: 'Has 10 hit points and can be burst with a DC 20 Strength check.' },
  { category: 'gear', name: 'Manacles', description: 'Restrain a Small or Medium creature; escaping requires a DC 20 Dexterity (Sleight of Hand) check, or DC 20 Strength to break.' },
  { category: 'gear', name: 'Lock', description: 'Comes with one key; picking it requires thieves’ tools and a DC 15 Dexterity check.' },
  { category: 'gear', name: 'Caltrops (bag of 20)', description: 'Spread over a 5-ft square; a creature entering it makes a DC 15 Dexterity save or takes 1 piercing damage and has its speed reduced to 0 until the start of its next turn.' },
  { category: 'gear', name: 'Ball Bearings (bag of 1,000)', description: 'Spilled over a 10-ft square; a creature moving through must make a DC 10 Dexterity save or fall prone.' },
  { category: 'gear', name: 'Hunting Trap', description: 'A spring-loaded jaw; a creature stepping on it makes a DC 13 Dexterity save or takes 1d4 piercing damage and stops moving (restrained until freed).' },
  { category: 'gear', name: 'Healer’s Kit', description: 'Ten uses. As an action, expend one use to stabilize a dying creature without a Wisdom (Medicine) check.' },
  { category: 'gear', name: 'Antitoxin (vial)', description: 'Drinking it grants advantage on saving throws against poison for 1 hour. It confers no benefit to undead or constructs.' },
  { category: 'gear', name: 'Acid (vial)', description: 'As an action, throw it up to 20 ft (ranged attack vs. AC); on a hit it deals 2d6 acid damage.' },
  { category: 'gear', name: 'Alchemist’s Fire (flask)', description: 'Thrown (ranged attack, 20 ft); on a hit the target takes 1d4 fire damage at the start of each of its turns. A creature can end this by using an action to make a DC 10 Dexterity check.' },
  { category: 'gear', name: 'Holy Water (flask)', description: 'Thrown (ranged attack, 20 ft); on a hit a fiend or undead takes 2d6 radiant damage.' },
  { category: 'gear', name: 'Poison, Basic (vial)', description: 'Coat one weapon or up to three pieces of ammunition; on a hit the target makes a DC 10 Constitution save or takes 1d4 poison damage. The coating dries after 1 minute.' },
  { category: 'gear', name: 'Bell', description: 'A small bell, useful as an alarm.' },
  { category: 'gear', name: 'Chalk (1 piece)', description: 'For marking trails, doors, and walls.', qtyDefault: 5 },
  { category: 'gear', name: 'Ink (1 oz bottle)', description: 'A bottle of writing ink.' },
  { category: 'gear', name: 'Ink Pen', description: 'A simple quill or reed pen.' },
  { category: 'gear', name: 'Paper (one sheet)', description: 'A sheet of writing paper.', qtyDefault: 10 },
  { category: 'gear', name: 'Parchment (one sheet)', description: 'A sheet of durable parchment.', qtyDefault: 10 },
  { category: 'gear', name: 'Book', description: 'A tome of lore, poetry, history, or arcane formulae.' },
  { category: 'gear', name: 'Map or Scroll Case', description: 'A cylindrical leather or wooden case that holds rolled maps or scrolls.' },
  { category: 'gear', name: 'Magnifying Glass', description: 'Aids close inspection; lighting a fire with it (in bright light) takes about 5 minutes.' },
  { category: 'gear', name: 'Spyglass', description: 'Objects viewed through it are magnified to twice their size.' },
  { category: 'gear', name: 'Hourglass', description: 'Measures the passage of an hour with falling sand.' },
  { category: 'gear', name: 'Signal Whistle', description: 'A loud whistle for sending simple signals across distance.' },
  { category: 'gear', name: 'Sealing Wax', description: 'For sealing letters and stamping a signet.' },
  { category: 'gear', name: 'Signet Ring', description: 'A ring engraved with a personal or house emblem for sealing documents.' },
  { category: 'gear', name: 'Soap', description: 'A bar of soap.' },
  { category: 'gear', name: 'Whetstone', description: 'For honing a blade’s edge.' },
  { category: 'gear', name: 'Mirror, Steel', description: 'A small polished steel mirror, handy for looking around corners.' },
  { category: 'gear', name: 'Vial', description: 'A small glass vial or bottle holding up to 4 ounces.', qtyDefault: 3 },
  { category: 'gear', name: 'Flask or Tankard', description: 'Holds up to 1 pint of liquid.' },
  { category: 'gear', name: 'Pot, Iron', description: 'A cooking pot that holds about a gallon.' },
  { category: 'gear', name: 'Sack', description: 'A cloth or leather sack for hauling loot.', qtyDefault: 2 },
  { category: 'gear', name: 'Pouch', description: 'A small belt pouch holding up to 1/5 cubic foot or 6 lb of gear.', qtyDefault: 2 },
  { category: 'gear', name: 'Basket', description: 'A woven container holding about 2 cubic feet of goods.' },
  { category: 'gear', name: 'Barrel', description: 'Holds roughly 40 gallons of liquid or 4 cubic feet of dry goods.' },
  { category: 'gear', name: 'Chest', description: 'A wooden chest holding about 12 cubic feet of gear.' },
  { category: 'gear', name: 'Quiver', description: 'Holds up to 20 arrows.' },
  { category: 'gear', name: 'Case, Crossbow Bolt', description: 'Holds up to 20 crossbow bolts.' },
  { category: 'gear', name: 'Climber’s Kit', description: 'Pitons, boot tips, gloves, and a harness; while anchored you can’t fall more than 25 ft, nor move more than 25 ft from the anchor.' },
  { category: 'gear', name: 'Fishing Tackle', description: 'A rod, line, hooks, and lures for catching fish.' },
  { category: 'gear', name: 'Hunting Trap', description: 'A spring trap that restrains and wounds a creature that steps on it.' },
  { category: 'gear', name: 'Component Pouch', description: 'A watertight belt pouch holding the material spell components that lack a listed cost.' },
  { category: 'gear', name: 'Spellbook', description: 'A leather-bound book of 100 blank vellum pages for recording a wizard’s spells.' },
  { category: 'gear', name: 'Arcane Focus', description: 'A crystal, orb, rod, staff, or wand that channels arcane magic in place of certain material components.' },
  { category: 'gear', name: 'Druidic Focus', description: 'A sprig of mistletoe, a totem, a yew wand, or a wooden staff that channels druid magic.' },
  { category: 'gear', name: 'Holy Symbol', description: 'An amulet, emblem, or reliquary that channels divine magic for clerics and paladins.' },
  { category: 'gear', name: 'Perfume (vial)', description: 'A vial of fine scent.' },

  // ---- Tools & kits ---------------------------------------------------------
  { category: 'tool', name: 'Thieves’ Tools', description: 'Picks, a small file, a mirror, and pliers; used to pick locks and disarm traps.' },
  { category: 'tool', name: 'Disguise Kit', description: 'Cosmetics, hair dye, and props; proficiency adds your bonus to checks made to create a disguise.' },
  { category: 'tool', name: 'Forgery Kit', description: 'Papers, inks, seals, and wax for producing convincing fake documents.' },
  { category: 'tool', name: 'Herbalism Kit', description: 'Pouches, clippers, and vials for harvesting plants; needed to craft potions of healing and identify herbs.' },
  { category: 'tool', name: 'Poisoner’s Kit', description: 'Vials, chemicals, and a glass mixer for crafting and applying poisons.' },
  { category: 'tool', name: 'Navigator’s Tools', description: 'Charts, a compass, and a sextant for plotting a course and avoiding hazards at sea.' },
  { category: 'tool', name: 'Smith’s Tools', description: 'Hammers, tongs, and a portable forge for working metal and repairing armor.' },
  { category: 'tool', name: 'Carpenter’s Tools', description: 'Saws, hammers, and chisels for building and repairing wooden structures.' },
  { category: 'tool', name: 'Mason’s Tools', description: 'Trowels, hammers, and chisels for working stone.' },
  { category: 'tool', name: 'Cook’s Utensils', description: 'A metal pot, knives, and ladles for preparing meals.' },
  { category: 'tool', name: 'Tinker’s Tools', description: 'A whetstone, files, and odds and ends for making and mending small devices.' },
  { category: 'tool', name: 'Cartographer’s Tools', description: 'Pens, ink, parchment, and calipers for drawing accurate maps.' },
  { category: 'tool', name: 'Alchemist’s Supplies', description: 'Beakers, retorts, and reagents for brewing useful substances.' },
  { category: 'tool', name: 'Brewer’s Supplies', description: 'Casks, siphons, and brewing know-how for making ale and spirits.' },
  { category: 'tool', name: 'Calligrapher’s Supplies', description: 'Fine inks, quills, and parchment for elegant writing.' },
  { category: 'tool', name: 'Leatherworker’s Tools', description: 'Knives, needles, and a punch for crafting and repairing leather goods.' },
  { category: 'tool', name: 'Weaver’s Tools', description: 'A loom, thread, and needles for making cloth and clothing.' },
  { category: 'tool', name: 'Painter’s Supplies', description: 'Brushes, paints, and canvas for creating artwork.' },
  { category: 'tool', name: 'Gaming Set (dice or cards)', description: 'A set of dice or playing cards for games of chance and skill.' },
  { category: 'tool', name: 'Musical Instrument', description: 'A lute, flute, drum, or similar; proficiency lets you add your bonus to checks made to perform.' },

  // ---- Armor ----------------------------------------------------------------
  { category: 'armor', name: 'Padded Armor', description: 'Light armor of quilted layers. AC 11 + Dex modifier; imposes disadvantage on Stealth.' },
  { category: 'armor', name: 'Leather Armor', description: 'Light armor of boiled leather. AC 11 + Dex modifier.' },
  { category: 'armor', name: 'Studded Leather Armor', description: 'Light armor reinforced with rivets. AC 12 + Dex modifier.' },
  { category: 'armor', name: 'Hide Armor', description: 'Medium armor of thick furs and pelts. AC 12 + Dex modifier (max 2).' },
  { category: 'armor', name: 'Chain Shirt', description: 'Medium armor worn under clothing. AC 13 + Dex modifier (max 2).' },
  { category: 'armor', name: 'Scale Mail', description: 'Medium armor of overlapping scales. AC 14 + Dex modifier (max 2); disadvantage on Stealth.' },
  { category: 'armor', name: 'Breastplate', description: 'Medium armor: a fitted chest piece. AC 14 + Dex modifier (max 2).' },
  { category: 'armor', name: 'Half Plate', description: 'Medium armor of shaped plates. AC 15 + Dex modifier (max 2); disadvantage on Stealth.' },
  { category: 'armor', name: 'Ring Mail', description: 'Heavy armor of leather set with metal rings. AC 14; disadvantage on Stealth.' },
  { category: 'armor', name: 'Chain Mail', description: 'Heavy interlocked rings. AC 16; requires Strength 13; disadvantage on Stealth.' },
  { category: 'armor', name: 'Splint Armor', description: 'Heavy armor of vertical metal strips. AC 17; requires Strength 15; disadvantage on Stealth.' },
  { category: 'armor', name: 'Plate Armor', description: 'Full heavy plate. AC 18; requires Strength 15; disadvantage on Stealth.' },
  { category: 'armor', name: 'Shield', description: 'Carried in one hand; grants a +2 bonus to AC.',
    modifiers: [{ target: { kind: 'ac' }, value: 2 }] },

  // ---- Weapons (a representative selection; full stats live in the weapon book) ----
  { category: 'weapon', name: 'Dagger', description: 'Simple melee weapon. 1d4 piercing; finesse, light, thrown (20/60).' },
  { category: 'weapon', name: 'Club', description: 'Simple melee weapon. 1d4 bludgeoning; light.' },
  { category: 'weapon', name: 'Quarterstaff', description: 'Simple melee weapon. 1d6 bludgeoning; versatile (1d8).' },
  { category: 'weapon', name: 'Handaxe', description: 'Simple melee weapon. 1d6 slashing; light, thrown (20/60).' },
  { category: 'weapon', name: 'Spear', description: 'Simple melee weapon. 1d6 piercing; thrown (20/60), versatile (1d8).' },
  { category: 'weapon', name: 'Light Crossbow', description: 'Simple ranged weapon. 1d8 piercing; ammunition (80/320), loading, two-handed.' },
  { category: 'weapon', name: 'Shortbow', description: 'Simple ranged weapon. 1d6 piercing; ammunition (80/320), two-handed.' },
  { category: 'weapon', name: 'Longsword', description: 'Martial melee weapon. 1d8 slashing; versatile (1d10).' },
  { category: 'weapon', name: 'Rapier', description: 'Martial melee weapon. 1d8 piercing; finesse.' },
  { category: 'weapon', name: 'Shortsword', description: 'Martial melee weapon. 1d6 piercing; finesse, light.' },
  { category: 'weapon', name: 'Greatsword', description: 'Martial melee weapon. 2d6 slashing; heavy, two-handed.' },
  { category: 'weapon', name: 'Greataxe', description: 'Martial melee weapon. 1d12 slashing; heavy, two-handed.' },
  { category: 'weapon', name: 'Maul', description: 'Martial melee weapon. 2d6 bludgeoning; heavy, two-handed.' },
  { category: 'weapon', name: 'Warhammer', description: 'Martial melee weapon. 1d8 bludgeoning; versatile (1d10).' },
  { category: 'weapon', name: 'Battleaxe', description: 'Martial melee weapon. 1d8 slashing; versatile (1d10).' },
  { category: 'weapon', name: 'Glaive', description: 'Martial melee weapon. 1d10 slashing; heavy, reach, two-handed.' },
  { category: 'weapon', name: 'Halberd', description: 'Martial melee weapon. 1d10 slashing; heavy, reach, two-handed.' },
  { category: 'weapon', name: 'Longbow', description: 'Martial ranged weapon. 1d8 piercing; ammunition (150/600), heavy, two-handed.' },
  { category: 'weapon', name: 'Heavy Crossbow', description: 'Martial ranged weapon. 1d10 piercing; ammunition (100/400), heavy, loading, two-handed.' },
  { category: 'weapon', name: 'Hand Crossbow', description: 'Martial ranged weapon. 1d6 piercing; ammunition (30/120), light, loading.' },
  { category: 'weapon', name: 'Arrows (20)', description: 'Ammunition for shortbows and longbows.', qtyDefault: 20 },
  { category: 'weapon', name: 'Crossbow Bolts (20)', description: 'Ammunition for crossbows.', qtyDefault: 20 },
  { category: 'weapon', name: 'Sling Bullets (20)', description: 'Ammunition for slings.', qtyDefault: 20 },

  // ---- Potions & consumables ------------------------------------------------
  { category: 'consumable', name: 'Potion of Healing', description: 'Drinking it (a bonus action) restores 2d4 + 2 hit points.' },
  { category: 'consumable', name: 'Potion of Greater Healing', description: 'Restores 4d4 + 4 hit points.' },
  { category: 'consumable', name: 'Potion of Superior Healing', description: 'Restores 8d4 + 8 hit points.' },
  { category: 'consumable', name: 'Potion of Supreme Healing', description: 'Restores 10d4 + 20 hit points.' },
  { category: 'consumable', name: 'Potion of Climbing', description: 'For 1 hour you have a climbing speed equal to your walking speed and advantage on Strength (Athletics) checks to climb.' },
  { category: 'consumable', name: 'Potion of Water Breathing', description: 'You can breathe underwater for 1 hour after drinking it.' },
  { category: 'consumable', name: 'Potion of Fire Resistance', description: 'You have resistance to fire damage for 1 hour.' },
  { category: 'consumable', name: 'Potion of Heroism', description: 'For 1 hour you gain 10 temporary hit points and the benefit of the bless spell (no concentration).' },
  { category: 'consumable', name: 'Potion of Growth', description: 'Your size increases for 1d4 hours as if affected by the enlarge effect of enlarge/reduce.' },

  // ---- Magic items (SRD selection) ------------------------------------------
  { category: 'magic', name: 'Bag of Holding', description: 'Holds up to 500 lb in an extradimensional space (interior ~64 cubic feet) while weighing 15 lb. Overloading or piercing it destroys it.' },
  { category: 'magic', name: 'Cloak of Protection', description: 'Requires attunement. You gain a +1 bonus to AC and saving throws while you wear it.',
    modifiers: [{ target: { kind: 'ac' }, value: 1 }, { target: { kind: 'save' }, value: 1 }] },
  { category: 'magic', name: 'Ring of Protection', description: 'Requires attunement. You gain a +1 bonus to AC and saving throws while you wear it.',
    modifiers: [{ target: { kind: 'ac' }, value: 1 }, { target: { kind: 'save' }, value: 1 }] },
  { category: 'magic', name: 'Cloak of Elvenkind', description: 'Requires attunement. With the hood up, Wisdom (Perception) checks to see you have disadvantage and you have advantage on Stealth checks to hide.' },
  { category: 'magic', name: 'Boots of Elvenkind', description: 'Your steps make no sound; you have advantage on Dexterity (Stealth) checks to move silently.' },
  { category: 'magic', name: 'Boots of Striding and Springing', description: 'Requires attunement. Your walking speed becomes 30 ft (if lower), it can’t be reduced below that, and you can jump three times the normal distance.' },
  { category: 'magic', name: 'Boots of Speed', description: 'Requires attunement. As a bonus action, click the heels to double your speed and impose disadvantage on opportunity attacks against you for up to 10 minutes.' },
  { category: 'magic', name: 'Winged Boots', description: 'Requires attunement. You gain a flying speed equal to your walking speed for up to 4 hours of flight, used in increments.' },
  { category: 'magic', name: 'Gauntlets of Ogre Power', description: 'Requires attunement. Your Strength score becomes 19 while you wear them.',
    modifiers: [{ target: { kind: 'ability', ability: 'STR' }, value: 19, set: true }] },
  { category: 'magic', name: 'Headband of Intellect', description: 'Requires attunement. Your Intelligence score becomes 19 while you wear it.',
    modifiers: [{ target: { kind: 'ability', ability: 'INT' }, value: 19, set: true }] },
  { category: 'magic', name: 'Amulet of Health', description: 'Requires attunement. Your Constitution score becomes 19 while you wear it.',
    modifiers: [{ target: { kind: 'ability', ability: 'CON' }, value: 19, set: true }] },
  { category: 'magic', name: 'Bracers of Defense', description: 'Requires attunement. You gain a +2 bonus to AC while wearing no armor and no shield.',
    modifiers: [{ target: { kind: 'ac' }, value: 2 }] },
  { category: 'magic', name: 'Brooch of Shielding', description: 'Requires attunement. You have resistance to force damage and immunity to the magic missile spell.' },
  { category: 'magic', name: 'Pearl of Power', description: 'Requires attunement by a spellcaster. As an action, recover one expended spell slot of 3rd level or lower (once per day).' },
  { category: 'magic', name: 'Wand of Magic Missiles', description: 'Has 7 charges; expend 1 or more to cast magic missile (1st level per charge). Regains 1d6+1 charges at dawn.' },
  { category: 'magic', name: 'Wand of the War Mage +1', description: 'Requires attunement by a spellcaster. You gain a +1 bonus to spell attack rolls and ignore half cover against your spell targets.',
    modifiers: [{ target: { kind: 'attack' }, value: 1 }] },
  { category: 'magic', name: 'Immovable Rod', description: 'A flat iron rod that, when its button is pressed, fixes magically in place (holding up to 8,000 lb) until the button is pressed again.' },
  { category: 'magic', name: 'Rope of Climbing', description: 'A 60-ft rope that animates on command to fasten, knot, or unknot itself; it has 20 hit points and regains 1 per 5 minutes.' },
  { category: 'magic', name: 'Goggles of Night', description: 'You have darkvision out to 60 ft while wearing them (or +60 ft if you already have it).' },
  { category: 'magic', name: 'Eyes of the Eagle', description: 'Requires attunement. You have advantage on Wisdom (Perception) checks that rely on sight.' },
  { category: 'magic', name: 'Gloves of Swimming and Climbing', description: 'Requires attunement. Climbing and swimming cost no extra movement and you gain a +5 bonus to checks made to climb or swim.',
    modifiers: [{ target: { kind: 'skill', skill: 'Athletics' }, value: 5 }] },
  { category: 'magic', name: 'Slippers of Spider Climbing', description: 'Requires attunement. You can move up, down, and across vertical surfaces and ceilings, leaving your hands free, with a climb speed equal to your walking speed.' },
  { category: 'magic', name: 'Hat of Disguise', description: 'Requires attunement. While wearing it you can cast disguise self at will.' },
  { category: 'magic', name: 'Decanter of Endless Water', description: 'A command word makes it pour fresh or salt water (stream, fountain, or geyser) up to 30 gallons per round.' },
  { category: 'magic', name: 'Driftglobe', description: 'A glass sphere you can command to cast light or daylight and float, following you at up to 60 ft.' },
  { category: 'magic', name: 'Sending Stones', description: 'A matched pair; using an action with one lets you cast sending to the holder of the other, once per day.' },
  { category: 'magic', name: 'Stone of Good Luck (Luckstone)', description: 'Requires attunement. You gain a +1 bonus to ability checks and saving throws while it’s on your person.',
    modifiers: [{ target: { kind: 'skill' }, value: 1 }, { target: { kind: 'save' }, value: 1 }] },
  { category: 'magic', name: 'Ring of Jumping', description: 'Requires attunement. As a bonus action you can cast jump on yourself at will.' },
  { category: 'magic', name: 'Ring of Free Action', description: 'Requires attunement. Difficult terrain doesn’t cost extra movement, and you can’t be paralyzed or restrained by magic.' },
  { category: 'magic', name: 'Dust of Disappearance', description: 'Throwing a pinch makes you and everything within 10 ft invisible for 2d4 minutes (ends early if you attack or cast a spell).' },
  { category: 'magic', name: 'Potion of Invisibility', description: 'You become invisible for 1 hour, ending early if you attack or cast a spell.' },
  { category: 'magic', name: 'Potion of Flying', description: 'You gain a flying speed equal to your walking speed for 1 hour and can hover.' },
  { category: 'magic', name: 'Potion of Giant Strength (Hill)', description: 'Your Strength score becomes 21 for 1 hour.',
    modifiers: [{ target: { kind: 'ability', ability: 'STR' }, value: 21, set: true }] },
  { category: 'magic', name: 'Oil of Slipperiness', description: 'Applied to a creature or object, it grants the effect of freedom of movement for 8 hours, or coats a 10-ft square as a grease spell.' },
  { category: 'magic', name: 'Bag of Tricks (Gray)', description: 'Requires no attunement. Pull out a fuzzy ball and throw it up to 20 ft to summon a random beast (per the gray table) for up to 1 hour; up to 3 uses per day.' },
  { category: 'magic', name: 'Spell Scroll (1st level)', description: 'Casting the inscribed spell from the scroll consumes it. A caster with the spell on their list can cast it; others must succeed on an ability check or the casting fails.' },
];
