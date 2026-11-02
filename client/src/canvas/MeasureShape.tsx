import { Circle, Line, Rect, Text } from 'react-konva';
import type { Measurement } from '../../../shared/types';

type Pt = { x: number; y: number };

/** Shapes offered by the Measure menu (Line custom → a thin "ruler"). */
export type MeasureShapeKind = 'circle' | 'cone' | 'line' | 'square' | 'emanation';
export type MeasureSize = 'custom' | 'small' | 'large';
export type MeasureTool = { shape: MeasureShapeKind; size: MeasureSize };
export type DraftMeasure = {
  kind: Measurement['kind'];
  origin: Pt;
  target: Pt;
  tokenId?: string;
};

/** Standard (small/large) sizes in feet — classic 5e spell footprints. */
export const MEASURE_FT: Record<MeasureShapeKind, { small: number; large: number }> = {
  circle: { small: 15, large: 20 },
  cone: { small: 15, large: 60 },
  line: { small: 30, large: 100 },
  square: { small: 10, large: 20 },
  emanation: { small: 10, large: 30 },
};

/** A single measuring shape drawn in image-space, plus a distance label in feet.
 *  Non-listening by default so it never blocks tokens; in remove mode `onRemove`
 *  makes it clickable. `emanation` is rendered by the caller as a `circle`
 *  centred on its token. */
export function MeasureShape({
  kind,
  origin,
  target,
  color,
  grid,
  feetPerPixel,
  onRemove,
}: {
  kind: Measurement['kind'];
  origin: Pt;
  target: Pt;
  color: string;
  grid: number;
  feetPerPixel: number;
  onRemove?: () => void;
}) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.hypot(dx, dy);
  const px2ft = (px: number) => Math.round(px * feetPerPixel);
  const stroke = Math.max(1.5, grid * 0.05);
  const fontSize = Math.max(11, grid * 0.34);
  const fill = { stroke: color, strokeWidth: stroke, fill: color, opacity: 0.18 };
  const listen = !!onRemove;
  const hit = listen ? { listening: true, onClick: onRemove, onTap: onRemove } : { listening: false };

  // Label text + anchor depend on the shape.
  let label = `${px2ft(len)} ft`;
  let labelAt = target;

  let shape = null;
  if (kind === 'circle' || kind === 'emanation') {
    label = `${px2ft(len)} ft r`;
    labelAt = { x: origin.x + len * 0.71, y: origin.y - len * 0.71 };
    shape = <Circle x={origin.x} y={origin.y} radius={len} {...fill} {...hit} />;
  } else if (kind === 'square') {
    const half = len; // stored distance is the half-side
    label = `${px2ft(half * 2)} ft`;
    labelAt = { x: origin.x + half, y: origin.y - half };
    shape = (
      <Rect
        x={origin.x - half}
        y={origin.y - half}
        width={half * 2}
        height={half * 2}
        {...fill}
        {...hit}
      />
    );
  } else if (kind === 'ruler') {
    shape = <Line points={[origin.x, origin.y, target.x, target.y]} stroke={color} strokeWidth={stroke} {...hit} />;
  } else if (len >= 1 && (kind === 'cone' || kind === 'line')) {
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const bx = origin.x + ux * len;
    const by = origin.y + uy * len;
    if (kind === 'cone') {
      // 5e cone: an isosceles triangle whose base width equals its length.
      const h = len / 2;
      shape = (
        <Line
          closed
          points={[origin.x, origin.y, bx + px * h, by + py * h, bx - px * h, by - py * h]}
          {...fill}
          {...hit}
        />
      );
    } else {
      // 5e line AOE: a 5-ft-wide rectangle along the direction.
      const hw = 2.5 / feetPerPixel; // half of 5 ft, in px
      shape = (
        <Line
          closed
          points={[
            origin.x + px * hw,
            origin.y + py * hw,
            bx + px * hw,
            by + py * hw,
            bx - px * hw,
            by - py * hw,
            origin.x - px * hw,
            origin.y - py * hw,
          ]}
          {...fill}
          {...hit}
        />
      );
    }
  }

  return (
    <>
      {shape}
      <Text
        x={labelAt.x + 4}
        y={labelAt.y + 4}
        text={label}
        fontSize={fontSize}
        fill={color}
        stroke="#000"
        strokeWidth={0.5}
        listening={false}
      />
    </>
  );
}
