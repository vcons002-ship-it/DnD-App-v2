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
 * Fog of war mode for a map:
 * - 'off'    no fog
 * - 'map'    covered cells black out the map for players (classic fog)
 * - 'tokens' map stays visible; only tokens in covered cells are hidden from
 *            players (DM sees a translucent marker of the covered region)
 */
export type FogMode = 'off' | 'map' | 'tokens';

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
  maxHp: number;
  curHp: number;
  stats: Record<string, number>;
  spellSlots: Record<string, { max: number; used: number }>;
  resources: Record<string, { max: number; used: number }>;
  weapons: string[];
  /** socketId of the player who has claimed this character, or null. */
  claimedBy: string | null;
  conditions: Condition[];
  /** Token art: an emoji, or a "/uploads/…" path. Empty = default circle. */
  icon: string;
};

export type CreatureAbility = { name: string; description: string };

export type Monster = {
  id: string;
  sessionId: string;
  name: string;
  creatureType: string;
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
  source: 'srd' | 'gemini';
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
  /** Fog of war mode for this map (off / map / tokens). */
  fogMode: FogMode;
  /** Grid cells the DM has revealed, as "col,row" keys. Everything else is
   *  covered when fog is on (this also powers the "curtain" workflow: cover
   *  all, then reveal the starting area). */
  fogRevealed: string[];
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
export type FogModePayload = { mapId: string; mode: FogMode };
/** Reveal (true) or re-hide (false) the given "col,row" cells on a map. */
export type FogPaintPayload = { mapId: string; cells: string[]; reveal: boolean };
/** Cover the whole map again (clear all revealed cells). */
export type FogCoverPayload = { mapId: string };
export type ClaimCharacterPayload = { characterId: string };
/** A transient message the server asks a client to surface (e.g. a toast). */
export type NoticePayload = { message: string };
/** Create a reusable creature *template* (one spawn button). */
export type MonsterCreatePayload = {
  name: string;
  maxHp: number;
  creatureType?: string;
  armorClass?: number;
  speed?: string;
  stats?: Record<string, number>;
  resistances?: string[];
  weaknesses?: string[];
  actions?: CreatureAbility[];
  abilities?: CreatureAbility[];
  icon?: string;
  disposition?: Disposition;
  source?: 'srd' | 'gemini' | 'manual';
};
/** Patch fields of one creature instance/template (DM-only). */
export type MonsterUpdatePayload = {
  monsterId: string;
  disposition?: Disposition;
  name?: string;
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
export type InitiativeSetPayload = { tokenId: string; initiative: number | null };

export type ServerError = { code: string; message: string };

// Client -> Server event names.
export interface ClientToServerEvents {
  join: (payload: JoinPayload, ack: (res: JoinAck) => void) => void;
  'map:select': (payload: MapSelectPayload) => void;
  'map:setActive': (payload: MapSetActivePayload) => void;
  'map:delete': (payload: MapDeletePayload) => void;
  'fog:setMode': (payload: FogModePayload) => void;
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
  'tokens:copy': (payload: TokenCopyPayload) => void;
  'damage:apply': (payload: DamagePayload) => void;
  'condition:set': (payload: ConditionSetPayload) => void;
  'condition:clear': (payload: ConditionClearPayload) => void;
  'character:claim': (payload: ClaimCharacterPayload) => void;
  'character:release': () => void;
  'monster:create': (payload: MonsterCreatePayload) => void;
  'monster:update': (payload: MonsterUpdatePayload) => void;
  'monster:delete': (payload: MonsterDeletePayload) => void;
  'ai:fillCreature': (payload: AiFillCreaturePayload) => void;
  'initiative:set': (payload: InitiativeSetPayload) => void;
  'initiative:rollAll': () => void;
  'initiative:next': () => void;
  'initiative:clear': () => void;
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
