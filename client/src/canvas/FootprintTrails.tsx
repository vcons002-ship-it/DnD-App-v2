import { useEffect, useRef, useState } from 'react';
import { Ellipse } from 'react-konva';
import type { Token } from '../../../shared/types';

/** A single move: a fading line of footprints from a token's old spot to its new one. */
type Trail = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  size: number;
  /** When set, the whole trail fades out by this time (bumped past the cap). */
  expireAt?: number;
};

const N = 6; // footprints per trail
const STAGGER = 4000; // ms between each print starting to fade (oldest first)
const FADE = 10000; // ms for one print to fade out
const BASE = 0.7; // resting opacity of a (white) print
const LIFETIME = (N - 1) * STAGGER + FADE; // ~30s natural linger
const MAX_TRAILS = 6; // most-recent trails kept
const EXPIRE_FADE = 2000; // ms graceful fade-out when bumped past the cap
const MOVE_EPS = 0.5; // cells; ignore sub-half-cell jitter
const TICK_MS = 150; // fade is slow, so a coarse tick stays smooth and cheap

const alive = (t: Trail, at: number) =>
  t.expireAt != null ? at < t.expireAt : at - t.start < LIFETIME;

/**
 * Renders lingering **white** footprint trails over the map. For each move, N
 * prints are laid along the path (alternating left/right feet, each with a faint
 * dark outline for contrast on light maps); they fade **oldest-first** over ~30s
 * so players remember where a token came from. Only the **6 most recent** trails
 * are kept — when a 7th move arrives the oldest trail **fades out** (~2s) instead
 * of popping. Self-contained: owns the position-diff + the fade tick, so the long
 * fade never re-renders the rest of the map. Purely decorative (non-listening).
 */
export function FootprintLayer({
  tokens,
  gridSizePx,
}: {
  tokens: Token[];
  gridSizePx: number;
}) {
  const [trails, setTrails] = useState<Trail[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const prevPos = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Diff token positions across snapshots → a real move leaves a fresh trail.
  useEffect(() => {
    const nextPos = new Map<string, { x: number; y: number }>();
    const fresh: Trail[] = [];
    const t0 = Date.now();
    for (const t of tokens) {
      const prev = prevPos.current.get(t.id);
      nextPos.set(t.id, { x: t.x, y: t.y });
      if (prev && Math.hypot(t.x - prev.x, t.y - prev.y) > gridSizePx * MOVE_EPS) {
        fresh.push({
          id: `${t.id}-${t0}`,
          from: prev,
          to: { x: t.x, y: t.y },
          start: t0,
          size: t.size,
        });
      }
    }
    prevPos.current = nextPos;
    if (!fresh.length) return;
    setNow(t0);
    setTrails((cur) => {
      let next = [...cur, ...fresh];
      // Cap the active (non-expiring) trails; bump the oldest excess into a
      // short graceful fade-out instead of dropping them instantly.
      const active = next.filter((t) => t.expireAt == null);
      if (active.length > MAX_TRAILS) {
        const bumped = new Set(
          active.slice(0, active.length - MAX_TRAILS).map((t) => t.id),
        );
        next = next.map((t) =>
          bumped.has(t.id) ? { ...t, expireAt: t0 + EXPIRE_FADE } : t,
        );
      }
      return next;
    });
  }, [tokens, gridSizePx]);

  // Self-tick the fade and prune fully-gone trails while any is still alive.
  const anyLive = trails.some((t) => alive(t, Date.now()));
  useEffect(() => {
    if (!anyLive) return;
    const iv = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setTrails((cur) => cur.filter((t) => alive(t, at)));
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [anyLive]);

  return (
    <>
      {trails.flatMap((tr) => {
        const dx = tr.to.x - tr.from.x;
        const dy = tr.to.y - tr.from.y;
        const len = Math.hypot(dx, dy) || 1;
        const perpX = -dy / len; // perpendicular, to offset left/right feet
        const perpY = dx / len;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const elapsed = now - tr.start;
        const capFade =
          tr.expireAt != null
            ? Math.max(0, Math.min(1, (tr.expireAt - now) / EXPIRE_FADE))
            : 1;
        const sz = gridSizePx * tr.size;
        const rx = Math.max(3, sz * 0.16); // foot length (along travel)
        const ry = Math.max(2, sz * 0.09); // foot width
        const spread = sz * 0.14; // left/right offset from the centerline
        const marks = [];
        for (let i = 0; i < N; i++) {
          const localT = elapsed - i * STAGGER; // older prints (low i) fade first
          const natural = localT < 0 ? BASE : BASE * (1 - localT / FADE);
          const op = natural * capFade;
          if (op <= 0) continue;
          const f = i / (N - 1);
          const side = i % 2 === 0 ? 1 : -1;
          marks.push(
            <Ellipse
              key={`${tr.id}-${i}`}
              x={tr.from.x + dx * f + perpX * spread * side}
              y={tr.from.y + dy * f + perpY * spread * side}
              radiusX={rx}
              radiusY={ry}
              rotation={angle}
              fill="#ffffff"
              stroke="#00000073"
              strokeWidth={Math.max(0.6, ry * 0.22)}
              opacity={op}
              listening={false}
            />,
          );
        }
        return marks;
      })}
    </>
  );
}
