import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type {
  AbilityRollPayload,
  CharacterCreatePayload,
  CharacterUpdatePayload,
  ClientToServerEvents,
  CombatAttackPayload,
  CombatRole,
  CombatSavePayload,
  CheckRollPayload,
  Condition,
  DiceRollPayload,
  FogLayer,
  HpFxEvent,
  ImportCharConflict,
  ImportConflictResolution,
  InventoryItem,
  LootContents,
  LootTakePayload,
  ObjectInteractPayload,
  TrapDisarmPayload,
  MeasureAddPayload,
  Annotation,
  AnnotationAddPayload,
  ResourceSetPayload,
  JoinAck,
  MonsterCreatePayload,
  MonsterUpdatePayload,
  Role,
  RollReveal,
  ServerToClientEvents,
  SaveRollPayload,
  SheetAbility,
  SkillRollPayload,
  StateSnapshot,
  TokenKind,
  TokenShape,
} from '../../../shared/types';
import { playHit, playMiss, playHeal, playSkill } from '../lib/sfx';
import { safeSetItem } from '../lib/storage';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/** One floating damage/heal number over a token (client-side, transient). */
export type HpFloater = HpFxEvent & { id: number };
let nextFloaterId = 1;
/** Per-token expiry timers for live drag ghosts (cleared/rearmed each update). */
const dragGhostTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Per-character expiry timers for chat typing indicators / spoken bubbles. */
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const sayTimers = new Map<string, ReturnType<typeof setTimeout>>();
const cursorTimers = new Map<string, ReturnType<typeof setTimeout>>();
let nextSayId = 1;
/** Roll-log ids already handled (audio cue + reveal), so a fresh entry fires
 *  exactly once. The snapshot log is small (≤30, oldest-first), so a per-snapshot
 *  Set is cheap. Seeded on the first snapshot so a reconnect's backlog is silent. */
let seenRollIds = new Set<string>();
let rollSfxReady = false;

type Store = {
  socket: TypedSocket | null;
  status: Status;
  error: string | null;
  /** The DM passphrase used to join (if any) — attached to the few REST calls
   *  that are passphrase-gated server-side (e.g. map upload). */
  dmPassphrase: string | null;
  snapshot: StateSnapshot | null;
  /** Transient toast message (server notices, e.g. "Brought 3 tokens"). */
  toast: { id: number; message: string } | null;
  dismissToast: () => void;
  /** Show a transient toast from the client (e.g. AI start/failure notices). */
  notify: (message: string) => void;
  /** True while an AI request (stat-fill / creature lookup) is in flight. */
  aiBusy: boolean;
  setAiBusy: (busy: boolean) => void;
  /** Transient floating ±X HP numbers (server 'fx:hp'); auto-expire ~1.2 s. */
  hpFx: HpFloater[];
  /** One-shot red screen-edge flash when MY claimed PC takes damage (players
   *  only — the DM claims nothing). Cleared automatically after the CSS anim. */
  hurtFx: { id: number; amount: number } | null;
  /** Brief attack-roll REVEAL animation (the latest attack's d20 + outcome +
   *  damage), shown to everyone and auto-dismissed; click/tap skips it early. */
  rollFx: { id: number; reveal: RollReveal } | null;
  /** Dismiss the current roll-reveal animation (click/tap to skip). */
  dismissRollFx: () => void;
  /** Per-user toggle: show the roll-reveal animation (default ON). */
  showRollAnim: boolean;
  toggleRollAnim: () => void;
  /** Live in-progress positions of tokens OTHERS are dragging (server
   *  'fx:tokenDrag'), keyed by tokenId; each auto-expires shortly after the
   *  updates stop. Drives a ghost tether + distance over the watched token. */
  dragGhosts: Record<string, { x: number; y: number }>;
  /** Emit my own in-progress drag position (throttled by the caller). */
  dragToken: (tokenId: string, x: number, y: number) => void;
  /** Character refIds whose player is currently typing in chat (server
   *  'fx:typing'); drives a "•••" bubble over their PC token. Auto-expires. */
  typingChars: Record<string, true>;
  /** Spoken chat lines over a PC token (server 'fx:say'), keyed by character
   *  refId; each auto-expires a few seconds after arriving. */
  sayBubbles: Record<string, { text: string; id: number }>;
  /** Other people's live cursors ("laser pointers"), keyed by their socket id. */
  cursors: Record<string, { name: string; x: number; y: number; mapId: string }>;
  /** Broadcast my own cursor position (map/image coords) + clear it on leave. */
  moveCursor: (x: number, y: number, mapId: string) => void;
  hideCursor: () => void;
  /** Tell the server I started/stopped typing in chat (throttled by caller). */
  chatTyping: (typing: boolean) => void;
  /** Show the transparent roll-log overlay on the map (toggled from DicePanel). */
  showRollOverlay: boolean;
  toggleRollOverlay: () => void;
  /** Show the quick-roll d20 button in the map's bottom-right corner (toggled from DicePanel). */
  showDiceButton: boolean;
  toggleDiceButton: () => void;

  /** Show OTHER people's live cursor pointers on the map (on by default). */
  showCursors: boolean;
  toggleCursors: () => void;
  /** Broadcast MY OWN pointer to others (on by default). The DM turns this off to
   *  point at secret things privately. */
  shareCursor: boolean;
  toggleShareCursor: () => void;
  /**
   * Per-entity advantage/disadvantage toggle, keyed by a character or monster id.
   * Each creature/PC has its OWN armed adv/dis that applies to ITS next roll of
   * any kind (attack, skill, spell/ability attack, monster action, or dice) and
   * is consumed (cleared) when that roll fires. A player's dice-panel and skill
   * toggles share their character's key, so they're one switch.
   */
  manualAdvantage: Record<string, 'adv' | 'dis'>;
  setManualAdvantage: (key: string, a: 'adv' | 'dis' | null) => void;
  /** Read an entity's armed adv/dis AND clear it (called at roll time). */
  consumeAdvantage: (key: string) => 'adv' | 'dis' | undefined;
  /** Player UI: whether the selected creature's read-only "Details" panel is
   *  expanded. Sticky; double-clicking a token forces it open. */
  detailsExpanded: boolean;
  setDetailsExpanded: (open: boolean) => void;
  /** Bumped to force the right side panel open (e.g. double-tapping a token on
   *  a phone, where the panel is an overlay drawer that starts collapsed). */
  rightPanelNudge: number;
  nudgeRightPanel: () => void;
  /** Right-clicking a token aims the Combat section's target dropdown at it
   *  (n bumps every time so re-clicking the same token re-applies). */
  combatTarget: { id: string; n: number } | null;
  setCombatTarget: (id: string) => void;
  /** Armed "Apply damage" from a save/damage roll: clicking tokens rolls their
   *  save and auto-applies full/half. Null = not arming. (DM-only.) */
  saveResolve: {
    rollId: string;
    dc: number;
    save?: string;
    label: string;
    /** Split spell (Magic Missile): total instances + how many already assigned,
     *  so each map click consumes the next dart and auto-disarms when spent. */
    splitTotal?: number;
    splitUsed?: number;
  } | null;
  armSaveResolve: (s: {
    rollId: string;
    dc: number;
    save?: string;
    label: string;
    splitTotal?: number;
  }) => void;
  clearSaveResolve: () => void;
  resolveSaveAt: (tokenId: string) => void;

  connect: (code: string, role: Role, dmPassphrase?: string) => void;
  disconnect: () => void;

  selectMap: (mapId: string) => void;
  /** The map the DM is currently viewing/staging (null = the session's active
   *  map). Tracked so a reconnect can re-assert it (the server resets the view to
   *  active on join). Always null for players (they're locked to the active map). */
  viewMapId: string | null;
  setActiveMap: (mapId: string) => void;
  deleteMap: (mapId: string) => void;
  renameMap: (mapId: string, name: string) => void;
  /** DM: set the map list's order (ids in display order). */
  reorderMaps: (orderedIds: string[]) => void;
  setMapGrid: (
    mapId: string,
    gridSizePx: number,
    feetPerSquare: number,
    widthFt: number,
    opts?: { offsetX?: number; offsetY?: number; locked?: boolean; hidden?: boolean },
  ) => void;
  addMeasurement: (payload: MeasureAddPayload) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: (mapId: string, mineOnly?: boolean) => void;
  addAnnotation: (payload: AnnotationAddPayload) => void;
  pasteObject: (payload: { mapId: string; x: number; y: number; icon: string; name?: string }) => void;
  summonCast: (payload: {
    kind: TokenKind;
    refId: string;
    abilityId: string;
    mapId: string;
    x: number;
    y: number;
    castLevel?: number;
  }) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: (mapId: string, mineOnly?: boolean, kind?: Annotation['kind']) => void;
  moveAnnotation: (id: string, x: number, y: number) => void;
  resizeAnnotation: (id: string, width: number, height: number) => void;
  /** Clickable decal "shop" popup: which decal's popup is open, + edit/clear. */
  decalPopupId: string | null;
  openDecalPopup: (id: string | null) => void;
  setDecalPopup: (id: string, popup: import('../../../shared/types').MapPopup | null) => void;
  /** Map image tiles (compose a larger map from several images). */
  addMapImage: (payload: { mapId: string; imagePath: string; x: number; y: number; w: number; h: number }) => void;
  moveMapImage: (id: string, x: number, y: number) => void;
  resizeMapImage: (id: string, x: number, y: number, w: number, h: number) => void;
  reorderMapImage: (id: string, to: 'front' | 'back') => void;
  removeMapImage: (id: string) => void;
  loadCharacterFromLibrary: (name: string, claim?: boolean) => void;
  renameSession: (name: string) => void;
  importMapsFromSession: (
    sourceCode: string,
    mapIds: string[],
    resolutions?: Record<string, ImportConflictResolution>,
  ) => void;
  /** Ask the server which referenced characters collide before importing. */
  previewImport: (
    sourceCode: string,
    mapIds: string[],
  ) => Promise<ImportCharConflict[]>;
  setFogLayer: (mapId: string, layer: FogLayer, enabled: boolean) => void;
  paintFog: (
    mapId: string,
    layer: FogLayer,
    cells: string[],
    reveal: boolean,
  ) => void;
  coverFog: (mapId: string, layer: FogLayer) => void;
  spawnToken: (
    mapId: string,
    kind: TokenKind,
    refId: string,
    x: number,
    y: number,
  ) => void;
  moveToken: (tokenId: string, x: number, y: number) => void;
  resizeToken: (tokenId: string, widthFt: number) => void;
  setTokenShape: (tokenId: string, shape: TokenShape) => void;
  deleteToken: (tokenId: string) => void;
  duplicateToken: (tokenId: string) => void;
  setTokenHidden: (tokenId: string, hidden: boolean) => void;
  /** DM: whether a token joins combat (undefined = auto — join if visible). */
  setTokenInCombat: (tokenId: string, inCombat?: boolean) => void;
  copyTokens: (fromMapId: string, toMapId: string, kinds: TokenKind[]) => void;
  applyDamage: (kind: TokenKind, refId: string, amount: number) => void;
  setTempHp: (kind: TokenKind, refId: string, amount: number) => void;
  setCondition: (
    kind: TokenKind,
    refId: string,
    condition: Omit<Condition, 'id'>,
  ) => void;
  clearCondition: (kind: TokenKind, refId: string, conditionId: string) => void;
  claimCharacter: (characterId: string) => void;
  unlockCharacter: (characterId: string) => void;
  createCharacter: (input: CharacterCreatePayload) => void;
  updateCharacter: (payload: CharacterUpdatePayload) => void;
  aiFillCharacter: (characterId: string) => void;
  aiCreateCharacter: (description: string) => void;
  /** DM-only: ask the rules assistant a question (answered in DM-only chat).
   *  `backend` is the chat dropdown's choice (local + a model, or Gemini). */
  askAssistant: (
    question: string,
    backend?: { prefer?: 'gemini' | 'local'; ollamaModel?: string },
  ) => void;
  /** True while the rules assistant is composing an answer (server-driven). */
  assistantThinking: boolean;
  /** DM-only: stop the in-flight rules-assistant request. */
  cancelAssistant: () => void;
  /** DM-only: post an AI "Previously on…" recap of recent rolls + chat. */
  requestRecap: () => void;
  /** DM-only: make a creature speak an AI line over its token. */
  speakAs: (tokenId: string) => void;
  /** Rulebook reader overlay: null = closed, else open (optionally at a page). */
  rulebookView: { page?: number } | null;
  openRulebook: (page?: number) => void;
  closeRulebook: () => void;
  releaseCharacter: () => void;
  setResource: (payload: ResourceSetPayload) => void;
  setItem: (characterId: string, item: InventoryItem) => void;
  removeItem: (characterId: string, itemId: string) => void;
  useItem: (characterId: string, itemId: string) => void;
  setLoot: (monsterId: string, loot: LootContents) => void;
  takeLoot: (payload: LootTakePayload) => void;
  disarmTrap: (payload: TrapDisarmPayload) => void;
  interactObject: (payload: ObjectInteractPayload) => void;
  setSheetAbility: (kind: TokenKind, refId: string, ability: SheetAbility) => void;
  removeSheetAbility: (kind: TokenKind, refId: string, abilityId: string) => void;
  reorderSheetAbilities: (kind: TokenKind, refId: string, orderedIds: string[]) => void;
  rollAbility: (payload: AbilityRollPayload) => void;
  rollDeathSave: (characterId: string) => void;
  sendChat: (text: string, speakAsTokenId?: string) => void;
  rollSkill: (payload: SkillRollPayload) => void;
  rollSave: (payload: SaveRollPayload) => void;
  rollCheck: (payload: CheckRollPayload) => void;
  damageTokens: (tokenIds: string[], amount: number) => void;
  setTokensHidden: (tokenIds: string[], hidden: boolean) => void;
  /** DM: bulk combat participation (initiative panel All / None). */
  setTokensInCombat: (tokenIds: string[], inCombat?: boolean) => void;
  setTokensCondition: (
    tokenIds: string[],
    condition: Omit<Condition, 'id'>,
  ) => void;
  clearTokensConditions: (tokenIds: string[]) => void;
  createMonster: (input: MonsterCreatePayload) => void;
  updateMonster: (payload: MonsterUpdatePayload) => void;
  aiFillCreature: (monsterId: string) => void;
  deleteMonster: (monsterId: string) => void;
  /** Set the shared party notes on a creature/NPC (DM + players). */
  setCreatureNotes: (monsterId: string, notes: string) => void;
  /** DM removes a player character from the spawn list. */
  deleteCharacter: (characterId: string) => void;
  setTokensIcon: (tokenIds: string[], icon: string) => void;
  setTokensHideCombatRole: (tokenIds: string[], hide: boolean) => void;
  setTokensCombatRole: (
    tokenIds: string[],
    role: CombatRole | null,
  ) => void;
  setInitiative: (tokenId: string, initiative: number | null) => void;
  rollAllInitiative: () => void;
  rollMissingInitiative: () => void;
  nextTurn: () => void;
  /** A player ends their own turn (no-op server-side unless it's their PC's turn). */
  endTurn: () => void;
  clearInitiative: () => void;
  setRound: (round: number) => void;
  setHideDmRolls: (hide: boolean) => void;
  rollDice: (payload: DiceRollPayload) => void;
  clearRollLog: () => void;
  /** Undo the DM's last destructive action (delete token/creature, cover fog). */
  undo: () => void;
  combatAttack: (payload: CombatAttackPayload) => void;
  /** Roll (and apply) the damage parked on a hit — the two-step attack's
   *  second click. */
  combatDamage: (rollId: string) => void;
  combatSave: (payload: CombatSavePayload) => void;
  /** DM: make weapon damage a separate, clickable second roll. */
  setManualDamage: (manual: boolean) => void;
};

/**
 * Persist the joined session so a backgrounded/reloaded tab can rejoin without
 * the player re-entering the code (iOS Safari evicts backgrounded tabs + kills
 * the WebSocket). Stored per-tab in sessionStorage; cleared on an intentional
 * leave/disconnect.
 */
const SESSION_KEY = 'dnd.session';
type SavedSession = { code: string; role: Role; dmPassphrase?: string };
export function loadSavedSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const v = raw ? (JSON.parse(raw) as SavedSession) : null;
    return v && v.code && (v.role === 'dm' || v.role === 'player') ? v : null;
  } catch {
    return null;
  }
}
const saveSession = (s: SavedSession) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode / disabled storage — non-fatal */
  }
};
const clearSavedSession = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
};

/**
 * Durable per-browser player id (localStorage, shared across sessions) — sent
 * on join so character ownership survives reconnects/reloads. Random, no PII.
 */
const PLAYER_ID_KEY = 'dnd.playerId';
let playerIdMemo: string | null = null;
export function getPlayerId(): string {
  if (playerIdMemo) return playerIdMemo;
  const fresh =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    playerIdMemo = localStorage.getItem(PLAYER_ID_KEY);
    if (!playerIdMemo) {
      localStorage.setItem(PLAYER_ID_KEY, fresh);
      playerIdMemo = fresh;
    }
  } catch {
    playerIdMemo = fresh; // private mode — ownership lasts this tab only
  }
  return playerIdMemo;
}

export const useStore = create<Store>((set, get) => ({
  socket: null,
  status: 'idle',
  error: null,
  dmPassphrase: null,
  snapshot: null,
  toast: null,
  dismissToast: () => set({ toast: null }),
  notify: (message) => set({ toast: { id: Date.now(), message } }),
  aiBusy: false,
  hpFx: [],
  hurtFx: null,
  rollFx: null,
  dismissRollFx: () => set({ rollFx: null }),
  showRollAnim: localStorage.getItem('dnd.rollAnimOff') !== '1',
  toggleRollAnim: () =>
    set((s) => {
      const next = !s.showRollAnim;
      safeSetItem('dnd.rollAnimOff', next ? '0' : '1');
      return { showRollAnim: next };
    }),
  viewMapId: null,
  dragGhosts: {},
  dragToken: (tokenId, x, y) => get().socket?.emit('token:drag', { tokenId, x, y }),
  typingChars: {},
  sayBubbles: {},
  cursors: {},
  moveCursor: (x, y, mapId) => {
    if (get().shareCursor) get().socket?.emit('cursor:move', { x, y, mapId });
  },
  hideCursor: () => get().socket?.emit('cursor:hide'),
  chatTyping: (typing) => get().socket?.emit('chat:typing', { typing }),
  setAiBusy: (aiBusy) => set({ aiBusy }),
  showRollOverlay: true,
  toggleRollOverlay: () => set((s) => ({ showRollOverlay: !s.showRollOverlay })),
  showDiceButton: true,
  toggleDiceButton: () => set((s) => ({ showDiceButton: !s.showDiceButton })),
  // Others' pointers are ON by default; the mute choice persists per browser.
  showCursors: localStorage.getItem('dnd.hideCursors') !== '1',
  toggleCursors: () =>
    set((s) => {
      const next = !s.showCursors;
      safeSetItem('dnd.hideCursors', next ? '0' : '1');
      return { showCursors: next };
    }),
  // Sharing my own pointer is ON by default; turning it off clears mine for
  // everyone immediately (the DM's "point privately" control).
  shareCursor: localStorage.getItem('dnd.noShareCursor') !== '1',
  toggleShareCursor: () =>
    set((s) => {
      const next = !s.shareCursor;
      safeSetItem('dnd.noShareCursor', next ? '0' : '1');
      if (!next) get().socket?.emit('cursor:hide');
      return { shareCursor: next };
    }),
  manualAdvantage: {},
  setManualAdvantage: (key, a) =>
    set((s) => {
      const next = { ...s.manualAdvantage };
      if (a) next[key] = a;
      else delete next[key];
      return { manualAdvantage: next };
    }),
  consumeAdvantage: (key) => {
    const cur = get().manualAdvantage[key];
    if (cur)
      set((s) => {
        const next = { ...s.manualAdvantage };
        delete next[key];
        return { manualAdvantage: next };
      });
    return cur;
  },
  detailsExpanded: false,
  setDetailsExpanded: (detailsExpanded) => set({ detailsExpanded }),
  rightPanelNudge: 0,
  nudgeRightPanel: () => set((s) => ({ rightPanelNudge: s.rightPanelNudge + 1 })),
  combatTarget: null,
  setCombatTarget: (id) =>
    set((s) => ({ combatTarget: { id, n: (s.combatTarget?.n ?? 0) + 1 } })),
  saveResolve: null,
  armSaveResolve: (saveResolve) =>
    set((s) => ({
      saveResolve:
        s.saveResolve?.rollId === saveResolve.rollId
          ? null
          : { ...saveResolve, splitUsed: saveResolve.splitTotal ? 0 : undefined },
    })),
  clearSaveResolve: () => set({ saveResolve: null }),
  resolveSaveAt: (tokenId) => {
    const arm = get().saveResolve;
    if (!arm) return;
    // The clicked creature's own armed adv/dis toggle applies to its save.
    const tok = get().snapshot?.tokens.find((t) => t.id === tokenId);
    const advantage = tok ? get().consumeAdvantage(tok.refId) : undefined;
    // Split spell (Magic Missile): each click sends the next dart's index and the
    // server applies that pre-rolled instance. Disarm once all darts are spent.
    if (arm.splitTotal) {
      const idx = arm.splitUsed ?? 0;
      get().socket?.emit('save:resolve', { rollId: arm.rollId, tokenId, advantage, instanceIndex: idx });
      const used = idx + 1;
      set({ saveResolve: used >= arm.splitTotal ? null : { ...arm, splitUsed: used } });
      return;
    }
    get().socket?.emit('save:resolve', { rollId: arm.rollId, tokenId, advantage });
  },

  connect: (code, role, dmPassphrase) => {
    get().socket?.disconnect();
    // Reset the roll-cue seed so joining a DIFFERENT session treats its first
    // snapshot as a silent backlog (otherwise the new session's newest roll —
    // absent from the previous session's seen-set — replays its sound + reveal).
    // Auto-reconnect keeps working: it fires socket.io's 'connect', not this.
    seenRollIds = new Set();
    rollSfxReady = false;
    // Session-scoped transient state must not carry over to a different game:
    // clear the ephemeral fx timers + slices and any armed toggles (an armed
    // "Apply damage" / advantage would otherwise fire against a foreign id).
    for (const m of [dragGhostTimers, typingTimers, sayTimers, cursorTimers]) {
      m.forEach(clearTimeout);
      m.clear();
    }
    set({
      status: 'connecting',
      error: null,
      dmPassphrase: dmPassphrase ?? null,
      viewMapId: null,
      hpFx: [],
      dragGhosts: {},
      typingChars: {},
      sayBubbles: {},
      cursors: {},
      manualAdvantage: {},
      combatTarget: null,
      saveResolve: null,
    });

    // Socket.IO auto-reconnects and buffers our outgoing events while offline,
    // flushing them on reconnect; we re-join on every `connect` so the server
    // re-attaches role/session (the socket id changes across reconnects).
    const socket: TypedSocket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    socket.on('state:snapshot', (snapshot) => {
      // Audio cues + the reveal animation for a newly-arrived roll-log entry. The
      // log is oldest-first, so a new entry is the first one not yet seen.
      const log = snapshot.rollLog ?? [];
      if (rollSfxReady) {
        const fresh = log.find((e) => !seenRollIds.has(e.id));
        if (fresh) {
          // When a roll will ANIMATE, the overlay plays its hit/miss/impact cues in
          // sync with the animation beats — so suppress the immediate cue here.
          const willAnimate = !!fresh.reveal && get().showRollAnim;
          // A skill/save/check tick fires immediately ONLY when it won't animate —
          // when it does, the reveal overlay plays the tick itself at the result
          // beat. Match the reveal KIND (covers 'Pick lock'/'Disarm trap', whose
          // labels don't end in check/save) OR the label (covers un-revealed rolls
          // like an auto-fail bulk save).
          const isCheckCue =
            fresh.reveal?.kind === 'check' || /(check|save)$/i.test(fresh.label ?? '');
          if (isCheckCue && !fresh.hpNote && !willAnimate) playSkill();
          // An un-animated miss → immediate; an animated one plays at its stamp.
          else if (/\bMISS\b/.test(fresh.detail ?? '') && !willAnimate) playMiss();
          if (willAnimate && fresh.reveal) {
            const fxId = nextFloaterId++;
            set({ rollFx: { id: fxId, reveal: fresh.reveal } });
            // The overlay self-dismisses when its sequence finishes; safety net only.
            setTimeout(
              () => set((st) => (st.rollFx?.id === fxId ? { rollFx: null } : {})),
              5000,
            );
          }
        }
      }
      seenRollIds = new Set(log.map((e) => e.id));
      rollSfxReady = true;
      set({ snapshot });
    });
    socket.on('fx:hp', ({ events }) => {
      const added: HpFloater[] = events.map((e) => ({ ...e, id: nextFloaterId++ }));
      set((st) => ({ hpFx: [...st.hpFx, ...added] }));
      // Audio cue. Heals always chime here (heals don't animate). The damage
      // "thunk" plays immediately ONLY when roll animations are off — when they're
      // on, the overlay plays the impact in sync with the damage reveal instead.
      if (events.some((e) => e.delta > 0)) playHeal();
      else if (events.some((e) => e.delta < 0) && !get().showRollAnim) playHit();
      // Expire regardless of whether a canvas rendered them (after the ~1.6s
      // float tween finishes, with a little grace).
      setTimeout(() => {
        const ids = new Set(added.map((f) => f.id));
        set((st) => ({ hpFx: st.hpFx.filter((f) => !ids.has(f.id)) }));
      }, 1900);
      // Red screen-edge flash when MY claimed PC took damage.
      const snap = get().snapshot;
      const hurt = events
        .filter(
          (e) =>
            e.delta < 0 &&
            e.kind === 'pc' &&
            snap?.characters.some((c) => c.id === e.refId && c.claimedBy === socket.id),
        )
        .reduce((s, e) => s - e.delta, 0);
      if (hurt > 0) {
        const fxId = nextFloaterId++;
        set({ hurtFx: { id: fxId, amount: hurt } });
        setTimeout(
          () => set((st) => (st.hurtFx?.id === fxId ? { hurtFx: null } : {})),
          900,
        );
      }
    });
    // Live drag preview from another user — update the ghost and (re)arm its
    // expiry, so it clears ~0.3 s after the updates stop (release OR disconnect).
    socket.on('fx:tokenDrag', ({ tokenId, x, y }) => {
      set((st) => ({ dragGhosts: { ...st.dragGhosts, [tokenId]: { x, y } } }));
      const prev = dragGhostTimers.get(tokenId);
      if (prev) clearTimeout(prev);
      dragGhostTimers.set(
        tokenId,
        setTimeout(() => {
          dragGhostTimers.delete(tokenId);
          set((st) => {
            if (!(tokenId in st.dragGhosts)) return {};
            const next = { ...st.dragGhosts };
            delete next[tokenId];
            return { dragGhosts: next };
          });
        }, 320),
      );
    });
    // A teammate is typing in chat → show/hide the "•••" bubble over their PC.
    // Re-arm a safety expiry so a dropped "stopped typing" can't leave it stuck.
    socket.on('fx:typing', ({ refId, typing }) => {
      const prev = typingTimers.get(refId);
      if (prev) clearTimeout(prev);
      if (!typing) {
        typingTimers.delete(refId);
        set((st) => {
          if (!(refId in st.typingChars)) return {};
          const next = { ...st.typingChars };
          delete next[refId];
          return { typingChars: next };
        });
        return;
      }
      set((st) => ({ typingChars: { ...st.typingChars, [refId]: true } }));
      typingTimers.set(
        refId,
        setTimeout(() => {
          typingTimers.delete(refId);
          set((st) => {
            if (!(refId in st.typingChars)) return {};
            const next = { ...st.typingChars };
            delete next[refId];
            return { typingChars: next };
          });
        }, 6000),
      );
    });
    // A teammate sent a chat line → float their words over their PC and clear
    // any lingering typing bubble; the say bubble auto-expires after a few sec.
    socket.on('fx:say', ({ refId, text }) => {
      const typePrev = typingTimers.get(refId);
      if (typePrev) clearTimeout(typePrev);
      typingTimers.delete(refId);
      const sayId = nextSayId++;
      set((st) => {
        const typingChars = { ...st.typingChars };
        delete typingChars[refId];
        return { typingChars, sayBubbles: { ...st.sayBubbles, [refId]: { text, id: sayId } } };
      });
      const prev = sayTimers.get(refId);
      if (prev) clearTimeout(prev);
      sayTimers.set(
        refId,
        setTimeout(() => {
          sayTimers.delete(refId);
          set((st) => {
            if (st.sayBubbles[refId]?.id !== sayId) return {};
            const next = { ...st.sayBubbles };
            delete next[refId];
            return { sayBubbles: next };
          });
        }, 6000),
      );
    });
    // A live "laser pointer" moved — show/refresh it, auto-expiring if the sender
    // goes idle (so a stale pointer never lingers if a hide is missed).
    socket.on('fx:cursor', ({ id, name, x, y, mapId }) => {
      set((st) => ({ cursors: { ...st.cursors, [id]: { name, x, y, mapId } } }));
      const prev = cursorTimers.get(id);
      if (prev) clearTimeout(prev);
      cursorTimers.set(
        id,
        setTimeout(() => {
          cursorTimers.delete(id);
          set((st) => {
            const next = { ...st.cursors };
            delete next[id];
            return { cursors: next };
          });
        }, 4000),
      );
    });
    socket.on('fx:cursorHide', ({ id }) => {
      const prev = cursorTimers.get(id);
      if (prev) clearTimeout(prev);
      cursorTimers.delete(id);
      set((st) => {
        if (!(id in st.cursors)) return {};
        const next = { ...st.cursors };
        delete next[id];
        return { cursors: next };
      });
    });
    // The rules assistant started/finished thinking (server-driven, robust to
    // long runs); drives the in-chat thinking indicator + Stop button.
    socket.on('assistant:thinking', ({ thinking }) =>
      set({ assistantThinking: thinking }),
    );
    // Also surface server errors as a toast: once in-game the entry-screen
    // `error` line isn't rendered, so a rejected action would otherwise be silent.
    socket.on('error', (err) =>
      set({ error: err.message, toast: { id: Date.now(), message: err.message } }),
    );
    socket.on('notice', ({ message, aiDone }) =>
      // An AI-completion notice (aiDone) clears the spinner; an unrelated notice
      // fired mid-request (slot warning, undo) must NOT drop the banner early.
      set({ toast: { id: Date.now(), message }, ...(aiDone ? { aiBusy: false } : {}) }),
    );

    socket.on('connect', () => {
      socket.emit(
        'join',
        { sessionCode: code, role, dmPassphrase, playerId: getPlayerId() },
        (ack: JoinAck) => {
          if (ack.ok) {
            // Seed the roll-cue set from the (re)join snapshot so a roll that
            // landed while we were away — or the existing backlog — doesn't replay
            // its reveal + hit/miss sound as if it just happened on the next
            // broadcast (common on mobile: a backgrounded tab reconnects on
            // visibilitychange). rollSfxReady stays true so later rolls still cue.
            seenRollIds = new Set((ack.snapshot.rollLog ?? []).map((e) => e.id));
            rollSfxReady = true;
            set({ status: 'connected', snapshot: ack.snapshot, error: null });
            // The server resets the DM's viewed map to the active one on join;
            // re-assert a staged map so a reconnect doesn't yank the DM back to the
            // live map (players never stage, so viewMapId is null for them).
            const staged = get().viewMapId;
            if (staged) socket.emit('map:select', { mapId: staged });
            // Remember the joined session so a reload/background can auto-rejoin.
            saveSession({ code, role, dmPassphrase });
          } else {
            set({ status: 'error', error: ack.error.message });
            socket.disconnect();
          }
        },
      );
    });

    // Keep the last snapshot on screen during a blip; flag reconnecting unless we
    // intentionally left (disconnect()/leave sets status to 'idle' separately).
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return; // we asked to leave
      set((s) => (s.status === 'connected' ? { status: 'reconnecting' } : {}));
    });

    socket.on('connect_error', () =>
      set((s) =>
        // The first connect failing is a hard error; later ones are reconnect tries.
        s.status === 'connecting' ? { status: 'error', error: 'Could not reach the server' } : {},
      ),
    );

    set({ socket });
  },

  disconnect: () => {
    clearSavedSession(); // an intentional leave — don't auto-rejoin
    get().socket?.disconnect();
    set({ socket: null, status: 'idle', snapshot: null });
  },

  selectMap: (mapId) => {
    set({ viewMapId: mapId });
    get().socket?.emit('map:select', { mapId });
  },
  setActiveMap: (mapId) => get().socket?.emit('map:setActive', { mapId }),
  deleteMap: (mapId) => get().socket?.emit('map:delete', { mapId }),
  renameMap: (mapId, name) => get().socket?.emit('map:rename', { mapId, name }),
  reorderMaps: (orderedIds) => get().socket?.emit('map:reorder', { orderedIds }),
  setMapGrid: (mapId, gridSizePx, feetPerSquare, widthFt, opts) =>
    get().socket?.emit('map:setGrid', {
      mapId,
      gridSizePx,
      feetPerSquare,
      widthFt,
      ...opts,
    }),
  addMeasurement: (payload) => get().socket?.emit('measure:add', payload),
  removeMeasurement: (id) => get().socket?.emit('measure:remove', { id }),
  clearMeasurements: (mapId, mineOnly) =>
    get().socket?.emit('measure:clear', { mapId, mineOnly }),
  addAnnotation: (payload) => get().socket?.emit('annotation:add', payload),
  pasteObject: (payload) => get().socket?.emit('object:paste', payload),
  summonCast: (payload) => get().socket?.emit('summon:cast', payload),
  removeAnnotation: (id) => get().socket?.emit('annotation:remove', { id }),
  clearAnnotations: (mapId, mineOnly, kind) =>
    get().socket?.emit('annotation:clear', { mapId, mineOnly, kind }),
  moveAnnotation: (id, x, y) =>
    get().socket?.emit('annotation:move', { id, x, y }),
  resizeAnnotation: (id, width, height) =>
    get().socket?.emit('annotation:resize', { id, width, height }),
  decalPopupId: null,
  openDecalPopup: (id) => set({ decalPopupId: id }),
  setDecalPopup: (id, popup) => get().socket?.emit('annotation:setPopup', { id, popup }),
  addMapImage: (payload) => get().socket?.emit('mapImage:add', payload),
  moveMapImage: (id, x, y) => get().socket?.emit('mapImage:move', { id, x, y }),
  resizeMapImage: (id, x, y, w, h) =>
    get().socket?.emit('mapImage:resize', { id, x, y, w, h }),
  reorderMapImage: (id, to) => get().socket?.emit('mapImage:reorder', { id, to }),
  removeMapImage: (id) => get().socket?.emit('mapImage:remove', { id }),
  loadCharacterFromLibrary: (name, claim) =>
    get().socket?.emit('character:loadFromLibrary', { name, claim }),
  renameSession: (name) => get().socket?.emit('session:rename', { name }),
  importMapsFromSession: (sourceCode, mapIds, resolutions) =>
    get().socket?.emit('session:importMaps', { sourceCode, mapIds, resolutions }),
  previewImport: (sourceCode, mapIds) =>
    new Promise((resolve) => {
      const sock = get().socket;
      if (!sock) return resolve([]);
      sock.emit('session:importPreview', { sourceCode, mapIds }, resolve);
    }),
  setFogLayer: (mapId, layer, enabled) =>
    get().socket?.emit('fog:setLayer', { mapId, layer, enabled }),
  paintFog: (mapId, layer, cells, reveal) =>
    get().socket?.emit('fog:paint', { mapId, layer, cells, reveal }),
  coverFog: (mapId, layer) =>
    get().socket?.emit('fog:cover', { mapId, layer }),
  spawnToken: (mapId, kind, refId, x, y) =>
    get().socket?.emit('token:spawn', { mapId, kind, refId, x, y }),
  moveToken: (tokenId, x, y) =>
    get().socket?.emit('token:move', { tokenId, x, y }),
  resizeToken: (tokenId, widthFt) =>
    get().socket?.emit('token:resize', { tokenId, widthFt }),
  setTokenShape: (tokenId, shape) =>
    get().socket?.emit('token:setShape', { tokenId, shape }),
  deleteToken: (tokenId) => get().socket?.emit('token:delete', { tokenId }),
  duplicateToken: (tokenId) =>
    get().socket?.emit('token:duplicate', { tokenId }),
  setTokenHidden: (tokenId, hidden) =>
    get().socket?.emit('token:setHidden', { tokenId, hidden }),
  setTokenInCombat: (tokenId, inCombat) =>
    get().socket?.emit('token:setInCombat', { tokenId, inCombat }),
  copyTokens: (fromMapId, toMapId, kinds) =>
    get().socket?.emit('tokens:copy', { fromMapId, toMapId, kinds }),
  applyDamage: (kind, refId, amount) =>
    get().socket?.emit('damage:apply', { kind, refId, amount }),
  setTempHp: (kind, refId, amount) =>
    get().socket?.emit('tempHp:set', { kind, refId, amount }),
  setCondition: (kind, refId, condition) =>
    get().socket?.emit('condition:set', { kind, refId, condition }),
  clearCondition: (kind, refId, conditionId) =>
    get().socket?.emit('condition:clear', { kind, refId, conditionId }),
  claimCharacter: (characterId) =>
    get().socket?.emit('character:claim', { characterId }),
  unlockCharacter: (characterId) =>
    get().socket?.emit('character:unlock', { characterId }),
  createCharacter: (input) => get().socket?.emit('character:create', input),
  updateCharacter: (payload) => get().socket?.emit('character:update', payload),
  aiFillCharacter: (characterId) => {
    set({ aiBusy: true, toast: { id: Date.now(), message: '✨ Asking AI…' } });
    get().socket?.emit('ai:fillCharacter', { characterId });
  },
  aiCreateCharacter: (description) => {
    set({ aiBusy: true, toast: { id: Date.now(), message: '✨ Asking AI…' } });
    get().socket?.emit('ai:createCharacter', { description });
  },
  askAssistant: (question, backend) => {
    set({ aiBusy: true, assistantThinking: true });
    get().socket?.emit('assistant:ask', { question, backend });
  },
  assistantThinking: false,
  cancelAssistant: () => {
    set({ assistantThinking: false });
    get().socket?.emit('assistant:cancel');
  },
  requestRecap: () => {
    set({ aiBusy: true, toast: { id: Date.now(), message: '📜 Writing a recap…' } });
    get().socket?.emit('assistant:recap');
  },
  speakAs: (tokenId) => {
    set({ aiBusy: true, toast: { id: Date.now(), message: '💬 Voicing the creature…' } });
    get().socket?.emit('creature:speak', { tokenId });
  },
  rulebookView: null,
  openRulebook: (page) => set({ rulebookView: { page } }),
  closeRulebook: () => set({ rulebookView: null }),
  releaseCharacter: () => get().socket?.emit('character:release'),
  setResource: (payload) => get().socket?.emit('resource:set', payload),
  setItem: (characterId, item) =>
    get().socket?.emit('item:set', { characterId, item }),
  removeItem: (characterId, itemId) =>
    get().socket?.emit('item:remove', { characterId, itemId }),
  useItem: (characterId, itemId) =>
    get().socket?.emit('item:use', { characterId, itemId }),
  setLoot: (monsterId, loot) =>
    get().socket?.emit('object:setLoot', { monsterId, loot }),
  takeLoot: (payload) => get().socket?.emit('loot:take', payload),
  disarmTrap: (payload) => get().socket?.emit('trap:disarm', payload),
  interactObject: (payload) => get().socket?.emit('object:interact', payload),
  setSheetAbility: (kind, refId, ability) =>
    get().socket?.emit('ability:set', { kind, refId, ability }),
  removeSheetAbility: (kind, refId, abilityId) =>
    get().socket?.emit('ability:remove', { kind, refId, abilityId }),
  reorderSheetAbilities: (kind, refId, orderedIds) =>
    get().socket?.emit('ability:reorder', { kind, refId, orderedIds }),
  rollAbility: (payload) => get().socket?.emit('ability:roll', payload),
  rollDeathSave: (characterId) => get().socket?.emit('death:roll', { characterId }),
  sendChat: (text, speakAsTokenId) =>
    get().socket?.emit('chat:send', { text, speakAsTokenId }),
  rollSkill: (payload) => get().socket?.emit('skill:roll', payload),
  rollSave: (payload) => get().socket?.emit('save:roll', payload),
  rollCheck: (payload) => get().socket?.emit('check:roll', payload),
  damageTokens: (tokenIds, amount) =>
    get().socket?.emit('tokens:damage', { tokenIds, amount }),
  setTokensInCombat: (tokenIds, inCombat) =>
    get().socket?.emit('tokens:setInCombat', { tokenIds, inCombat }),
  setTokensHidden: (tokenIds, hidden) =>
    get().socket?.emit('tokens:setHidden', { tokenIds, hidden }),
  setTokensCondition: (tokenIds, condition) =>
    get().socket?.emit('tokens:setCondition', { tokenIds, condition }),
  clearTokensConditions: (tokenIds) =>
    get().socket?.emit('tokens:clearConditions', { tokenIds }),
  createMonster: (input) => get().socket?.emit('monster:create', input),
  updateMonster: (payload) => get().socket?.emit('monster:update', payload),
  aiFillCreature: (monsterId) => {
    set({ aiBusy: true, toast: { id: Date.now(), message: '✨ Asking AI…' } });
    get().socket?.emit('ai:fillCreature', { monsterId });
  },
  deleteMonster: (monsterId) =>
    get().socket?.emit('monster:delete', { monsterId }),
  setCreatureNotes: (monsterId, notes) =>
    get().socket?.emit('creature:setNotes', { monsterId, notes }),
  deleteCharacter: (characterId) =>
    get().socket?.emit('character:delete', { characterId }),
  setTokensIcon: (tokenIds, icon) =>
    get().socket?.emit('tokens:setIcon', { tokenIds, icon }),
  setTokensHideCombatRole: (tokenIds, hide) =>
    get().socket?.emit('tokens:setHideCombatRole', { tokenIds, hide }),
  setTokensCombatRole: (tokenIds, role) =>
    get().socket?.emit('tokens:setCombatRole', { tokenIds, role }),
  setInitiative: (tokenId, initiative) =>
    get().socket?.emit('initiative:set', { tokenId, initiative }),
  rollAllInitiative: () => get().socket?.emit('initiative:rollAll'),
  rollMissingInitiative: () => get().socket?.emit('initiative:rollMissing'),
  nextTurn: () => get().socket?.emit('initiative:next'),
  endTurn: () => get().socket?.emit('initiative:endTurn'),
  clearInitiative: () => get().socket?.emit('initiative:clear'),
  setRound: (round) => get().socket?.emit('initiative:setRound', { round }),
  setHideDmRolls: (hide) =>
    get().socket?.emit('session:setHideDmRolls', { hide }),
  rollDice: (payload) => get().socket?.emit('dice:roll', payload),
  clearRollLog: () => get().socket?.emit('dice:clearLog'),
  undo: () => get().socket?.emit('session:undo'),
  combatAttack: (payload) => get().socket?.emit('combat:attack', payload),
  combatDamage: (rollId) => get().socket?.emit('combat:damage', { rollId }),
  combatSave: (payload) => get().socket?.emit('combat:save', payload),
  setManualDamage: (manual) =>
    get().socket?.emit('session:setManualDamage', { manual }),
}));

// Dev-only: expose the store for E2E tests / debugging (stripped from prod builds).
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}

// When the tab returns to the foreground, nudge a dead socket back to life.
// iOS Safari freezes backgrounded tabs and silently drops the WebSocket; Socket.IO
// usually auto-reconnects, but an explicit connect() makes it immediate.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const { socket, status } = useStore.getState();
    if (socket?.disconnected && (status === 'reconnecting' || status === 'connected')) {
      socket.connect();
    }
  });
}
