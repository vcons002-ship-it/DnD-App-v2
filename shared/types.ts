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
};

export type Monster = {
  id: string;
  sessionId: string;
  name: string;
  creatureType: string;
  maxHp: number;
  curHp: number;
  resistances: string[];
  weaknesses: string[];
  abilities: { name: string; description: string }[];
  source: 'srd' | 'gemini' | 'manual';
  conditions: Condition[];
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
  /** Whether fog of war is enabled on this map. */
  fogEnabled: boolean;
};

/** Player-facing monster view: name + visible conditions only. */
export type MonsterPublic = {
  id: string;
  name: string;
  conditions: Condition[];
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
  /** DM receives full Monster[]; players receive MonsterPublic[]. */
  monsters: (Monster | MonsterPublic)[];
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
export type ClaimCharacterPayload = { characterId: string };
export type MonsterCreatePayload = {
  name: string;
  maxHp: number;
  creatureType?: string;
};
export type InitiativeSetPayload = { tokenId: string; initiative: number | null };

export type ServerError = { code: string; message: string };

// Client -> Server event names.
export interface ClientToServerEvents {
  join: (payload: JoinPayload, ack: (res: JoinAck) => void) => void;
  'map:select': (payload: MapSelectPayload) => void;
  'map:setActive': (payload: MapSetActivePayload) => void;
  'token:move': (payload: TokenMovePayload) => void;
  'token:resize': (payload: TokenResizePayload) => void;
  'token:spawn': (payload: TokenSpawnPayload) => void;
  'token:delete': (payload: TokenDeletePayload) => void;
  'tokens:copy': (payload: TokenCopyPayload) => void;
  'damage:apply': (payload: DamagePayload) => void;
  'condition:set': (payload: ConditionSetPayload) => void;
  'condition:clear': (payload: ConditionClearPayload) => void;
  'character:claim': (payload: ClaimCharacterPayload) => void;
  'monster:create': (payload: MonsterCreatePayload) => void;
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
}
