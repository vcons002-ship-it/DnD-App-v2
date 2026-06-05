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
  /** Damage dice expression, e.g. "1d8+3". */
  damage?: string;
  /** To-hit bonus, e.g. 5 for "+5". */
  attackBonus?: number;
  /** Reach/range text, e.g. "5 ft" or "80/320 ft". */
  range?: string;
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
  /** Size in grid squares (1 = Medium, 2 = Large, ...). */
  size: number;
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
  /** Inventory items the player tracks. */
  items: InventoryItem[];
  /** Spells & abilities with collapsible text + optional rollable actions. */
  sheetAbilities: SheetAbility[];
  /** socketId of the player who has claimed this character, or null. */
  claimedBy: string | null;
  conditions: Condition[];
  /** Token art: an emoji, or a "/uploads/…" path. Empty = default circle. */
  icon: string;
};

export type CreatureAbility = { name: string; description: string };

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
  /** Dice added per slot level above `baseLevel` (or per cantrip tier). */
  scaleDice?: string;
  /** Spell level the base dice are written for (0 = cantrip). */
  baseLevel?: number;
};

/**
 * A weapon mastery (2024 rules) attached to a sheet entry. When `active` and
 * bound to a `weapon` that matches an attack, the optional `effect` adjusts that
 * attack's damage server-side. Masteries without an `effect` are descriptive and
 * handled manually at the table.
 */
export type WeaponMastery = {
  /** The weapon name this mastery is bound to (matched against the attack's weapon). */
  weapon: string;
  /** Toggle — only an active mastery applies its effect. */
  active: boolean;
  /** Auto-effect on attacks with the bound weapon; absent = descriptive/manual. */
  effect?: {
    /** Extra damage dice added on a HIT, e.g. "1d4". */
    bonusDamage?: string;
    /** On a MISS, deal damage equal to the attacker's ability modifier (Graze). */
    grazeOnMiss?: boolean;
  };
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
   * `mastery` is a weapon mastery (toggle + weapon binding).
   */
  type: 'spell' | 'ability' | 'mastery';
  /** Spell level (0 = cantrip); omitted for non-spell abilities. */
  level?: number;
  /** School or short tag, e.g. "Evocation", "Class feature". */
  school?: string;
  /** One-line meta, e.g. "1 action · 120 ft · V,S". */
  meta?: string;
  /** Full rules text shown in the collapsible body. */
  description: string;
  /** Optional structured roll; absent for purely descriptive entries. */
  roll?: AbilityRoll;
  /** Weapon-mastery config (only when `type` is `mastery`). */
  mastery?: WeaponMastery;
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
  armorClass: number;
  speed: string;
  /** Ability scores, e.g. { STR: 16, DEX: 12, … }. */
  stats: Record<string, number>;
  resistances: string[];
  weaknesses: string[];
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
  /** Token art: an emoji, or a "/uploads/…" path. Empty = default circle. */
  icon: string;
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
};

/** Player-facing NEUTRAL view: adds HP + type + AC on top of the public view. */
export type MonsterNeutral = MonsterPublic & {
  curHp: number;
  maxHp: number;
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
export type TokenResizePayload = { tokenId: string; size: number };
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
/** Rename the session/campaign (DM). */
export type SessionRenamePayload = { name: string };
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
/** Patch fields of one character (DM or the owning player). */
export type CharacterUpdatePayload = {
  characterId: string;
  name?: string;
  race?: string;
  className?: string;
  level?: number;
  maxHp?: number;
  curHp?: number;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  resistances?: string[];
  weaknesses?: string[];
  weapons?: Weapon[];
  actions?: CreatureAbility[];
  abilities?: CreatureAbility[];
  proficientSkills?: string[];
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
};
/** Roll a saving throw (DC vs ability) for one or more tokens. */
export type CombatSavePayload = {
  tokenIds: string[];
  ability: string;
  dc: number;
  advantage?: 'adv' | 'dis';
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
  creatureType?: string;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  resistances?: string[];
  weaknesses?: string[];
  weapons?: Weapon[];
  actions?: CreatureAbility[];
  abilities?: CreatureAbility[];
  icon?: string;
};
export type MonsterDeletePayload = { monsterId: string };
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
  'session:rename': (payload: SessionRenamePayload) => void;
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
  'character:update': (payload: CharacterUpdatePayload) => void;
  'character:release': () => void;
  'resource:set': (payload: ResourceSetPayload) => void;
  'item:set': (payload: ItemSetPayload) => void;
  'item:remove': (payload: ItemRemovePayload) => void;
  'ability:set': (payload: AbilitySetPayload) => void;
  'ability:remove': (payload: AbilityRemovePayload) => void;
  'ability:roll': (payload: AbilityRollPayload) => void;
  'skill:roll': (payload: SkillRollPayload) => void;
  'ai:fillCharacter': (payload: AiFillCharacterPayload) => void;
  'ai:createCharacter': (payload: AiCreateCharacterPayload) => void;
  'monster:create': (payload: MonsterCreatePayload) => void;
  'monster:update': (payload: MonsterUpdatePayload) => void;
  'monster:delete': (payload: MonsterDeletePayload) => void;
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
