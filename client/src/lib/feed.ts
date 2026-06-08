import type { RollEntry, ChatMessage } from '../../../shared/types';

/** A single entry in the unified rolls + chat feed. */
export type FeedItem =
  | { kind: 'roll'; id: string; createdAt: number; roll: RollEntry }
  | { kind: 'chat'; id: string; createdAt: number; chat: ChatMessage };

/** Interleave the roll log and chat into one chronological feed (oldest first). */
export function mergeFeed(rollLog: RollEntry[], chat: ChatMessage[]): FeedItem[] {
  const items: FeedItem[] = [
    ...rollLog.map((r) => ({ kind: 'roll' as const, id: r.id, createdAt: r.createdAt, roll: r })),
    ...chat.map((c) => ({ kind: 'chat' as const, id: c.id, createdAt: c.createdAt, chat: c })),
  ];
  // Stable chronological order; ties keep rolls and chat from jumping around.
  return items.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
