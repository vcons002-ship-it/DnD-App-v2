// Shared contract between the server and both clients (DM + player).
// Keep this framework-free so it can be imported from either side.

import type { AbilityKey } from './skills.js';

export type Role = 'dm' | 'player';

export type AuraColor = 'red' | 'green' | 'blue';

export type Condition = {
  id: string;
  label: string;
  /** red = negative, green = positive/buff, blue = concentration. */
  aura: AuraColor;
  isConcentration: boolean;
  customText?: string;
  /** Combat round it was applied on (when combat is running) — shown as "T{n}"
   *  for manual duration tracking. Absent if applied outside combat. */
  round?: number;
};

export type TokenKind = 'pc' | 'monster';

/**
 * How a creature relates to the party — drives how much players may see:
 * - friendly: full stat block visible to players
 * - neutral:  name + HP + type/AC only
 * - enemy:    name + conditions only (default)
 */
export type Disposition = 'friendly' | 'neutral' | 'enemy';

/** At-a-glance battlefield role shown as a token badge (⚔️ / 🏹 / ✨). */
export type CombatRole = 'melee' | 'ranged' | 'caster';

/**
 * A tagged weapon entry — structured so missing fields are obvious to fill and
 * reusable by later features (combat-role detection now; attack rolls in WP11).
 */
export type Weapon = {
  name: string;
  /** Melee or ranged — drives combat-role detection. */
  kind: 'melee' | 'ranged';
  /** Base damage dice + ability modifier, e.g. "1d8+3". */
  damage?: string;
  /** Damage type, e.g. "slashing" (from the weapon book; display only). */
  damageType?: string;
  /**
   * Two-handed damage for a `versatile` weapon, e.g. "1d10+3". When the attacker
   * toggles 2H, this is rolled instead of `damage`.
   */
  versatileDamage?: string;
  /**
   * Magic damage bonus (e.g. 1 for a +1 weapon), kept SEPARATE from `damage` so
   * it survives effects that strip the ability modifier (e.g. a mastery's Cleave
   * rolls the weapon dice + magic, without the ability mod). Added to every hit.
   */
  magicBonus?: number;
  /**
   * A secondary damage rider of a DIFFERENT type — e.g. a flaming sword's
   * `extraDamage: "1d6"`, `extraDamageType: "fire"` on top of its slashing
   * `damage`. Rolled ONCE on a hit (never doubled on a crit) and resisted/
   * amplified by the target separately from the main type. Works for PC and
   * creature weapons.
   */
  extraDamage?: string;
  /** Damage type of `extraDamage` (e.g. "fire"); display + resistance only. */
  extraDamageType?: string;
  /** To-hit bonus, e.g. 5 for "+5". */
  attackBonus?: number;
  /** Reach/range text, e.g. "5 ft" or "80/320 ft". */
  range?: string;
  /**
   * Descriptive tags — a weapon type plus properties, e.g.
   * ["halberd", "heavy", "versatile"] or ["dagger", "light", "finesse"].
   * Drive mechanics: `finesse` → use the better of STR/DEX; `versatile` → a 2H
   * damage toggle; `light` is reserved for future off-hand feats. A weapon
   * mastery in the abilities list triggers on any weapon whose tags overlap the
   * mastery's `appliesToTags`.
   */
  tags?: string[];
  /**
   * `damage` is DICE ONLY — add the wielder's ability modifier (and derive the
   * to-hit) from LIVE stats at roll time, like a PC weapon. Set on creature
   * attacks picked from the weapon/natural library so a creature's attacks track
   * its current stats. (Monster stat-block damage is otherwise pre-baked.)
   */
  diceOnly?: boolean;
};

/**
 * The two independent fog layers a map can use AT THE SAME TIME:
 * - 'map'    covered cells black out the terrain for players (classic fog)
 * - 'tokens' terrain stays visible; tokens in covered cells are hidden from
 *            players (DM sees a translucent marker of the covered region)
 * Each layer has its own enabled flag and its own revealed-cell set, so the DM
 * can, on one map, black out area A while hiding only creatures in area B.
 */
export type FogLayer = 'map' | 'tokens';

/** A token is a per-map placement that references a character or monster. */
export type Token = {
  id: string;
  mapId: string;
  kind: TokenKind;
  /** characterId or monsterId this token represents. */
  refId: string;
  x: number;
  y: number;
  /** Legacy size in grid squares (1 = Medium, 2 = Large, ...); kept for back-compat. */
  size: number;
  /**
   * Real-world footprint width in FEET (5 = Medium). This is the source of truth
   * for the on-screen size: it's rendered via the map's feet-per-pixel so a token
   * keeps its real size when the DM only changes the visual grid cell.
   */
  widthFt: number;
  /** Initiative value, or null if not rolled this combat. */
  initiative: number | null;
  /** Hidden tokens are never sent to players. */
  isHidden: boolean;
  /** DM override of the auto-derived combat role; null = derive from stats. */
  combatRoleOverride: CombatRole | null;
  /** Hide the combat-role badge for this token. */
  hideCombatRole: boolean;
  /** Effective role to render (server-computed in buildSnapshot); null = none. */
  combatRole: CombatRole | null;
  /** Token silhouette. 'image' draws the (unclipped) icon as-is for pasted art. */
  shape: TokenShape;
};

/** Token silhouette options (objects default to a non-circle by kind). */
export type TokenShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'image';

export type Character = {
  id: string;
  sessionId: string;
  name: string;
  race: string;
  className: string;
  /** Subclass / archetype (e.g. "Eldritch Knight", "Battle Master") — adjusts
   *  derived resources and spell limits where the tables know it. */
  subclass: string;
  /** Character level (PCs) — also used by the AI to scale stats. */
  level: number;
  maxHp: number;
  curHp: number;
  /** Temporary HP — a flat 2024-rules buffer pool depleted by damage before real
   *  HP; never restored by healing, has no maximum (0 = none). */
  tempHp: number;
  armorClass: number;
  speed: string;
  stats: Record<string, number>;
  spellSlots: Record<string, { max: number; used: number }>;
  resources: Record<string, { max: number; used: number }>;
  /** Permanent stat/roll adjustments (ASI, Resilient, racial). Magic-item
   *  effects live on the items themselves; both feed the effective-stat math
   *  in shared/modifiers.ts. */
  modifiers: SheetModifier[];
  /** Tagged weapons, shared shape with monsters for consistency. */
  weapons: Weapon[];
  resistances: string[];
  weaknesses: string[];
  /** Attacks / actions and traits / features (same tags as creatures). */
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
  /** Names of skills this character is proficient in (see shared/skills.ts). */
  proficientSkills: string[];
  /** Ability codes this character is proficient in for SAVING THROWS (e.g.
   *  ["CON","WIS"]) — adds the proficiency bonus to those saves. */
  saveProficiencies: string[];
  /** Inventory items the player tracks. */
  items: InventoryItem[];
  /** Coins the character is carrying, in gold pieces (a single purse — silver/
   *  copper are folded in by the DM). Default 0. */
  gold: number;
  /** Spells & abilities with collapsible text + optional rollable actions. */
  sheetAbilities: SheetAbility[];
  /** Battle Master Superiority Die size (e.g. "d8"); the pool is the
   *  `resources['Superiority Dice']` counter. Unset → d8 default. */
  superiorityDie?: string;
  /** socketId of the player currently playing this character, or null. A
   *  character is "taken" only while this points at a live socket (or one in its
   *  brief disconnect grace) — it does not lock anyone out once that lapses. */
  claimedBy: string | null;
  /** Durable per-browser id of the player who LAST held this character. Used
   *  only to hand it back to them on reconnect (priority) — it does NOT block
   *  others from claiming a free character. The DM can clear it via unlock.
   *  Null = no remembered holder. */
  ownerId: string | null;
  conditions: Condition[];
  /** 5e death saving throws while at 0 HP (each caps at 3). Reset when healed
   *  above 0; 3 successes = stable, 3 failures = dead. */
  deathSaves: { successes: number; failures: number };
  /** Count of enemies this PC has dropped to 0 HP — shown on the sheet + a shared
   *  scoreboard. Visible to everyone (public). */
  killCount: number;
  /** The combat role of this creature's most recent attack (melee/ranged/caster),
   *  so the token badge follows the weapon last used; null until it attacks. */
  lastAttackRole: CombatRole | null;
  /** Token art: an emoji, or a "/uploads/…" path. Empty = default circle. */
  icon: string;
};

export type CreatureAbility = {
  name: string;
  description: string;
  /** Optional structured roll (monster actions), resolved server-side like a PC's. */
  roll?: AbilityRoll;
};

/**
 * A structured roll attached to a sheet spell/ability, resolved server-side so
 * the dice/to-hit/DC are never trusted from the client. `dice` is the base
 * damage/heal expression at `baseLevel`; `scaleDice` is added per slot level
 * above it (or, for cantrips at level 0, per caster-level tier).
 */
export type AbilityRoll = {
  /** What the roll button does. */
  kind: 'attack' | 'save' | 'damage' | 'heal';
  /** Base dice for damage/heal, e.g. "8d6" or "3d4+3". */
  dice?: string;
  /** Damage/heal flavor, e.g. "fire", "radiant", "healing". */
  damageType?: string;
  /** For `save` rolls: the ability targets save with, e.g. "DEX". */
  save?: string;
  /** Explicit save DC (monster stat blocks give one); when unset it's derived. */
  dc?: number;
  /** Dice added per slot level above `baseLevel` (or per cantrip tier). */
  scaleDice?: string;
  /** Spell level the base dice are written for (0 = cantrip). */
  baseLevel?: number;
  /**
   * Number of separate damage instances at `baseLevel` — e.g. Magic Missile's 3
   * darts. Each instance rolls `dice` independently and is assigned to a target
   * ONE click at a time (rather than the full total hitting every target). Only
   * meaningful for `kind: 'damage'` (auto-hit, no save).
   */
  instances?: number;
  /** Extra instances per slot level above `baseLevel` (Magic Missile: +1 dart). */
  scaleInstances?: number;
};

/**
 * A weapon mastery (2024 rules) attached to a sheet entry. When `active`, it
 * triggers on any attack whose weapon has a tag in `appliesToTags` (e.g. a
 * "greataxe" or "heavy" weapon) — no per-weapon binding needed; just tag your
 * weapons. The optional `effect` then adjusts that attack's damage server-side.
 * Masteries without an `effect` are descriptive and handled manually.
 */
export type WeaponMastery = {
  /** Weapon tags this mastery triggers on (case-insensitive overlap). */
  appliesToTags: string[];
  /** Toggle — only an active mastery applies its effect. */
  active: boolean;
  /**
   * Label shown on a matching weapon's stat line (the mechanic, e.g. "Slow").
   * Defaults to the sheet entry's name. Great Weapon Master uses "GWM".
   */
  weaponLabel?: string;
  /**
   * Extra label shown only on a matching MELEE weapon — e.g. Great Weapon
   * Master's "Hew" extra-attack mechanic, which is melee-only while its damage
   * applies to all Heavy weapons.
   */
  meleeLabel?: string;
  /** Auto-effect on attacks with the bound weapon; absent = descriptive/manual. */
  effect?: {
    /** Extra damage added to the target on a HIT, e.g. "1d4" or a flat "10". */
    bonusDamage?: string;
    /** On a HIT, add the attacker's proficiency bonus to the damage (2024 Hew). */
    profBonusDamage?: boolean;
    /** On a MISS, deal damage equal to the attacker's ability modifier (Graze). */
    grazeOnMiss?: boolean;
    /**
     * On a HIT, roll the weapon's damage DICE (+ magic bonus, no ability modifier)
     * as the Cleave hit against a second creature — rolled and logged for the DM
     * to apply manually, not applied to the primary target.
     */
    cleave?: boolean;
  };
};

/**
 * A Battle Master combat maneuver attached to a sheet entry. Like a mastery it
 * has an on/off toggle and (optionally) a weapon-tag trigger, but it spends a
 * Superiority Die: when active with a die left in the pool, the next attack with
 * a matching weapon rolls the die and applies it per `addDieTo`, optionally
 * forcing a save (failing which applies `save.onFail`). One-shot — it toggles
 * itself off and spends a die after firing (exactly like Cleave).
 */
export type ManeuverSpec = {
  /** Toggle — only an active maneuver fires. */
  active: boolean;
  /** Where the rolled Superiority Die goes. `none` = positional/reaction only. */
  addDieTo: 'damage' | 'attack' | 'heal' | 'none';
  /** Weapon tags this triggers on (empty = any weapon). */
  appliesToTags?: string[];
  /** Optional forced save the target makes; on a failure `onFail` is applied. */
  save?: { ability: 'STR' | 'DEX' | 'CON' | 'WIS' | 'INT' | 'CHA'; onFail?: string };
  /** Whether the maneuver grants advantage (resolved manually / noted). */
  grantsAdvantage?: boolean;
  /** Short note appended to the log (e.g. "push 15 ft", "knock prone"). */
  note?: string;
};

/**
 * A persistent combat stance — a class feature you toggle ON and leave on (e.g.
 * Barbarian Rage, Reckless Attack). While `active`, the server applies its effect
 * to the character's qualifying weapon attacks (added damage and/or advantage).
 * Unlike a maneuver (a one-shot Superiority-Die spend), a stance stays on until
 * toggled off.
 */
export type StanceSpec = {
  /** Toggle — only an active stance modifies attacks. */
  active: boolean;
  /** Which weapon attacks it affects. */
  appliesTo: 'melee' | 'ranged' | 'all';
  /** Damage added on a hit — flat ("2") or dice ("1d6"); empty for none. */
  bonusDamage?: string;
  /** Grants advantage on the attack roll (e.g. Reckless Attack). */
  grantsAdvantage?: boolean;
  /** This stance marks a single target (e.g. Hunter's Mark): its effect applies
   *  only to attacks against the marked token. Drives a target picker in the UI. */
  targeted?: boolean;
  /** The marked target's token id (when `targeted`); empty = nothing marked yet. */
  targetId?: string;
  /**
   * On a hit, the target must make this save or suffer `onFail` (a condition like
   * "Restrained") — e.g. Ensnaring Strike. Logged as a click-to-target save; the
   * stance auto-deactivates after it fires (one-shot rider).
   */
  onHitSave?: { ability: 'STR' | 'DEX' | 'CON' | 'WIS' | 'INT' | 'CHA'; onFail: string };
  /**
   * A status condition put on the MARKED target while this stance is active (e.g.
   * "Marked" for Hunter's Mark), so everyone sees what the creature is under.
   * Applied/cleared client-side as the mark moves or the stance ends.
   */
  marksTargetWith?: string;
};

/**
 * A spell, ability, or weapon mastery added to a character sheet. Has a
 * collapsible `description` and, when applicable, a structured `roll` powering a
 * roll button (upcastable spells) or a `mastery` (toggle + auto damage effect).
 */
export type SheetAbility = {
  id: string;
  name: string;
  /**
   * `spell` enables an upcast level selector; `ability` is a feature/action;
   * `mastery` is a weapon mastery (toggle + weapon binding); `maneuver` is a
   * Battle Master maneuver (toggle + Superiority Die spend); `stance` is a
   * persistent class-feature toggle (Rage, Reckless Attack).
   */
  type: 'spell' | 'ability' | 'mastery' | 'maneuver' | 'stance';
  /** Spell level (0 = cantrip); omitted for non-spell abilities. */
  level?: number;
  /** School or short tag, e.g. "Evocation", "Class feature". */
  school?: string;
  /**
   * Classes that can cast/use this (lowercase, e.g. ["wizard", "sorcerer"]).
   * Drives the spellbook's class filter/sort. Empty/absent for non-class items.
   */
  classes?: string[];
  /**
   * Free-form search tags — school, classes, damage type, and flags like
   * "cantrip", "ritual", "concentration", "maneuver", "fire". Searched alongside
   * the name so an ability is findable by what it does, not just its name.
   */
  tags?: string[];
  /** One-line meta, e.g. "1 action · 120 ft · V,S". */
  meta?: string;
  /** Action economy — drives the ●/⚡/↩ icon. Auto-derived from `meta` on add. */
  actionType?: 'action' | 'bonus' | 'reaction';
  /** Prepared-caster bookkeeping: is this leveled spell currently prepared?
   *  Display-only (soft counters); never blocks casting. */
  prepared?: boolean;
  /** Full rules text shown in the collapsible body. */
  description: string;
  /** "At Higher Levels" effect — a short note shown when the spell is upcast
   *  (e.g. "+1 target per slot above 1st"). Damage scaling is handled by the
   *  roll's `scaleDice`; this captures non-damage upcasting like Bless. */
  upcast?: string;
  /** Optional structured roll; absent for purely descriptive entries. */
  roll?: AbilityRoll;
  /** Weapon-mastery config (only when `type` is `mastery`). */
  mastery?: WeaponMastery;
  /** Battle Master maneuver config (only when `type` is `maneuver`). */
  maneuver?: ManeuverSpec;
  /** Persistent combat-stance config (only when `type` is `stance`). */
  stance?: StanceSpec;
  /**
   * A linked use-counter for the feature (e.g. Rage 1/turn uses, Channel Divinity
   * charges). When the entry is added the client creates this resource counter,
   * and toggling a `stance` ON spends one use. `max` is a sensible default the
   * player can adjust.
   */
  useCounter?: { name: string; max: number };
  /** Marks this spell/ability as a SUMMON: a ✋ Summon button spawns a friendly
   *  companion token (Find Familiar, Mage Hand, Conjure Animals…). `name`/`icon`
   *  override the spawned token (default to the ability's name + a hand icon).
   *  Casting a leveled summon spell spends a slot like any other leveled cast. */
  summon?: { name?: string; icon?: string };
  /** Where it came from. */
  source?: 'srd' | 'gemini' | 'custom';
};

/** A non-combat interactable placed on the map (a Monster with this flag set):
 *  traps, doors, chests, hidden items, etc. State is tracked with conditions. */
export type ObjectKind = 'trap' | 'door' | 'chest' | 'item' | 'other';

export type Monster = {
  id: string;
  sessionId: string;
  name: string;
  creatureType: string;
  /** When set, this is a non-combat OBJECT (trap/door/chest/…), not a creature:
   *  the UI shows interact controls instead of combat, and it gets no combat-role
   *  badge. Otherwise undefined (a normal creature). */
  objectKind?: ObjectKind;
  /** Loot held by an OBJECT (a chest/treasure pile): gold + items a party can
   *  take into a character's inventory. Only meaningful when `objectKind` is set.
   *  Players see it only once the object is opened (see `visibility.ts`). */
  loot?: LootContents;
  /** For a TRAP object: the DC a character must beat to disarm it (DEX / Sleight
   *  of Hand check). DM-only; defaults to a moderate DC when unset. */
  objectDc?: number;
  /** Level (PCs) / challenge rating (monsters) — used by the AI to scale stats. */
  level: number;
  maxHp: number;
  curHp: number;
  /** Temporary HP — a flat 2024-rules buffer pool depleted by damage before real
   *  HP; never restored by healing, has no maximum (0 = none). */
  tempHp: number;
  armorClass: number;
  speed: string;
  /** Ability scores, e.g. { STR: 16, DEX: 12, … }. */
  stats: Record<string, number>;
  resistances: string[];
  weaknesses: string[];
  /** Ability codes proficient in for SAVING THROWS (adds the proficiency bonus). */
  saveProficiencies: string[];
  /** Tagged weapons (name + melee/ranged + damage/to-hit where known). */
  weapons: Weapon[];
  /** Attacks / actions (with to-hit & damage where known). */
  actions: CreatureAbility[];
  /** Traits / features. */
  abilities: CreatureAbility[];
  /** Rich, rollable spells/abilities/masteries — the SAME system PCs use
   *  (`sheetAbilities`), so a creature can carry searchable, collapsible, rollable
   *  entries. DM-authored; resolved server-side with CR-based DC/to-hit. */
  sheetAbilities: SheetAbility[];
  source: 'srd' | 'gemini' | 'manual';
  conditions: Condition[];
  /** How much of this creature players may see (default enemy). */
  disposition: Disposition;
  /** The combat role of this creature's most recent attack (melee/ranged/caster),
   *  so the token badge follows the weapon last used; null until it attacks. */
  lastAttackRole: CombatRole | null;
  /** Token art: an emoji, or a "/uploads/…" path. Empty = default circle. */
  icon: string;
  /** Shared free-text notes any player or the DM can add about this creature/NPC
   *  (what the party has learned). Visible to everyone regardless of disposition. */
  playerNotes: string;
};

/** A creature template returned by SRD search or Gemini lookup. */
export type CreatureTemplate = {
  name: string;
  creatureType: string;
  /** Challenge rating / level chosen by the AI (or SRD), used to scale stats. */
  level?: number;
  maxHp: number;
  armorClass: number;
  speed: string;
  stats: Record<string, number>;
  resistances: string[];
  weaknesses: string[];
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
  /** Rich rollable spells/innate abilities (AI may supply these). */
  sheetAbilities?: SheetAbility[];
  /** Tagged weapons (AI may supply these; SRD entries usually omit them). */
  weapons?: Weapon[];
  icon: string;
  source: 'srd' | 'gemini' | 'library';
};

/** A saved library item the DM can drop into a character's inventory. */
export type LibraryItem = {
  id: string;
  name: string;
  description: string;
  qtyDefault: number;
  /** Magic effects copied onto the InventoryItem when the item is picked
   *  (preset on SRD magic items, AI-generated ones too; apply once equipped). */
  modifiers?: SheetModifier[];
};

/**
 * A character saved to the cross-session library — the full sheet minus session
 * state (`id`/`sessionId`/`claimedBy`/`conditions`). Loading one creates a fresh
 * `Character` in the current session.
 */
export type LibraryCharacter = {
  name: string;
  race: string;
  className: string;
  /** Subclass / archetype; optional on older saves. */
  subclass?: string;
  level: number;
  maxHp: number;
  curHp: number;
  armorClass: number;
  speed: string;
  stats: Record<string, number>;
  spellSlots: Record<string, { max: number; used: number }>;
  resources: Record<string, { max: number; used: number }>;
  weapons: Weapon[];
  resistances: string[];
  weaknesses: string[];
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
  proficientSkills: string[];
  /** Saving-throw proficiencies (ability codes); optional on older saves. */
  saveProficiencies?: string[];
  /** Permanent stat/roll adjustments (ASI/Resilient/racial); optional on older saves. */
  modifiers?: SheetModifier[];
  items: InventoryItem[];
  sheetAbilities: SheetAbility[];
  icon: string;
};

/** An item in a character's inventory. */
export type InventoryItem = {
  id: string;
  name: string;
  qty: number;
  note: string;
  /** Magic effects this item grants while equipped (e.g. +2 STR, +1 saves). */
  modifiers?: SheetModifier[];
  /** Whether the item is equipped/attuned — only then do its `modifiers` apply. */
  equipped?: boolean;
};

/**
 * What a {@link SheetModifier} affects. `ability` raises the score itself (so it
 * flows into every derived number); the others are flat bonuses to a specific
 * roll. An omitted `ability`/`skill` means "all saves"/"all skills".
 */
export type ModTarget =
  | { kind: 'ability'; ability: AbilityKey }
  | { kind: 'save'; ability?: AbilityKey }
  | { kind: 'skill'; skill?: string }
  | { kind: 'attack' }
  | { kind: 'ac' }
  | { kind: 'initiative' };

/**
 * A named numeric adjustment from a feat/ASI (on the character) or a magic item
 * (on an InventoryItem). The base score stays in `Character.stats`; modifiers
 * layer on top, so the math stays transparent and reversible.
 */
export type SheetModifier = {
  id: string;
  /** Where it comes from, shown in the stat-math tooltip and roll log. */
  source: string;
  target: ModTarget;
  value: number;
  /** Marks an ASI/feat slot use (counts against the level-based feat cap). */
  slot?: boolean;
  /** Ability targets only: the score BECOMES `value` (a floor — "your Strength
   *  is 19", per Gauntlets of Ogre Power). Inert when the score is already
   *  higher; ignored for non-ability targets. */
  set?: boolean;
};

/** Contents of a lootable object (a chest/treasure pile). Items move into a
 *  character's inventory and gold into their purse when taken. */
export type LootContents = {
  /** Gold pieces in the container. */
  gold: number;
  /** Items waiting to be claimed (same shape as inventory items). */
  items: InventoryItem[];
};

export type MapState = {
  id: string;
  sessionId: string;
  name: string;
  /** Server-relative path to an uploaded image, or null when using slidesUrl. */
  imagePath: string | null;
  slidesUrl: string | null;
  gridSizePx: number;
  feetPerSquare: number;
  /** Real-world width the map image represents, in feet (0 = unset → distances
   *  fall back to the feet-per-square scale). The source of truth for scale. */
  mapWidthFt: number;
  /** Grid origin offset in px (to line the overlay up with a printed map grid). */
  gridOffsetX: number;
  gridOffsetY: number;
  /** Grid size locked (set by "match grid"); guards against accidental resize. */
  gridLocked: boolean;
  /** Hide the grid overlay entirely. */
  gridHidden: boolean;
  /** Whether each fog layer is active on this map. */
  mapFogEnabled: boolean;
  tokenFogEnabled: boolean;
  /** Revealed "col,row" cells per layer; everything else on an enabled layer is
   *  covered (also powers the "curtain": cover all, then reveal the start). */
  mapFogRevealed: string[];
  tokenFogRevealed: string[];
};

/** Player-facing ENEMY view: name + visible conditions + icon only. */
export type MonsterPublic = {
  id: string;
  name: string;
  conditions: Condition[];
  disposition: Disposition;
  icon: string;
  /** Server-computed: the creature is defeated (0 HP or a "dead" condition).
   *  Lets players see a skull on a downed enemy without exposing its HP. */
  dead?: boolean;
  /** Non-combat object kind (chest/door/…), so players' UI shows it as an object. */
  objectKind?: ObjectKind;
  /** Loot inside an object — only sent to players once it's opened/unlocked
   *  (the server gates this in `visibility.ts`). */
  loot?: LootContents;
  /** Shared party notes — visible to players on every disposition tier. */
  playerNotes: string;
};

/** Snapshot the server sends after join / on major changes, already role-shaped. */
export type StateSnapshot = {
  role: Role;
  sessionCode: string;
  /** The campaign/session name (DM-editable). */
  sessionName: string;
  /** Map currently shown to this client (active map for players; selected map for DM). */
  map: MapState | null;
  activeMapId: string | null;
  /** Token whose initiative turn it currently is (on the active map), or null. */
  activeTurnTokenId: string | null;
  /** Combat round counter (0 = no combat running); shown to everyone. */
  round: number;
  /** DM-only display state: are the DM's rolls currently hidden from players? */
  hideDmRolls: boolean;
  /** All maps in the session (DM only sees the full list). */
  maps: MapState[];
  tokens: Token[];
  characters: Character[];
  /** Monster *instances* placed on maps. The DM gets full Monster[]; players
   *  receive a disposition-shaped view (full / neutral / public) per creature.
   *  Tokens reference these by id. */
  monsters: (Monster | MonsterPublic)[];
  /** Reusable creature templates for the DM's spawn list (one per creature
   *  type). DM-only; players receive an empty array. */
  monsterTemplates: Monster[];
  /** Shared dice roll log (most recent last), visible to everyone. */
  rollLog: RollEntry[];
  /** Shared in-session chat (oldest first), visible to everyone. */
  chat: ChatMessage[];
  /** Persistent measuring shapes (cone/circle/line) on the shown map, drawn by
   *  any role and visible to everyone. */
  measurements: Measurement[];
  /** Freehand + text annotations on the shown map, visible to everyone. */
  annotations: Annotation[];
  /** Extra image tiles composing the shown map (under the tokens/grid), in
   *  addition to the map's base image. DM places them; everyone sees them. */
  mapImages: MapImage[];
};

/** An image tile placed on a map (alongside the base image), forming a larger
 *  composite. Positioned + sized in the map's pixel space; `z` is draw order. */
export type MapImage = {
  id: string;
  imagePath: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

/** A freehand stroke or text label drawn on a map, shared and persistent. */
export type Annotation = {
  id: string;
  mapId: string;
  kind: 'freehand' | 'text' | 'image';
  /** Freehand: flattened image-space points [x0,y0,x1,y1,…]. */
  points?: number[];
  /** Text/image: anchor point (top-left for image) + content. */
  x?: number;
  y?: number;
  text?: string;
  color: string;
  /** Image decal: uploaded art path + draw size in image px. */
  url?: string;
  width?: number;
  height?: number;
  /** Optional clickable popup attached to an image decal — a "shop"/info panel
   *  anyone can click open (read-only for players, editable for the DM). */
  popup?: MapPopup;
  /** Display name of the drawer (so they can clear just their own). */
  createdBy: string;
};

/** One priced line in a decal popup ("shop"). `price` is free text ("15 gp"). */
export type ShopItem = { id: string; name: string; price: string; qty?: number; note?: string };

/** Clickable content attached to a map decal — a title, optional note, and a
 *  list of priced items (a shop's stock). */
export type MapPopup = { title: string; note?: string; items: ShopItem[] };

/** Attach/replace (or clear with null) a decal's popup — DM only. */
export type AnnotationSetPopupPayload = { id: string; popup: MapPopup | null };

/** A shared chat message in a session. */
export type ChatMessage = {
  id: string;
  /** Display name of the sender (character/DM name). */
  sender: string;
  /** Sender role, for color/labelling. */
  role: Role;
  text: string;
  createdAt: number;
  /** DM-only message (rules-assistant Q&A) — stripped from player snapshots. */
  dmOnly?: boolean;
  /** Rulebook page citations on a rules-assistant answer (clickable in the UI). */
  pages?: number[];
};

/** A persistent measuring shape on a map (a spell AOE or a ruler). */
export type Measurement = {
  id: string;
  mapId: string;
  /** `ruler` = thin two-point measure; `line` = 5-ft-wide AOE; `emanation` =
   *  radius centred on (and following) a token. */
  kind: 'cone' | 'circle' | 'line' | 'square' | 'emanation' | 'ruler';
  /** Image-space anchor (apex for a cone, centre for a circle/square, start for
   *  a line). For an emanation this is unused — the centre is the token. */
  origin: { x: number; y: number };
  /** Image-space far point (aims/sizes the shape). */
  target: { x: number; y: number };
  /** Token an emanation is centred on (rendered at its live position). */
  tokenId?: string;
  /** Display name of who drew it (the client colours it via `rollerColor`). */
  createdBy: string;
};

/** An entry in the session's shared dice roll log. */
/** Cosmetic reveal for an attack roll: the natural d20 face, the outcome, and any
 *  damage dealt — drives the brief client-side roll-reveal animation.
 *
 *  The animation plays in stages: the raw die lands, then each `toHit` step flies
 *  in and the running total counts UP to `attackTotal`; on a hit the damage dice
 *  land and each `damageMods` step counts the total up to `damage`. A `dart` is a
 *  single quick damage burst (Magic Missile assigns one per click). */
export type RevealStep = {
  /** Short label, e.g. "STR", "PROF", "MAGIC", "GWM". */
  label: string;
  /** Signed amount added to the running total. */
  value: number;
  /** For a dice step: the individual die faces rolled (e.g. [4, 6]). */
  faces?: number[];
};
export type RollReveal = {
  /** 'attack' = a to-hit + damage reveal; 'damage' = a damage-only burst (a cast
   *  AoE/save spell's single damage roll, or one Magic Missile dart). */
  kind?: 'attack' | 'damage';
  attacker: string;
  target?: string;
  /** The natural d20 face shown (the chosen die under adv/dis). Attacks only. */
  d20?: number;
  /** Bonuses added to the d20, revealed one by one (ability mod, proficiency, …). */
  toHit?: RevealStep[];
  /** Final to-hit total (d20 + every `toHit` step). */
  attackTotal?: number;
  outcome: 'hit' | 'miss' | 'crit' | 'fumble';
  /** Damage dice with their individual faces (a crit adds a second dice step). */
  damageDice?: RevealStep[];
  /** Flat damage modifiers added after the dice (ability mod, magic, mastery…). */
  damageMods?: RevealStep[];
  /** Damage applied on a hit (the final total the count-up lands on). */
  damage?: number;
  damageType?: string;
};

export type RollEntry = {
  id: string;
  /** Who rolled — a character name, "DM", or "Player". */
  roller: string;
  /** Optional label, e.g. "Attack", "Stealth". */
  label: string;
  expr: string;
  total: number;
  detail: string;
  /** Optional long text (e.g. a cast spell's full rules text) — shown in the
   *  full roll log for others to read, but NOT in the compact map overlay. */
  description?: string;
  /** Structured payload for the brief attack-roll REVEAL animation everyone sees
   *  when an attack resolves (the d20 face, the HIT/MISS/CRIT/FUMBLE outcome, and
   *  any damage). Purely cosmetic — the mechanics already applied server-side. */
  reveal?: RollReveal;
  /** Accounting note for the HP change this roll applied ("Druk HP 42→38";
   *  temp HP shows as "42+5") — helps spot/correct mistakes. Carries the target
   *  so `visibility.ts` can shape it per viewer: players see it for PCs and
   *  friendly/neutral creatures; ENEMY creature changes are stripped. */
  hpNote?: { kind: TokenKind; refId: string; text: string };
  /** A DM roll captured while "hide my rolls" was on — dropped from player logs. */
  dmOnly?: boolean;
  /** The roll is by/against an ENEMY/NEUTRAL creature whose stats players can't
   *  see — so `visibility.ts` strips the labelled ability/proficiency/magic
   *  modifier breakdown (in `detail` and the reveal) for players, keeping the
   *  d20, total and outcome. Friendly/PC rolls show their mods normally. */
  hideMods?: boolean;
  /** DM-only: present on a save/damage spell's damage roll so the log can offer an
   *  "Apply damage" button that starts click-to-target save resolution. Stripped
   *  for players in `visibility.ts`. `save` empty ⇒ auto-hit (full damage, no save). */
  apply?: {
    amount: number;
    dc: number;
    save?: string;
    damageType?: string;
    /** Condition applied to a target that FAILS the save (Battle Master riders). */
    onFail?: string;
    /**
     * Legacy: per-instance PRE-rolled damages (old Magic Missile entries). New
     * casts use `darts`+`dice` (roll-on-click) instead; kept so old logs resolve.
     */
    split?: number[];
    /** Split spell (Magic Missile): number of darts to assign, one per click. */
    darts?: number;
    /** Per-dart damage dice, rolled fresh on each click (e.g. "1d4+1"). */
    dice?: string;
    /** Caster's character id — lets THAT player (not just the DM) assign the darts. */
    owner?: string;
  };
  createdAt: number;
};

/** A past session, surfaced on the DM landing page for quick resume. */
export type SessionSummary = {
  code: string;
  name: string;
  createdAt: number;
  lastPlayedAt: number;
  mapCount: number;
};

// ---- Socket.IO event payloads ----

export type JoinPayload = {
  sessionCode: string;
  role: Role;
  /** Required when role === 'dm' and a DM passphrase is configured. */
  dmPassphrase?: string;
  /** Durable random per-browser id — anchors character ownership across
   *  reconnects (socket ids change on every refresh). */
  playerId?: string;
};

export type TokenMovePayload = { tokenId: string; x: number; y: number };
export type TokenResizePayload = { tokenId: string; widthFt: number };
export type TokenSetShapePayload = { tokenId: string; shape: TokenShape };
export type TokenDeletePayload = { tokenId: string };
/** Duplicate one placed token into a second, independently-tracked copy. */
export type TokenDuplicatePayload = { tokenId: string };
export type TokenSetHiddenPayload = { tokenId: string; hidden: boolean };
/** Copy token placements from one map to another (statuses carry via refs). */
export type TokenCopyPayload = {
  fromMapId: string;
  toMapId: string;
  kinds: TokenKind[];
};
export type TokenSpawnPayload = {
  mapId: string;
  kind: TokenKind;
  refId: string;
  x: number;
  y: number;
};
export type DamagePayload = { kind: TokenKind; refId: string; amount: number };
/** Grant temporary HP — sets the buffer pool to `amount` (not additive). */
export type TempHpPayload = { kind: TokenKind; refId: string; amount: number };
export type ConditionSetPayload = {
  kind: TokenKind;
  refId: string;
  condition: Omit<Condition, 'id'>;
};
export type ConditionClearPayload = {
  kind: TokenKind;
  refId: string;
  conditionId: string;
};
export type MapSetActivePayload = { mapId: string };
export type MapSelectPayload = { mapId: string };
export type MapDeletePayload = { mapId: string };
/** Rename a map (DM). */
export type MapRenamePayload = { mapId: string; name: string };
/** Resize a map's grid (DM): cell size in px + feet represented by one square. */
export type MapSetGridPayload = {
  mapId: string;
  gridSizePx: number;
  feetPerSquare: number;
  /** Real-world map width in feet (0 = unset). Source of truth for scale. */
  widthFt: number;
  offsetX?: number;
  offsetY?: number;
  locked?: boolean;
  hidden?: boolean;
};
/** Add a measuring shape to a map (any role). */
export type MeasureAddPayload = {
  kind: Measurement['kind'];
  origin: { x: number; y: number };
  target: { x: number; y: number };
  tokenId?: string;
};
/** Remove a single measuring shape by id (any role). */
export type MeasureRemovePayload = { id: string };
/** Clear measurements on a map: everyone's, or only the caller's (`mineOnly`). */
export type MeasureClearPayload = { mapId: string; mineOnly?: boolean };
/** Add a freehand stroke or text label to a map (any role). */
export type AnnotationAddPayload = {
  kind: Annotation['kind'];
  points?: number[];
  x?: number;
  y?: number;
  text?: string;
  color: string;
  url?: string;
  width?: number;
  height?: number;
};
/** Remove a single annotation by id (any role). */
export type AnnotationRemovePayload = { id: string };
/** Clear annotations on a map: everyone's, or only the caller's (`mineOnly`);
 *  an optional `kind` clears only that kind (e.g. 'image' = scenery decals). */
export type AnnotationClearPayload = {
  mapId: string;
  mineOnly?: boolean;
  kind?: Annotation['kind'];
};
/** Reposition an image decal (DM). */
export type AnnotationMovePayload = { id: string; x: number; y: number };
/** Place a new image tile on a map (path comes from an /api/icons upload). */
export type MapImageAddPayload = {
  mapId: string;
  imagePath: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type MapImageMovePayload = { id: string; x: number; y: number };
export type MapImageResizePayload = { id: string; x: number; y: number; w: number; h: number };
/** Send a tile to the front (top) or back (bottom) of the map's image stack. */
export type MapImageReorderPayload = { id: string; to: 'front' | 'back' };
export type MapImageRemovePayload = { id: string };
/** Resize an image decal (DM); width/height in map-image pixels. */
export type AnnotationResizePayload = { id: string; width: number; height: number };
/** Rename the session/campaign (DM). */
export type SessionRenamePayload = { name: string };
/** How to handle a referenced character whose name already exists on import. */
export type ImportConflictResolution = 'reuse' | 'overwrite' | 'new';
/** A character referenced by the maps being imported (for the conflict prompt). */
export type ImportCharConflict = {
  /** Source-session character id (the resolutions map is keyed by this). */
  sourceId: string;
  name: string;
  /** True when a same-named character already exists in the target session. */
  exists: boolean;
};
/** Import selected maps (and their tokens) from another session into this one.
 *  `resolutions` maps a source character id → reuse/overwrite/new (default new). */
export type SessionImportMapsPayload = {
  sourceCode: string;
  mapIds: string[];
  resolutions?: Record<string, ImportConflictResolution>;
};
/** Ask the server which referenced characters collide before importing. */
export type SessionImportPreviewPayload = { sourceCode: string; mapIds: string[] };
/** Enable/disable one fog layer on a map. */
export type FogSetLayerPayload = {
  mapId: string;
  layer: FogLayer;
  enabled: boolean;
};
/** Reveal (true) or re-hide (false) cells on one fog layer of a map. */
export type FogPaintPayload = {
  mapId: string;
  layer: FogLayer;
  cells: string[];
  reveal: boolean;
};
/** Re-cover the whole map on one fog layer (clear that layer's revealed cells). */
export type FogCoverPayload = { mapId: string; layer: FogLayer };
export type ClaimCharacterPayload = { characterId: string };
/** Create a player character (DM or player). */
export type CharacterCreatePayload = {
  name: string;
  race?: string;
  className?: string;
  level?: number;
  maxHp?: number;
  stats?: Record<string, number>;
};
/** Load a saved character from the cross-session library into this session.
 *  `claim` (player) also claims the new character for the caller. */
export type CharacterLoadFromLibraryPayload = { name: string; claim?: boolean };
/** Patch fields of one character (DM or the owning player). */
/** DM removes a player character from the session/spawn list. */
export type CharacterDeletePayload = { characterId: string };

export type CharacterUpdatePayload = {
  characterId: string;
  name?: string;
  race?: string;
  className?: string;
  subclass?: string;
  level?: number;
  maxHp?: number;
  curHp?: number;
  tempHp?: number;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  resistances?: string[];
  weaknesses?: string[];
  weapons?: Weapon[];
  actions?: CreatureAbility[];
  abilities?: CreatureAbility[];
  proficientSkills?: string[];
  saveProficiencies?: string[];
  /** Permanent stat/roll adjustments (ASI/Resilient/racial). */
  modifiers?: SheetModifier[];
  /** Bulk import paths (e.g. JSON sheet) may set these directly. */
  spellSlots?: Record<string, { max: number; used: number }>;
  resources?: Record<string, { max: number; used: number }>;
  items?: InventoryItem[];
  /** Gold pieces carried (a single purse). */
  gold?: number;
  /** Rich rollable spells/abilities (e.g. set in bulk by AI back-fill). */
  sheetAbilities?: SheetAbility[];
};
/** Adjust or add/remove a limited-use counter (spell slot or class resource). */
export type ResourceSetPayload = {
  characterId: string;
  group: 'spellSlots' | 'resources';
  key: string;
  max?: number;
  used?: number;
  remove?: boolean;
};
/** Upsert an inventory item on a character. */
export type ItemSetPayload = { characterId: string; item: InventoryItem };
/** Remove an inventory item from a character. */
export type ItemRemovePayload = { characterId: string; itemId: string };
/** Set/replace the loot inside an object (DM-only). An empty payload clears it. */
export type ObjectSetLootPayload = { monsterId: string; loot: LootContents };
/**
 * Take loot from an object into a character (DM, or the player who owns the
 * character). `all` moves everything; otherwise `itemId` takes one item and/or
 * `gold` takes that many coins. The object is marked looted once emptied.
 */
export type LootTakePayload = {
  monsterId: string;
  characterId: string;
  itemId?: string;
  gold?: number;
  all?: boolean;
};
/** Upsert a rich spell/ability on a creature OR character's sheet (`kind`+`refId`).
 *  PCs author their own; monster sheetAbilities are DM-authored. */
export type AbilitySetPayload = { kind: TokenKind; refId: string; ability: SheetAbility };
/** Remove a spell/ability from a creature/character sheet. */
export type AbilityRemovePayload = { kind: TokenKind; refId: string; abilityId: string };
/** Reorder a creature's `sheetAbilities` to match a client-supplied id order. */
export type AbilityReorderPayload = { kind: TokenKind; refId: string; orderedIds: string[] };
/**
 * Roll a sheet spell/ability into the shared log (server-authoritative).
 * `castLevel` upcasts a leveled spell; omit for cantrips/abilities. For a monster
 * the DC/to-hit derive from its CR (no spell-slot spend).
 */
export type AbilityRollPayload = {
  kind: TokenKind;
  refId: string;
  abilityId: string;
  castLevel?: number;
  advantage?: 'adv' | 'dis';
  /** Attack-roll spells target a token: the server resolves to-hit vs its AC and
   *  auto-applies typed damage (× resist/vuln) on a hit, like a weapon attack. */
  targetTokenId?: string;
};
/** DM-only: resolve a damage roll's save against one clicked target (rolls the
 *  save, auto-applies full/half of the rolled amount). `rollId` is the log entry
 *  carrying the `apply` payload. `advantage` is the clicked creature's armed
 *  adv/dis toggle. */
export type SaveResolvePayload = {
  rollId: string;
  tokenId: string;
  advantage?: 'adv' | 'dis';
  /** For a split spell (Magic Missile): which pre-rolled instance/dart to apply
   *  to this target. The server reads the amount from the roll's `apply.split`. */
  instanceIndex?: number;
};
/** Roll ONE creature's saving throw for an ability (click a stat block to roll a
 *  save). Server-authoritative: d20 + ability mod + proficiency when proficient. */
export type SaveRollPayload = {
  kind: TokenKind;
  refId: string;
  ability: string;
  advantage?: 'adv' | 'dis';
};
/** Roll a PLAIN ability check (d20 + ability mod, no proficiency) for a creature. */
export type CheckRollPayload = {
  kind: TokenKind;
  refId: string;
  ability: string;
  advantage?: 'adv' | 'dis';
};
/**
 * Roll a 5e skill check for a character (server-authoritative): d20 + the
 * sheet's ability modifier + proficiency bonus when proficient. `skill` is a
 * name from `shared/skills.ts` (e.g. "Stealth").
 */
export type SkillRollPayload = {
  characterId: string;
  skill: string;
  advantage?: 'adv' | 'dis';
};
/** Roll dice into the shared log. `advantage` rolls twice (d20 adv/dis). */
export type DiceRollPayload = {
  expr: string;
  label?: string;
  advantage?: 'adv' | 'dis';
};
/** Resolve a weapon attack from one token against another (server-authoritative). */
export type CombatAttackPayload = {
  attackerTokenId: string;
  targetTokenId: string;
  weaponIndex: number;
  advantage?: 'adv' | 'dis';
  /** Off-hand attack: drop the ability modifier from the damage. */
  offhand?: boolean;
  /** Two-handed: use the weapon's `versatileDamage` dice. */
  twoHanded?: boolean;
};
/** Roll a saving throw (DC vs ability) for one or more tokens. `advantageByToken`
 *  carries each creature's armed adv/dis toggle (keyed by token id). */
export type CombatSavePayload = {
  tokenIds: string[];
  ability: string;
  dc: number;
  advantage?: 'adv' | 'dis';
  advantageByToken?: Record<string, 'adv' | 'dis'>;
};
/** Ask the AI to back-fill only the empty fields of a character. */
export type AiFillCharacterPayload = { characterId: string };
/** Generate a whole character/NPC from a free-text description (DM or player). */
export type AiCreateCharacterPayload = { description: string };
/** A transient message the server asks a client to surface (e.g. a toast). */
export type NoticePayload = { message: string };
/** Create a reusable creature *template* (one spawn button). */
export type MonsterCreatePayload = {
  name: string;
  maxHp: number;
  creatureType?: string;
  level?: number;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  resistances?: string[];
  weaknesses?: string[];
  actions?: CreatureAbility[];
  abilities?: CreatureAbility[];
  sheetAbilities?: SheetAbility[];
  weapons?: Weapon[];
  icon?: string;
  disposition?: Disposition;
  objectKind?: ObjectKind;
  source?: 'srd' | 'gemini' | 'manual';
};
/** Roll a character's check to disarm a trap object; on success the server flips
 *  it to "Disarmed". DM or the player who owns the character. */
export type ObjectInteractPayload = {
  monsterId: string;
  /** The acting character (for a player's lock-pick check); omit for DM force. */
  characterId?: string;
  action: 'open' | 'unlock';
};
export type TrapDisarmPayload = {
  monsterId: string;
  characterId: string;
  advantage?: 'adv' | 'dis';
};
/** Patch fields of one creature instance/template (DM-only). */
export type MonsterUpdatePayload = {
  monsterId: string;
  disposition?: Disposition;
  objectKind?: ObjectKind;
  name?: string;
  level?: number;
  maxHp?: number;
  curHp?: number;
  tempHp?: number;
  creatureType?: string;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  resistances?: string[];
  weaknesses?: string[];
  saveProficiencies?: string[];
  weapons?: Weapon[];
  actions?: CreatureAbility[];
  abilities?: CreatureAbility[];
  sheetAbilities?: SheetAbility[];
  icon?: string;
  /** Disarm DC for a trap object. */
  objectDc?: number;
};
export type MonsterDeletePayload = { monsterId: string };
/** Shared party notes on a creature/NPC — writable by the DM AND players. */
export type CreatureNotesPayload = { monsterId: string; notes: string };
/** Ask the AI to back-fill only the empty fields of a creature (DM-only). */
export type AiFillCreaturePayload = { monsterId: string };
/** Apply an icon (emoji or "/uploads/…") to the entities of these tokens. */
export type TokenSetIconPayload = { tokenIds: string[]; icon: string };
/** Hide/show the combat-role badge across one or more tokens. */
export type TokenSetHideRolePayload = { tokenIds: string[]; hide: boolean };
/** Override (or clear, with null) the combat role across one or more tokens. */
export type TokenSetRolePayload = {
  tokenIds: string[];
  role: CombatRole | null;
};
/** Damage (+) or heal (−) every listed token's creature at once (AOE). */
export type TokensDamagePayload = { tokenIds: string[]; amount: number };
/** Hide/show every listed token from players at once. */
export type TokensSetHiddenPayload = { tokenIds: string[]; hidden: boolean };
/** Apply one condition to every listed token's creature. */
export type TokensSetConditionPayload = {
  tokenIds: string[];
  condition: Omit<Condition, 'id'>;
};
/** Clear ALL conditions from every listed token's creature. */
export type TokensClearConditionsPayload = { tokenIds: string[] };
export type InitiativeSetPayload = { tokenId: string; initiative: number | null };

export type ServerError = { code: string; message: string };

// Client -> Server event names.
export interface ClientToServerEvents {
  join: (payload: JoinPayload, ack: (res: JoinAck) => void) => void;
  'map:select': (payload: MapSelectPayload) => void;
  'map:setActive': (payload: MapSetActivePayload) => void;
  'map:delete': (payload: MapDeletePayload) => void;
  'map:rename': (payload: MapRenamePayload) => void;
  'map:setGrid': (payload: MapSetGridPayload) => void;
  'measure:add': (payload: MeasureAddPayload) => void;
  'measure:remove': (payload: MeasureRemovePayload) => void;
  'measure:clear': (payload: MeasureClearPayload) => void;
  'annotation:add': (payload: AnnotationAddPayload) => void;
  'annotation:remove': (payload: AnnotationRemovePayload) => void;
  'annotation:clear': (payload: AnnotationClearPayload) => void;
  'annotation:move': (payload: AnnotationMovePayload) => void;
  'annotation:resize': (payload: AnnotationResizePayload) => void;
  'annotation:setPopup': (payload: AnnotationSetPopupPayload) => void;
  'mapImage:add': (payload: MapImageAddPayload) => void;
  'mapImage:move': (payload: MapImageMovePayload) => void;
  'mapImage:resize': (payload: MapImageResizePayload) => void;
  'mapImage:reorder': (payload: MapImageReorderPayload) => void;
  'mapImage:remove': (payload: MapImageRemovePayload) => void;
  'session:rename': (payload: SessionRenamePayload) => void;
  'session:importMaps': (payload: SessionImportMapsPayload) => void;
  'session:importPreview': (
    payload: SessionImportPreviewPayload,
    ack: (conflicts: ImportCharConflict[]) => void,
  ) => void;
  'fog:setLayer': (payload: FogSetLayerPayload) => void;
  'fog:paint': (payload: FogPaintPayload) => void;
  'fog:cover': (payload: FogCoverPayload) => void;
  'token:move': (payload: TokenMovePayload) => void;
  /** Ephemeral, throttled live drag preview (no DB write, no snapshot) — the
   *  server fans it out as `fx:tokenDrag` to viewers who can see the token. */
  'token:drag': (payload: TokenMovePayload) => void;
  'token:resize': (payload: TokenResizePayload) => void;
  'token:setShape': (payload: TokenSetShapePayload) => void;
  'token:spawn': (payload: TokenSpawnPayload) => void;
  'token:delete': (payload: TokenDeletePayload) => void;
  'token:duplicate': (payload: TokenDuplicatePayload) => void;
  'token:setHidden': (payload: TokenSetHiddenPayload) => void;
  'tokens:setIcon': (payload: TokenSetIconPayload) => void;
  'tokens:setHideCombatRole': (payload: TokenSetHideRolePayload) => void;
  'tokens:setCombatRole': (payload: TokenSetRolePayload) => void;
  'tokens:damage': (payload: TokensDamagePayload) => void;
  'tokens:setHidden': (payload: TokensSetHiddenPayload) => void;
  'tokens:setCondition': (payload: TokensSetConditionPayload) => void;
  'tokens:clearConditions': (payload: TokensClearConditionsPayload) => void;
  'tokens:copy': (payload: TokenCopyPayload) => void;
  'damage:apply': (payload: DamagePayload) => void;
  'tempHp:set': (payload: TempHpPayload) => void;
  'condition:set': (payload: ConditionSetPayload) => void;
  'condition:clear': (payload: ConditionClearPayload) => void;
  'character:claim': (payload: ClaimCharacterPayload) => void;
  'character:unlock': (payload: ClaimCharacterPayload) => void;
  'character:create': (payload: CharacterCreatePayload) => void;
  'character:loadFromLibrary': (payload: CharacterLoadFromLibraryPayload) => void;
  'character:update': (payload: CharacterUpdatePayload) => void;
  'character:delete': (payload: CharacterDeletePayload) => void;
  'character:release': () => void;
  'resource:set': (payload: ResourceSetPayload) => void;
  'item:set': (payload: ItemSetPayload) => void;
  'item:remove': (payload: ItemRemovePayload) => void;
  'object:setLoot': (payload: ObjectSetLootPayload) => void;
  'loot:take': (payload: LootTakePayload) => void;
  'trap:disarm': (payload: TrapDisarmPayload) => void;
  'object:interact': (payload: ObjectInteractPayload) => void;
  'object:paste': (payload: { mapId: string; x: number; y: number; icon: string; name?: string }) => void;
  /** Cast a summon-tagged spell/ability: spawn its friendly companion token (and
   *  spend a slot for a leveled spell). Owner = the casting PC (or the DM). */
  'summon:cast': (payload: {
    kind: TokenKind;
    refId: string;
    abilityId: string;
    mapId: string;
    x: number;
    y: number;
    castLevel?: number;
  }) => void;
  'ability:set': (payload: AbilitySetPayload) => void;
  'ability:remove': (payload: AbilityRemovePayload) => void;
  'ability:reorder': (payload: AbilityReorderPayload) => void;
  'ability:roll': (payload: AbilityRollPayload) => void;
  'death:roll': (payload: { characterId: string }) => void;
  'chat:send': (payload: { text: string; speakAsTokenId?: string }) => void;
  /** Ephemeral "this player is composing a chat message" ping (no DB / snapshot)
   *  — the server pops a typing bubble over their claimed PC token for others. */
  'chat:typing': (payload: { typing: boolean }) => void;
  /** Live "laser pointer": broadcast my cursor position (in map/image coords) so
   *  others see what I'm pointing at. Ephemeral — no DB, no snapshot. */
  'cursor:move': (payload: { x: number; y: number; mapId: string }) => void;
  /** My cursor left the map → remove my pointer for everyone. */
  'cursor:hide': () => void;
  /** DM-only: ask the rules assistant (SRD + uploaded rulebook). The Q&A is
   *  posted as DM-only chat messages and answered by a local/remote LLM. The
   *  optional `backend` is the chat dropdown's choice ('local' + a specific
   *  Ollama model, or 'gemini'); omitted = the server default. */
  'assistant:ask': (payload: {
    question: string;
    backend?: { prefer?: 'gemini' | 'local'; ollamaModel?: string };
  }) => void;
  /** DM-only: stop the in-flight rules-assistant request (the chat Stop button). */
  'assistant:cancel': () => void;
  /** DM-only: generate a "Previously on…" recap of recent rolls + chat (posted
   *  to chat for everyone). */
  'assistant:recap': () => void;
  /** DM-only: make a creature speak an AI-generated in-character line (floated as
   *  a speech bubble over its token). */
  'creature:speak': (payload: { tokenId: string }) => void;
  'save:resolve': (payload: SaveResolvePayload) => void;
  'save:roll': (payload: SaveRollPayload) => void;
  'check:roll': (payload: CheckRollPayload) => void;
  'skill:roll': (payload: SkillRollPayload) => void;
  'ai:fillCharacter': (payload: AiFillCharacterPayload) => void;
  'ai:createCharacter': (payload: AiCreateCharacterPayload) => void;
  'monster:create': (payload: MonsterCreatePayload) => void;
  'monster:update': (payload: MonsterUpdatePayload) => void;
  'monster:delete': (payload: MonsterDeletePayload) => void;
  'creature:setNotes': (payload: CreatureNotesPayload) => void;
  'ai:fillCreature': (payload: AiFillCreaturePayload) => void;
  'initiative:set': (payload: InitiativeSetPayload) => void;
  'initiative:rollAll': () => void;
  'initiative:rollMissing': () => void;
  'initiative:next': () => void;
  /** A player ends their own turn (server allows only when it's their PC's turn). */
  'initiative:endTurn': () => void;
  'initiative:clear': () => void;
  'initiative:setRound': (payload: { round: number }) => void;
  'session:setHideDmRolls': (payload: { hide: boolean }) => void;
  'dice:roll': (payload: DiceRollPayload) => void;
  /** Wipe the shared roll log for everyone in the session. */
  'dice:clearLog': () => void;
  'combat:attack': (payload: CombatAttackPayload) => void;
  'combat:save': (payload: CombatSavePayload) => void;
}

export type JoinAck =
  | { ok: true; snapshot: StateSnapshot }
  | { ok: false; error: ServerError };

// Server -> Client event names.
/** Transient combat feedback: an HP change to float over the creature's token
 *  ("−7" red / "+5" green). Carries only the DELTA (never totals) and is sent
 *  per-viewer, filtered to tokens that viewer's snapshot actually contains.
 *  `damageType` (canonical 5e type, when the source knew it) drives a brief
 *  elemental burst on the token — e.g. a flame flash for fire damage. */
export type HpFxEvent = {
  kind: TokenKind;
  refId: string;
  delta: number;
  damageType?: string;
  /** One-shot extra: 'death' (a creature just dropped to 0 — skull + smoke
   *  puff) or 'loot' (a container was plundered — gold sparkle; delta 0). */
  effect?: 'death' | 'loot';
};

export interface ServerToClientEvents {
  'state:snapshot': (snapshot: StateSnapshot) => void;
  error: (err: ServerError) => void;
  notice: (payload: NoticePayload) => void;
  'fx:hp': (payload: { events: HpFxEvent[] }) => void;
  /** Live preview of ANOTHER user dragging a token: the token's in-progress
   *  position, so watchers can draw a ghost tether + distance. Ephemeral (never
   *  persisted), throttled by the sender, fanned out only to viewers who can see
   *  the token at `x,y` (not hidden, not under fog, same map). Auto-expires
   *  client-side shortly after the updates stop (covers release + disconnect). */
  'fx:tokenDrag': (payload: { tokenId: string; x: number; y: number }) => void;
  /** A player's PC (by character `refId`) started/stopped typing in chat — show
   *  a typing bubble over their token. Ephemeral; auto-expires client-side. */
  'fx:typing': (payload: { refId: string; typing: boolean }) => void;
  /** A player sent a chat message — pop their words in a speech bubble over their
   *  PC token (`refId` = character id) for a few seconds. Ephemeral. */
  'fx:say': (payload: { refId: string; text: string }) => void;
  /** Someone's live cursor moved — render a labeled pointer at (x,y) for the map
   *  `mapId` (keyed by their socket id). */
  'fx:cursor': (payload: { id: string; name: string; x: number; y: number; mapId: string }) => void;
  /** Their cursor left the map / they disconnected → remove their pointer. */
  'fx:cursorHide': (payload: { id: string }) => void;
  /** DM-only: the rules assistant started (true) / finished (false) thinking, so
   *  the chat shows a live indicator with a Stop button. */
  'assistant:thinking': (payload: { thinking: boolean }) => void;
}
