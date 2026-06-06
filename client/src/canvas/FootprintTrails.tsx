import { useEffect, useState } from 'react';
import { Ellipse } from 'react-konva';

/** A single move: a fading line of footprints from a token's old spot to its new one. */
export type Trail = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  size: number;
};

const N = 6; // footprints per trail
const STAGGER = 4000; // ms between each print starting to fade (oldest first)
const FADE = 10000; // ms for one print to fade out
const BASE = 0.7; // resting opacity of a (white) print
/** How long a whole trail lingers before it's fully gone (~30s). */
export const TRAIL_LIFETIME = (N - 1) * STAGGER + FADE;
const TICK_MS = 150; // fade is slow, so a coarse tick stays smooth and cheap

/**
 * Renders fading **white** footprint trails over the map. For each move, N prints
 * are laid along the path (alternating left/right feet); they fade **oldest-first**
 * over ~30s — the print at the old location vanishes first and the one nearest the
 * token's new position lingers longest — so players remember where a token came
 * from. Purely decorative (non-listening). Self-ticks so it doesn't re-render the
 * rest of the map during the long fade.
 */
export function FootprintTrails({
  trails,
  gridSizePx,
}: {
  trails: Trail[];
  gridSizePx: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  // Snap to current time whenever a new trail arrives so it shows immediately.
  useEffect(() => setNow(Date.now()), [trails]);
  // Tick only while at least one trail is still within its lifetime.
  const anyLive = trails.some((tr) => Date.now() - tr.start < TRAIL_LIFETIME);
  useEffect(() => {
    if (!anyLive) return;
    const iv = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(iv);
  }, [anyLive, trails]);

  return (
    <>
      {trails.flatMap((tr) => {
        const dx = tr.to.x - tr.from.x;
        const dy = tr.to.y - tr.from.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const perpX = -uy; // perpendicular, to offset left/right feet
        const perpY = ux;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const elapsed = now - tr.start;
        const sz = gridSizePx * tr.size;
        const rx = Math.max(3, sz * 0.16); // foot length (along travel)
        const ry = Math.max(2, sz * 0.09); // foot width
        const spread = sz * 0.14; // left/right offset from the centerline
        const marks = [];
        for (let i = 0; i < N; i++) {
          const localT = elapsed - i * STAGGER; // older prints (low i) fade first
          const op = localT < 0 ? BASE : BASE * (1 - localT / FADE);
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
