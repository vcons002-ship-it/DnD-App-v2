import { memo } from 'react';
import { Circle, Group, Line, Text } from 'react-konva';
import type { Token } from '../../../shared/types';

/**
 * Renders a ghost "drag tether" for every token ANOTHER user is currently
 * dragging (server `fx:tokenDrag`, kept in the store and auto-expiring). Mirrors
 * the dragger's own local readout: a dashed gold line from the token's committed
 * spot (its snapshot position, which is the drag origin until the move commits)
 * to the live position, with a "N ft" label. Declarative is fine here — watchers
 * aren't dragging, so re-rendering this small layer per update costs nothing.
 */
export const DragGhostLayer = memo(function DragGhostLayer({
  ghosts,
  tokens,
  pxPerFoot,
  gridSizePx,
}: {
  ghosts: Record<string, { x: number; y: number }>;
  tokens: Token[];
  pxPerFoot: number;
  gridSizePx: number;
}) {
  const ids = Object.keys(ghosts);
  if (ids.length === 0) return null;
  const feetPerPixel = pxPerFoot > 0 ? 1 / pxPerFoot : 0;
  const fontSize = Math.max(13, gridSizePx * 0.34);
  return (
    <>
      {ids.map((id) => {
        const tok = tokens.find((t) => t.id === id);
        if (!tok) return null; // token isn't on the viewer's map
        const { x, y } = ghosts[id];
        const ft = feetPerPixel > 0
          ? Math.round(Math.hypot(x - tok.x, y - tok.y) * feetPerPixel)
          : 0;
        return (
          <Group key={id} listening={false}>
            <Line
              points={[tok.x, tok.y, x, y]}
              stroke="#ffd21a"
              strokeWidth={2}
              dash={[9, 6]}
              opacity={0.8}
              shadowColor="#000"
              shadowBlur={3}
              shadowOpacity={0.6}
            />
            <Circle x={tok.x} y={tok.y} radius={4} fill="#ffd21a" stroke="#000" strokeWidth={1} />
            {/* Distance rides the middle of the tether (matching the dragger's
                own readout), gold like the line. */}
            <Text
              x={(tok.x + x) / 2}
              y={(tok.y + y) / 2 - fontSize * 0.9}
              text={`${ft} ft`}
              fontSize={fontSize}
              fontStyle="bold"
              fill="#ffd21a"
              stroke="#000"
              strokeWidth={Math.max(2, gridSizePx * 0.03)}
              fillAfterStrokeEnabled
              shadowColor="#000"
              shadowBlur={4}
              shadowOpacity={0.85}
              align="center"
              width={140}
              offsetX={70}
            />
          </Group>
        );
      })}
    </>
  );
});
