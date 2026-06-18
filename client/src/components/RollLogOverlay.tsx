import { useEffect, useState } from 'react';
import type { RollEntry, ChatMessage } from '../../../shared/types';
import { rollCategory, rollerColor } from '../lib/rollStyle';
import { renderRollDetail } from '../lib/rollDetail';
import { mergeFeed, type FeedItem } from '../lib/feed';

const WINDOW_MS = 20_000; // after this, the latest line dims to a faint hover target
const HOVER_STACK = 5; // how many recent entries hovering reveals (incl. the latest)

/**
 * Compact feed of rolls AND chat pinned to the bottom-left of the map. By default
 * it shows ONLY the latest line (full opacity when fresh, then dimming to a faint
 * hover target ~20s later) so a busy round never crowds the map. Hovering the
 * latest (bottom) line reveals the last few entries; the expanded stack stays open
 * until the cursor leaves the panel. The reveal trigger is the bottom line ALONE,
 * so brushing the revealed entries above can't keep it stuck open.
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

  const stale = now - latest.createdAt >= WINDOW_MS;
  // Collapsed: just the latest line. Hovered: the last few (latest included).
  const shown: FeedItem[] = hovered ? feed.slice(-HOVER_STACK) : [latest];

  return (
    // Leaving the panel collapses it; the reveal trigger (onMouseEnter) lives on
    // the bottom line only, so hovering the revealed stack above never re-expands.
    <div className="roll-log-overlay" onMouseLeave={() => setHovered(false)}>
      {shown.map((item) => {
        // Collapsed + stale → the latest line is faint (still a hover target).
        const opacity = hovered ? 1 : stale ? 0.3 : 1;
        // The latest entry is the bottom line — the sole hover-to-reveal target.
        const onMouseEnter =
          item.id === latest.id ? () => setHovered(true) : undefined;
        if (item.kind === 'chat') {
          const m = item.chat;
          return (
            <div
              key={item.id}
              className={`chat-msg ${m.role}`}
              style={{ opacity }}
              onMouseEnter={onMouseEnter}
            >
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
            onMouseEnter={onMouseEnter}
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
