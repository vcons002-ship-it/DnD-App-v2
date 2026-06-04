import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type {
  ClientToServerEvents,
  Condition,
  FogMode,
  JoinAck,
  MonsterCreatePayload,
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

  connect: (code: string, role: Role, dmPassphrase?: string) => void;
  disconnect: () => void;

  selectMap: (mapId: string) => void;
  setActiveMap: (mapId: string) => void;
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
  createMonster: (input: MonsterCreatePayload) => void;
  deleteMonster: (monsterId: string) => void;
  setTokensIcon: (tokenIds: string[], icon: string) => void;
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

  connect: (code, role, dmPassphrase) => {
    get().socket?.disconnect();
    set({ status: 'connecting', error: null });

    const socket: TypedSocket = io({ transports: ['websocket', 'polling'] });

    socket.on('state:snapshot', (snapshot) => set({ snapshot }));
    socket.on('error', (err) => set({ error: err.message }));

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
  createMonster: (input) => get().socket?.emit('monster:create', input),
  deleteMonster: (monsterId) =>
    get().socket?.emit('monster:delete', { monsterId }),
  setTokensIcon: (tokenIds, icon) =>
    get().socket?.emit('tokens:setIcon', { tokenIds, icon }),
  setInitiative: (tokenId, initiative) =>
    get().socket?.emit('initiative:set', { tokenId, initiative }),
  rollAllInitiative: () => get().socket?.emit('initiative:rollAll'),
  nextTurn: () => get().socket?.emit('initiative:next'),
  clearInitiative: () => get().socket?.emit('initiative:clear'),
}));
