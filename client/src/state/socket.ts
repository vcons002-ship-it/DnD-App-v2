import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type {
  ClientToServerEvents,
  CombatRole,
  Condition,
  FogMode,
  JoinAck,
  MonsterCreatePayload,
  MonsterUpdatePayload,
  Role,
  ServerToClientEvents,
  StateSnapshot,
  TokenKind,
} from '../../../shared/types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Status = 'idle' | 'connecting' | 'connected' | 'error';

type Store = {
  socket: TypedSocket | null;
  status: Status;
  error: string | null;
  snapshot: StateSnapshot | null;
  /** Transient toast message (server notices, e.g. "Brought 3 tokens"). */
  toast: { id: number; message: string } | null;
  dismissToast: () => void;

  connect: (code: string, role: Role, dmPassphrase?: string) => void;
  disconnect: () => void;

  selectMap: (mapId: string) => void;
  setActiveMap: (mapId: string) => void;
  deleteMap: (mapId: string) => void;
  setFogMode: (mapId: string, mode: FogMode) => void;
  paintFog: (mapId: string, cells: string[], reveal: boolean) => void;
  coverFog: (mapId: string) => void;
  spawnToken: (
    mapId: string,
    kind: TokenKind,
    refId: string,
    x: number,
    y: number,
  ) => void;
  moveToken: (tokenId: string, x: number, y: number) => void;
  resizeToken: (tokenId: string, size: number) => void;
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
  releaseCharacter: () => void;
  createMonster: (input: MonsterCreatePayload) => void;
  updateMonster: (payload: MonsterUpdatePayload) => void;
  deleteMonster: (monsterId: string) => void;
  setTokensIcon: (tokenIds: string[], icon: string) => void;
  setTokensHideCombatRole: (tokenIds: string[], hide: boolean) => void;
  setTokensCombatRole: (
    tokenIds: string[],
    role: CombatRole | null,
  ) => void;
  setInitiative: (tokenId: string, initiative: number | null) => void;
  rollAllInitiative: () => void;
  nextTurn: () => void;
  clearInitiative: () => void;
};

export const useStore = create<Store>((set, get) => ({
  socket: null,
  status: 'idle',
  error: null,
  snapshot: null,
  toast: null,
  dismissToast: () => set({ toast: null }),

  connect: (code, role, dmPassphrase) => {
    get().socket?.disconnect();
    set({ status: 'connecting', error: null });

    const socket: TypedSocket = io({ transports: ['websocket', 'polling'] });

    socket.on('state:snapshot', (snapshot) => set({ snapshot }));
    socket.on('error', (err) => set({ error: err.message }));
    socket.on('notice', ({ message }) =>
      set({ toast: { id: Date.now(), message } }),
    );

    socket.on('connect', () => {
      socket.emit(
        'join',
        { sessionCode: code, role, dmPassphrase },
        (ack: JoinAck) => {
          if (ack.ok) {
            set({ status: 'connected', snapshot: ack.snapshot, error: null });
          } else {
            set({ status: 'error', error: ack.error.message });
            socket.disconnect();
          }
        },
      );
    });

    socket.on('connect_error', () =>
      set({ status: 'error', error: 'Could not reach the server' }),
    );

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, status: 'idle', snapshot: null });
  },

  selectMap: (mapId) => get().socket?.emit('map:select', { mapId }),
  setActiveMap: (mapId) => get().socket?.emit('map:setActive', { mapId }),
  deleteMap: (mapId) => get().socket?.emit('map:delete', { mapId }),
  setFogMode: (mapId, mode) =>
    get().socket?.emit('fog:setMode', { mapId, mode }),
  paintFog: (mapId, cells, reveal) =>
    get().socket?.emit('fog:paint', { mapId, cells, reveal }),
  coverFog: (mapId) => get().socket?.emit('fog:cover', { mapId }),
  spawnToken: (mapId, kind, refId, x, y) =>
    get().socket?.emit('token:spawn', { mapId, kind, refId, x, y }),
  moveToken: (tokenId, x, y) =>
    get().socket?.emit('token:move', { tokenId, x, y }),
  resizeToken: (tokenId, size) =>
    get().socket?.emit('token:resize', { tokenId, size }),
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
  releaseCharacter: () => get().socket?.emit('character:release'),
  createMonster: (input) => get().socket?.emit('monster:create', input),
  updateMonster: (payload) => get().socket?.emit('monster:update', payload),
  deleteMonster: (monsterId) =>
    get().socket?.emit('monster:delete', { monsterId }),
  setTokensIcon: (tokenIds, icon) =>
    get().socket?.emit('tokens:setIcon', { tokenIds, icon }),
  setTokensHideCombatRole: (tokenIds, hide) =>
    get().socket?.emit('tokens:setHideCombatRole', { tokenIds, hide }),
  setTokensCombatRole: (tokenIds, role) =>
    get().socket?.emit('tokens:setCombatRole', { tokenIds, role }),
  setInitiative: (tokenId, initiative) =>
    get().socket?.emit('initiative:set', { tokenId, initiative }),
  rollAllInitiative: () => get().socket?.emit('initiative:rollAll'),
  nextTurn: () => get().socket?.emit('initiative:next'),
  clearInitiative: () => get().socket?.emit('initiative:clear'),
}));
