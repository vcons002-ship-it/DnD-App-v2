import { Text } from 'react-konva';

/** A single move: a fading line of footprints from a token's old spot to its new one. */
export type Trail = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  size: number;
};

const N = 6; // footprints per trail
const STAGGER = 110; // ms between each print starting to fade (oldest first)
const FADE = 520; // ms for one print to fade out
const BASE = 0.5; // resting opacity of a print
/** How long a whole trail lives before it can be pruned. */
export const TRAIL_LIFETIME = (N - 1) * STAGGER + FADE;

/**
 * Renders fading footprint trails over the map. For each move, N prints are laid
 * along the path; they fade **oldest-first** — the print at the old location
 * vanishes first and the one nearest the token's new position fades last — for a
 * "walking away from where it was" feel. Purely decorative (non-listening).
 */
export function FootprintTrails({
  trails,
  gridSizePx,
  now,
}: {
  trails: Trail[];
  gridSizePx: number;
  now: number;
}) {
  return (
    <>
      {trails.flatMap((tr) => {
        const dx = tr.to.x - tr.from.x;
        const dy = tr.to.y - tr.from.y;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const elapsed = now - tr.start;
        const fs = Math.max(10, gridSizePx * tr.size * 0.4);
        const marks = [];
        for (let i = 0; i < N; i++) {
          const localT = elapsed - i * STAGGER; // older prints (low i) fade first
          const op = localT < 0 ? BASE : BASE * (1 - localT / FADE);
          if (op <= 0) continue;
          const f = i / (N - 1);
          marks.push(
            <Text
              key={`${tr.id}-${i}`}
              text="👣"
              x={tr.from.x + dx * f}
              y={tr.from.y + dy * f}
              fontSize={fs}
              rotation={angle + 90}
              offsetX={fs / 2}
              offsetY={fs / 2}
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
