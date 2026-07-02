import { useCallback, useEffect, useRef, useState } from 'react';
import type { StateSnapshot, Token } from '../../../shared/types';
import { useStore } from '../state/socket';

/**
 * Token selection shared by the DM and player views. Supports additive
 * (shift/ctrl-click) multi-select and moves the whole selection together when
 * one of its members is dragged.
 *
 * Pass `syncKey` to mirror the selection across same-browser tabs via a
 * BroadcastChannel — e.g. so multi-selecting in the DM Data window also selects
 * those tokens on the map window (and vice-versa).
 */
export function useSelection(snapshot: StateSnapshot | null, syncKey?: string) {
  const moveTokenSocket = useStore((s) => s.moveToken);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Cross-tab sync (best-effort; no-op where BroadcastChannel is unavailable).
  // The channel is created AND closed inside one effect (held via a ref), so
  // StrictMode's mount→cleanup→mount can't leave a listener/postMessage pointed
  // at a channel a prior cleanup already closed.
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fromRemote = useRef(false);
  useEffect(() => {
    if (!syncKey || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(syncKey);
    channelRef.current = channel;
    channel.onmessage = (e: MessageEvent) => {
      fromRemote.current = true;
      setSelectedIds(e.data as string[]);
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [syncKey]);
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel) return;
    // Don't echo a selection we just received from another tab.
    if (fromRemote.current) {
      fromRemote.current = false;
      return;
    }
    channel.postMessage(selectedIds);
  }, [selectedIds]);

  const handleSelect = useCallback((token: Token | null, additive?: boolean) => {
    if (!token) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((cur) => {
      if (additive) {
        return cur.includes(token.id)
          ? cur.filter((id) => id !== token.id)
          : [...cur, token.id];
      }
      return [token.id];
    });
  }, []);

  const handleMove = useCallback(
    (tokenId: string, x: number, y: number) => {
      const tokens = snapshot?.tokens ?? [];
      const moved = tokens.find((t) => t.id === tokenId);
      if (moved && selectedIds.length > 1 && selectedIds.includes(tokenId)) {
        const dx = x - moved.x;
        const dy = y - moved.y;
        for (const id of selectedIds) {
          const t = tokens.find((tk) => tk.id === id);
          if (!t) continue;
          if (id === tokenId) moveTokenSocket(id, x, y);
          else moveTokenSocket(id, t.x + dx, t.y + dy);
        }
      } else {
        moveTokenSocket(tokenId, x, y);
      }
    },
    [snapshot, selectedIds, moveTokenSocket],
  );

  const primaryId = selectedIds[selectedIds.length - 1] ?? null;

  return { selectedIds, setSelectedIds, handleSelect, handleMove, primaryId };
}
