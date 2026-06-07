// Shared contract between the server and both clients (DM + player).
// Keep this framework-free so it can be imported from either side.

export type Role = 'dm' | 'player';

export type AuraColor = 'red' | 'green' | 'blue';

export type Condition = {
  id: string;
  label: string;
  /** red = negative, green = positive/buff, blue = concentration. */
  aura: AuraColor;
  isConcentration: boolean;
  customText?: string;
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
   * `damage`. Rolled on a hit (doubled on a crit) and resisted/amplified by the
   * target separately from the main type. Works for PC and creature weapons.
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
};

export type Character = {
  id: string;
  sessionId: string;
  name: string;
  race: string;
  className: string;
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
  /** Spells & abilities with collapsible text + optional rollable actions. */
  sheetAbilities: SheetAbility[];
  /** Battle Master Superiority Die size (e.g. "d8"); the pool is the
   *  `resources['Superiority Dice']` counter. Unset → d8 default. */
  superiorityDie?: string;
  /** socketId of the player who has claimed this character, or null. */
  claimedBy: string | null;
  conditions: Condition[];
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
   * Battle Master maneuver (toggle + Superiority Die spend).
   */
  type: 'spell' | 'ability' | 'mastery' | 'maneuver';
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
  /** Full rules text shown in the collapsible body. */
  description: string;
  /** Optional structured roll; absent for purely descriptive entries. */
  roll?: AbilityRoll;
  /** Weapon-mastery config (only when `type` is `mastery`). */
  mastery?: WeaponMastery;
  /** Battle Master maneuver config (only when `type` is `maneuver`). */
  maneuver?: ManeuverSpec;
  /** Where it came from. */
  source?: 'srd' | 'gemini' | 'custom';
};

export type Monster = {
  id: string;
  sessionId: string;
  name: string;
  creatureType: string;
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
  /** Shared party notes — visible to players on every disposition tier. */
  playerNotes: string;
};

/** Player-facing NEUTRAL view: adds HP + type + AC on top of the public view. */
export type MonsterNeutral = MonsterPublic & {
  curHp: number;
  maxHp: number;
  tempHp: number;
  creatureType: string;
  armorClass: number;
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
  /** All maps in the session (DM only sees the full list). */
  maps: MapState[];
  tokens: Token[];
  characters: Character[];
  /** Monster *instances* placed on maps. The DM gets full Monster[]; players
   *  receive a disposition-shaped view (full / neutral / public) per creature.
   *  Tokens reference these by id. */
  monsters: (Monster | MonsterNeutral | MonsterPublic)[];
  /** Reusable creature templates for the DM's spawn list (one per creature
   *  type). DM-only; players receive an empty array. */
  monsterTemplates: Monster[];
  /** Shared dice roll log (most recent last), visible to everyone. */
  rollLog: RollEntry[];
  /** Persistent measuring shapes (cone/circle/line) on the shown map, drawn by
   *  any role and visible to everyone. */
  measurements: Measurement[];
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
     * Per-instance pre-rolled damages (e.g. Magic Missile darts). When present,
     * the DM assigns ONE instance per clicked target (consumed in order) instead
     * of applying the full `amount` to every target. Server-rolled; the client
     * only tells the server which instance index to apply.
     */
    split?: number[];
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
};

export type TokenMovePayload = { tokenId: string; x: number; y: number };
export type TokenResizePayload = { tokenId: string; widthFt: number };
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
  /** Bulk import paths (e.g. JSON sheet) may set these directly. */
  spellSlots?: Record<string, { max: number; used: number }>;
  resources?: Record<string, { max: number; used: number }>;
  items?: InventoryItem[];
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
/** Upsert a spell/ability on a character's sheet. */
export type AbilitySetPayload = { characterId: string; ability: SheetAbility };
/** Remove a spell/ability from a character's sheet. */
export type AbilityRemovePayload = { characterId: string; abilityId: string };
/**
 * Roll a sheet spell/ability into the shared log (server-authoritative).
 * `castLevel` upcasts a leveled spell; omit for cantrips/abilities.
 */
export type AbilityRollPayload = {
  characterId: string;
  abilityId: string;
  castLevel?: number;
  advantage?: 'adv' | 'dis';
  /** Attack-roll spells target a token: the server resolves to-hit vs its AC and
   *  auto-applies typed damage (× resist/vuln) on a hit, like a weapon attack. */
  targetTokenId?: string;
};
/** Roll a monster's structured `action` (DM-only), resolved server-side. */
export type MonsterActionRollPayload = {
  monsterId: string;
  actionIndex: number;
  advantage?: 'adv' | 'dis';
  /** Attack-roll actions target a token (to-hit vs AC + typed auto-damage). */
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
  weapons?: Weapon[];
  icon?: string;
  disposition?: Disposition;
  source?: 'srd' | 'gemini' | 'manual';
};
/** Patch fields of one creature instance/template (DM-only). */
export type MonsterUpdatePayload = {
  monsterId: string;
  disposition?: Disposition;
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
  icon?: string;
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
  'token:resize': (payload: TokenResizePayload) => void;
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
  'condition:set': (payload: ConditionSetPayload) => void;
  'condition:clear': (payload: ConditionClearPayload) => void;
  'character:claim': (payload: ClaimCharacterPayload) => void;
  'character:create': (payload: CharacterCreatePayload) => void;
  'character:loadFromLibrary': (payload: CharacterLoadFromLibraryPayload) => void;
  'character:update': (payload: CharacterUpdatePayload) => void;
  'character:delete': (payload: CharacterDeletePayload) => void;
  'character:release': () => void;
  'resource:set': (payload: ResourceSetPayload) => void;
  'item:set': (payload: ItemSetPayload) => void;
  'item:remove': (payload: ItemRemovePayload) => void;
  'ability:set': (payload: AbilitySetPayload) => void;
  'ability:remove': (payload: AbilityRemovePayload) => void;
  'ability:roll': (payload: AbilityRollPayload) => void;
  'monster:action': (payload: MonsterActionRollPayload) => void;
  'save:resolve': (payload: SaveResolvePayload) => void;
  'save:roll': (payload: SaveRollPayload) => void;
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
  'initiative:clear': () => void;
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
export interface ServerToClientEvents {
  'state:snapshot': (snapshot: StateSnapshot) => void;
  error: (err: ServerError) => void;
  notice: (payload: NoticePayload) => void;
}
