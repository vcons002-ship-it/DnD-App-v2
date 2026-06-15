import { memo } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import { rollerColor } from '../lib/rollStyle';

/**
 * Live "laser pointers": a small labeled arrow at each other participant's cursor
 * (server `fx:cursor`, keyed by socket id). Drawn inside the transformed map
 * layer so coordinates match tokens; sizes are divided by the view scale to stay
 * ~constant on screen regardless of zoom. Click-through (listening=false).
 */
export const CursorPointers = memo(function CursorPointers({
  cursors,
  currentMapId,
  scale,
}: {
  cursors: Record<string, { name: string; x: number; y: number; mapId: string }>;
  currentMapId: string | undefined;
  scale: number;
}) {
  const entries = Object.entries(cursors).filter(([, c]) => c.mapId === currentMapId);
  if (entries.length === 0) return null;
  const s = 1 / Math.max(scale, 0.05); // keep a roughly constant on-screen size

  return (
    <>
      {entries.map(([id, c]) => {
        const color = rollerColor(c.name);
        const fontSize = 12 * s;
        const padX = 4 * s;
        const labelW = c.name.length * fontSize * 0.6 + padX * 2;
        const labelH = fontSize + 4 * s;
        return (
          <Group key={id} x={c.x} y={c.y} listening={false}>
            {/* Arrow pointer (tip at the exact cursor point). */}
            <Line
              points={[0, 0, 15 * s, 5 * s, 6 * s, 6 * s, 5 * s, 15 * s]}
              closed
              fill={color}
              stroke="#0009"
              strokeWidth={s}
              shadowColor="#000"
              shadowBlur={2 * s}
              shadowOpacity={0.5}
            />
            {/* Name tag below-right of the tip. */}
            <Group x={13 * s} y={13 * s}>
              <Rect width={labelW} height={labelH} fill={color} cornerRadius={3 * s} opacity={0.92} />
              <Text
                text={c.name}
                x={padX}
                y={2 * s}
                fontSize={fontSize}
                fontStyle="bold"
                fill="#1a1607"
              />
            </Group>
          </Group>
        );
      })}
    </>
  );
});
