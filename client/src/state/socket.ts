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
  Condition,
  DiceRollPayload,
  FogLayer,
  HpFxEvent,
  ImportCharConflict,
  ImportConflictResolution,
  InventoryItem,
  LootContents,
  LootTakePayload,
  TrapDisarmPayload,
  MeasureAddPayload,
  AnnotationAddPayload,
  ResourceSetPayload,
  JoinAck,
  MonsterCreatePayload,
  MonsterUpdatePayload,
  Role,
  ServerToClientEvents,
  SaveRollPayload,
  SheetAbility,
  SkillRollPayload,
  StateSnapshot,
  TokenKind,
} from '../../../shared/types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/** One floating damage/heal number over a token (client-side, transient). */
export type HpFloater = HpFxEvent & { id: number };
let nextFloaterId = 1;

type Store = {
  socket: TypedSocket | null;
  status: Status;
  error: string | null;
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
  /** Show the transparent roll-log overlay on the map (toggled from DicePanel). */
  showRollOverlay: boolean;
  toggleRollOverlay: () => void;
  /** Show the quick-roll d20 button in the map's bottom-right corner (toggled from DicePanel). */
  showDiceButton: boolean;
  toggleDiceButton: () => void;
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
  setActiveMap: (mapId: string) => void;
  deleteMap: (mapId: string) => void;
  renameMap: (mapId: string, name: string) => void;
  setMapGrid: (
    mapId: string,
    gridSizePx: number,
    feetPerSquare: number,
    widthFt: number,
  ) => void;
  addMeasurement: (payload: MeasureAddPayload) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: (mapId: string, mineOnly?: boolean) => void;
  addAnnotation: (payload: AnnotationAddPayload) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: (mapId: string, mineOnly?: boolean) => void;
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
  deleteToken: (tokenId: string) => void;
  duplicateToken: (tokenId: string) => void;
  setTokenHidden: (tokenId: string, hidden: boolean) => void;
  copyTokens: (fromMapId: string, toMapId: string, kinds: TokenKind[]) => void;
  applyDamage: (kind: TokenKind, refId: string, amount: number) => void;
  setCondition: (
    kind: TokenKind,
    refId: string,
    condition: Omit<Condition, 'id'>,
  ) => void;
  clearCondition: (kind: TokenKind, refId: string, conditionId: string) => void;
  claimCharacter: (characterId: string) => void;
  createCharacter: (input: CharacterCreatePayload) => void;
  updateCharacter: (payload: CharacterUpdatePayload) => void;
  aiFillCharacter: (characterId: string) => void;
  aiCreateCharacter: (description: string) => void;
  releaseCharacter: () => void;
  setResource: (payload: ResourceSetPayload) => void;
  setItem: (characterId: string, item: InventoryItem) => void;
  removeItem: (characterId: string, itemId: string) => void;
  setLoot: (monsterId: string, loot: LootContents) => void;
  takeLoot: (payload: LootTakePayload) => void;
  disarmTrap: (payload: TrapDisarmPayload) => void;
  setSheetAbility: (kind: TokenKind, refId: string, ability: SheetAbility) => void;
  removeSheetAbility: (kind: TokenKind, refId: string, abilityId: string) => void;
  rollAbility: (payload: AbilityRollPayload) => void;
  rollDeathSave: (characterId: string) => void;
  sendChat: (text: string) => void;
  rollSkill: (payload: SkillRollPayload) => void;
  rollSave: (payload: SaveRollPayload) => void;
  damageTokens: (tokenIds: string[], amount: number) => void;
  setTokensHidden: (tokenIds: string[], hidden: boolean) => void;
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
  clearInitiative: () => void;
  setRound: (round: number) => void;
  rollDice: (payload: DiceRollPayload) => void;
  clearRollLog: () => void;
  combatAttack: (payload: CombatAttackPayload) => void;
  combatSave: (payload: CombatSavePayload) => void;
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

export const useStore = create<Store>((set, get) => ({
  socket: null,
  status: 'idle',
  error: null,
  snapshot: null,
  toast: null,
  dismissToast: () => set({ toast: null }),
  notify: (message) => set({ toast: { id: Date.now(), message } }),
  aiBusy: false,
  hpFx: [],
  setAiBusy: (aiBusy) => set({ aiBusy }),
  showRollOverlay: true,
  toggleRollOverlay: () => set((s) => ({ showRollOverlay: !s.showRollOverlay })),
  showDiceButton: true,
  toggleDiceButton: () => set((s) => ({ showDiceButton: !s.showDiceButton })),
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
    set({ status: 'connecting', error: null });

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

    socket.on('state:snapshot', (snapshot) => set({ snapshot }));
    socket.on('fx:hp', ({ events }) => {
      const added: HpFloater[] = events.map((e) => ({ ...e, id: nextFloaterId++ }));
      set((st) => ({ hpFx: [...st.hpFx, ...added] }));
      // Expire regardless of whether a canvas rendered them.
      setTimeout(() => {
        const ids = new Set(added.map((f) => f.id));
        set((st) => ({ hpFx: st.hpFx.filter((f) => !ids.has(f.id)) }));
      }, 1200);
    });
    socket.on('error', (err) => set({ error: err.message }));
    socket.on('notice', ({ message }) =>
      // A notice is the completion signal for AI requests too — clear the spinner.
      set({ toast: { id: Date.now(), message }, aiBusy: false }),
    );

    socket.on('connect', () => {
      socket.emit(
        'join',
        { sessionCode: code, role, dmPassphrase },
        (ack: JoinAck) => {
          if (ack.ok) {
            set({ status: 'connected', snapshot: ack.snapshot, error: null });
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

  selectMap: (mapId) => get().socket?.emit('map:select', { mapId }),
  setActiveMap: (mapId) => get().socket?.emit('map:setActive', { mapId }),
  deleteMap: (mapId) => get().socket?.emit('map:delete', { mapId }),
  renameMap: (mapId, name) => get().socket?.emit('map:rename', { mapId, name }),
  setMapGrid: (mapId, gridSizePx, feetPerSquare, widthFt) =>
    get().socket?.emit('map:setGrid', { mapId, gridSizePx, feetPerSquare, widthFt }),
  addMeasurement: (payload) => get().socket?.emit('measure:add', payload),
  removeMeasurement: (id) => get().socket?.emit('measure:remove', { id }),
  clearMeasurements: (mapId, mineOnly) =>
    get().socket?.emit('measure:clear', { mapId, mineOnly }),
  addAnnotation: (payload) => get().socket?.emit('annotation:add', payload),
  removeAnnotation: (id) => get().socket?.emit('annotation:remove', { id }),
  clearAnnotations: (mapId, mineOnly) =>
    get().socket?.emit('annotation:clear', { mapId, mineOnly }),
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
  deleteToken: (tokenId) => get().socket?.emit('token:delete', { tokenId }),
  duplicateToken: (tokenId) =>
    get().socket?.emit('token:duplicate', { tokenId }),
  setTokenHidden: (tokenId, hidden) =>
    get().socket?.emit('token:setHidden', { tokenId, hidden }),
  copyTokens: (fromMapId, toMapId, kinds) =>
    get().socket?.emit('tokens:copy', { fromMapId, toMapId, kinds }),
  applyDamage: (kind, refId, amount) =>
    get().socket?.emit('damage:apply', { kind, refId, amount }),
  setCondition: (kind, refId, condition) =>
    get().socket?.emit('condition:set', { kind, refId, condition }),
  clearCondition: (kind, refId, conditionId) =>
    get().socket?.emit('condition:clear', { kind, refId, conditionId }),
  claimCharacter: (characterId) =>
    get().socket?.emit('character:claim', { characterId }),
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
  releaseCharacter: () => get().socket?.emit('character:release'),
  setResource: (payload) => get().socket?.emit('resource:set', payload),
  setItem: (characterId, item) =>
    get().socket?.emit('item:set', { characterId, item }),
  removeItem: (characterId, itemId) =>
    get().socket?.emit('item:remove', { characterId, itemId }),
  setLoot: (monsterId, loot) =>
    get().socket?.emit('object:setLoot', { monsterId, loot }),
  takeLoot: (payload) => get().socket?.emit('loot:take', payload),
  disarmTrap: (payload) => get().socket?.emit('trap:disarm', payload),
  setSheetAbility: (kind, refId, ability) =>
    get().socket?.emit('ability:set', { kind, refId, ability }),
  removeSheetAbility: (kind, refId, abilityId) =>
    get().socket?.emit('ability:remove', { kind, refId, abilityId }),
  rollAbility: (payload) => get().socket?.emit('ability:roll', payload),
  rollDeathSave: (characterId) => get().socket?.emit('death:roll', { characterId }),
  sendChat: (text) => get().socket?.emit('chat:send', { text }),
  rollSkill: (payload) => get().socket?.emit('skill:roll', payload),
  rollSave: (payload) => get().socket?.emit('save:roll', payload),
  damageTokens: (tokenIds, amount) =>
    get().socket?.emit('tokens:damage', { tokenIds, amount }),
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
  clearInitiative: () => get().socket?.emit('initiative:clear'),
  setRound: (round) => get().socket?.emit('initiative:setRound', { round }),
  rollDice: (payload) => get().socket?.emit('dice:roll', payload),
  clearRollLog: () => get().socket?.emit('dice:clearLog'),
  combatAttack: (payload) => get().socket?.emit('combat:attack', payload),
  combatSave: (payload) => get().socket?.emit('combat:save', payload),
}));

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
