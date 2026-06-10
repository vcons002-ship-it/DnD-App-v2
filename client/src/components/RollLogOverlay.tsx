import { useEffect, useState } from 'react';
import type { RollEntry, ChatMessage } from '../../../shared/types';
import { rollCategory, rollerColor } from '../lib/rollStyle';
import { renderRollDetail } from '../lib/rollDetail';
import { mergeFeed, type FeedItem } from '../lib/feed';

const WINDOW_MS = 20_000; // an entry auto-fades this long after it arrives
const STALE_MS = 60_000; // past this, hovering reveals only the latest entry
const FADE_MS = 400; // grace window matching the CSS opacity transition
const MAX_STACK = 6; // cap so a busy round can't cover the map

/**
 * Compact feed of rolls AND chat pinned to the bottom-left of the map. New
 * entries fade in and, when idle, fade out ~20s later — leaving only a faint
 * latest line as a hover target. Hovering fades the panel back to full opacity:
 * within a minute it reveals the recent stack; once the latest entry is over a
 * minute old, hovering shows only that single latest entry.
 */
export function RollLogOverlay({
  rollLog,
  chat,
}: {
  rollLog: RollEntry[];
  chat: ChatMessage[];
}) {
  const [now, setNow] = useState(() => Date.now());
  const [hovered, setHovered] = useState(false);
  const feed = mergeFeed(rollLog, chat);

  // Re-evaluate ages on a slow tick so lines age out on their own.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  // Snap to the current time on a new entry so it appears immediately.
  useEffect(() => setNow(Date.now()), [feed.length]);

  const latest = feed[feed.length - 1];
  if (!latest) return null;

  // Most-recent entries inside a window (+ fade grace), oldest first → newest last.
  const within = (ms: number) =>
    feed.filter((f) => now - f.createdAt < ms + FADE_MS).slice(-MAX_STACK);

  const stale = now - latest.createdAt >= WINDOW_MS;
  let shown: FeedItem[];
  if (hovered) {
    const recent = within(STALE_MS);
    shown = recent.length ? recent : [latest];
  } else if (stale) {
    shown = [latest]; // faint, persistent hover target
  } else {
    shown = within(WINDOW_MS);
  }

  return (
    <div
      className="roll-log-overlay"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {shown.map((item) => {
        const aged = now - item.createdAt >= WINDOW_MS;
        const opacity = hovered ? 1 : stale ? 0.22 : aged ? 0 : 1;
        if (item.kind === 'chat') {
          const m = item.chat;
          return (
            <div key={item.id} className={`chat-msg ${m.role}`} style={{ opacity }}>
              <span className="chat-sender">{m.sender}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          );
        }
        const entry = item.roll;
        const color = rollerColor(entry.roller);
        return (
          <div
            key={item.id}
            className={`roll-entry cat-${rollCategory(entry)}`}
            style={{ borderLeftColor: color, opacity }}
          >
            <span className="roll-total">{entry.total}</span>
            <span className="roll-meta">
              <strong style={{ color }}>{entry.roller}</strong>
              {entry.label ? ` · ${entry.label}` : ''}{' '}
              <span className="muted">{renderRollDetail(entry.detail)}</span>
              {entry.hpNote && (
                <span className="roll-hp-note">{entry.hpNote.text}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
