import { useEffect, useRef } from 'react';
import type { TokenKind } from '../../../shared/types';

/**
 * Cross-window placement hand-off for the standalone Monster Library window.
 *
 * The library window has no map canvas, so "Place on map" can't drop a token by
 * itself. Instead it ARMS the main DM window: the request travels over a
 * BroadcastChannel and `DmView` sets its existing `pending` state, showing the
 * usual placement banner so the DM clicks the exact spot.
 *
 * Same-browser only (that's what BroadcastChannel is) — the library window
 * disables the button and explains when it can't reach a map window. Adding a
 * creature to the session works from anywhere; only click-to-place needs this.
 *
 * Mirrors the create-AND-close-in-one-effect shape of `useSelection`, so
 * StrictMode's mount→cleanup→mount can't leave a listener on a closed channel.
 */
export type SpawnRequest = {
  kind: TokenKind;
  /** Template id for a monster, character id for a PC. */
  refId: string;
  /** Display name, so the receiving window can name it in the banner/toast. */
  name: string;
};

/** One channel per session, so two sessions open at once can't cross wires. */
export const spawnChannelName = (sessionCode: string): string =>
  `dm-spawn-${sessionCode}`;

/** Whether cross-window placement is possible in this browser at all. */
export const spawnChannelSupported = (): boolean =>
  typeof BroadcastChannel !== 'undefined';

/**
 * Senders keep ONE channel open per session rather than opening and closing one
 * per message: closing a channel immediately after `postMessage` can drop the
 * message before other contexts receive it (delivery is asynchronous).
 */
const senders = new Map<string, BroadcastChannel>();

/** Ask the map window to arm placement. Returns false when unsupported. */
export function postSpawnRequest(sessionCode: string, req: SpawnRequest): boolean {
  if (!spawnChannelSupported()) return false;
  const name = spawnChannelName(sessionCode);
  let channel = senders.get(name);
  if (!channel) {
    channel = new BroadcastChannel(name);
    senders.set(name, channel);
  }
  channel.postMessage(req);
  return true;
}

/** Map-window side: run `onRequest` when another window asks to place a token. */
export function useSpawnRequests(
  sessionCode: string | undefined,
  onRequest: (req: SpawnRequest) => void,
): void {
  // Keep the latest callback in a ref so re-subscribing isn't tied to identity.
  const handler = useRef(onRequest);
  handler.current = onRequest;
  useEffect(() => {
    if (!sessionCode || !spawnChannelSupported()) return;
    const channel = new BroadcastChannel(spawnChannelName(sessionCode));
    channel.onmessage = (e: MessageEvent) => {
      const req = e.data as SpawnRequest | null;
      if (req && typeof req.refId === 'string' && typeof req.kind === 'string') {
        handler.current(req);
      }
    };
    return () => channel.close();
  }, [sessionCode]);
}
