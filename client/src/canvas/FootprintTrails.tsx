import { useEffect, useRef, useState } from 'react';
import { Ellipse } from 'react-konva';
import type { Token } from '../../../shared/types';

/** A single move: a fading line of footprints from a token's old spot to its new one. */
type Trail = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  /** Token footprint width in feet — sizes the prints to the creature. */
  widthFt: number;
  /** Footprint count for this move (derived from its length → constant spacing). */
  n: number;
  /** When set, the whole trail fades out by this time (bumped past the cap). */
  expireAt?: number;
};

// Footprints are spaced a CONSTANT distance apart (≈ one per 0.8 grid cells), so a
// short hop drops a couple and a long stride drops a line of them — never stretched.
const SPACING = 0.8; // grid cells between consecutive footprints
const MIN_PRINTS = 2;
const MAX_PRINTS = 16;
const HOLD = 2500; // ms the full trail lingers (fully opaque) before any fade
const STAGGER = 1200; // ms between each print starting to fade (oldest first)
const FADE = 3500; // ms for one print to fade out (fast)
const BASE = 0.92; // resting opacity of a (white) print — high-visibility
const MAX_TRAILS = 6; // most-recent trails kept
const EXPIRE_FADE = 1500; // ms graceful fade-out when bumped past the cap
const MOVE_EPS = 0.5; // cells; ignore sub-half-cell jitter
const TICK_MS = 120;

/** Footprints for a move of `lenPx` at the given grid size — constant spacing. */
const countFor = (lenPx: number, gridSizePx: number) =>
  Math.max(
    MIN_PRINTS,
    Math.min(MAX_PRINTS, Math.round(lenPx / Math.max(1, gridSizePx * SPACING)) + 1),
  );

const lifetimeOf = (t: Trail) => HOLD + (t.n - 1) * STAGGER + FADE;
const alive = (t: Trail, at: number) =>
  t.expireAt != null ? at < t.expireAt : at - t.start < lifetimeOf(t);

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
  pxPerFoot,
}: {
  tokens: Token[];
  gridSizePx: number;
  pxPerFoot: number;
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
      const moved = prev ? Math.hypot(t.x - prev.x, t.y - prev.y) : 0;
      if (prev && moved > gridSizePx * MOVE_EPS) {
        fresh.push({
          id: `${t.id}-${t0}`,
          from: prev,
          to: { x: t.x, y: t.y },
          start: t0,
          widthFt: t.widthFt,
          n: countFor(moved, gridSizePx),
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
        const sz = tr.widthFt * pxPerFoot;
        const rx = Math.max(4, sz * 0.2); // foot length (along travel)
        const ry = Math.max(2.5, sz * 0.12); // foot width
        const spread = sz * 0.16; // left/right offset from the centerline
        const n = tr.n;
        const marks = [];
        for (let i = 0; i < n; i++) {
          // The whole trail holds at BASE for HOLD ms, then prints fade oldest-first.
          const localT = elapsed - HOLD - i * STAGGER;
          const natural = localT < 0 ? BASE : BASE * (1 - localT / FADE);
          const op = Math.max(0, natural) * capFade;
          if (op <= 0) continue;
          const f = n === 1 ? 0 : i / (n - 1);
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
              stroke="#000000a6"
              strokeWidth={Math.max(0.8, ry * 0.25)}
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
