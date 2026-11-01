import { useStore } from '../state/socket';
import { rollLogDetail } from '../../../shared/rollBreakdown';
import { useEffect, useMemo, useState } from 'react';
import type { RollEntry, ChatMessage } from '../../../shared/types';
import { rollCategory, rollerColor } from '../lib/rollStyle';
import { renderRollDetail } from '../lib/rollDetail';
import { RollDamageBreakdown } from './RollDamageBreakdown';
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
  const [stale, setStale] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rollingId = useStore(s => s.showRollAnim && s.rollFx && !s.rollFx.impactReady ? s.rollFx.rollId : null);
  const combatDamage = useStore(s => s.combatDamage);
  const feed = useMemo(()=>mergeFeed(rollLog, chat),[rollLog,chat]);
  const latest = feed[feed.length - 1];

  // One deadline per latest entry; an old feed has no repeating timer or sort.
  useEffect(() => {
    const delay=(latest?.createdAt??0)+WINDOW_MS-Date.now();
    setStale(delay<=0);
    if(delay<=0)return;
    const timer=setTimeout(()=>setStale(true),delay);
    return()=>clearTimeout(timer);
  }, [latest?.id,latest?.createdAt]);
  if (!latest) return null;

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
              className={`chat-msg ${m.role} ${m.whisper || m.channel === 'party' ? 'chat-whisper' : ''}`}
              style={{ opacity }}
              onMouseEnter={onMouseEnter}
            >
              {m.channel === 'party' ? <span className="chat-private-label">Party · players only</span> : m.whisper && <span className="chat-private-label">Private · {m.whisper.participantNames?.join(' & ') || `${m.whisper.characterName} & DM`}</span>}
              <span className="chat-sender">{m.sender}</span>
              <span className="chat-text">{m.text}</span>
              {(m.whisper || m.channel === 'party') && m.image && <span className="chat-image-note"> Image: {m.image.name} (open chat to view)</span>}
            </div>
          );
        }
        const entry = item.roll;
        const color = rollerColor(entry.roller);
        if (entry.id === rollingId) return <div key={item.id} className="roll-entry is-rolling" style={{borderLeftColor: color}}>
          <span className="roll-meta"><strong style={{color}}>{entry.roller}</strong> &middot; {entry.label ?? 'Roll'} &middot; <span className="roll-pending">Rolling...</span></span>
        </div>;
        return (
          <div
            key={item.id}
            className={`roll-entry cat-${rollCategory(entry)}`}
            style={{ borderLeftColor: color, opacity }}
            onMouseEnter={onMouseEnter}
          >
            {!entry.hideTotal&&<span className="roll-total">{entry.total}</span>}
            <span className="roll-meta">
              <strong style={{ color }}>{entry.roller}</strong>
              {entry.label ? ` · ${entry.label}` : ''}{' '}
              <span className="muted">{renderRollDetail(rollLogDetail(entry))}</span>
              <RollDamageBreakdown entry={entry} />
              {entry.hpNote && (
                <span className="roll-hp-note">{entry.hpNote.text}</span>
              )}
              {entry.pending && !entry.pending.done && (
                <button
                  type="button"
                  className="btn tiny roll-dmg"
                  onClick={() => combatDamage(entry.id)}
                  title="Roll the damage for this hit and apply it to the target"
                >
                  🎲 Roll damage
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
