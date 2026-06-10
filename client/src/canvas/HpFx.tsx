import { memo, useEffect, useRef } from 'react';
import { Group, Text } from 'react-konva';
import Konva from 'konva';
import type { Token } from '../../../shared/types';
import type { HpFloater } from '../state/socket';

/**
 * Floating "−X" / "+X" combat feedback over a token: pops at the token's rim,
 * drifts upward and fades out (~0.9 s Konva.Tween, same pattern as the token's
 * turn-ring animation). Entirely click-through; the store expires each floater
 * shortly after the tween ends. A small deterministic x-jitter (from the
 * floater id) keeps rapid hits readable instead of stacking exactly.
 */
function FloaterText({
  floater,
  token,
  pxPerFoot,
  gridSizePx,
}: {
  floater: HpFloater;
  token: Token;
  pxPerFoot: number;
  gridSizePx: number;
}) {
  const group = useRef<Konva.Group>(null);
  const radius = (token.widthFt * pxPerFoot) / 2;
  const fontSize = Math.max(16, gridSizePx * 0.5);
  const jitter = ((floater.id % 5) - 2) * radius * 0.25;

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    const tween = new Konva.Tween({
      node,
      y: node.y() - radius * 1.6,
      opacity: 0,
      duration: 0.9,
      easing: Konva.Easings.EaseOut,
    });
    tween.play();
    return () => {
      tween.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heal = floater.delta > 0;
  const text = `${heal ? '+' : '−'}${Math.abs(floater.delta)}`;
  return (
    <Group
      ref={group}
      x={token.x + jitter}
      y={token.y - radius - fontSize * 0.4}
      listening={false}
    >
      <Text
        text={text}
        fontSize={fontSize}
        fontStyle="bold"
        fill={heal ? '#39c46b' : '#e23b3b'}
        stroke="#000"
        strokeWidth={Math.max(1, fontSize * 0.08)}
        shadowColor="#000"
        shadowBlur={4}
        shadowOpacity={0.8}
        align="center"
        width={fontSize * 4}
        offsetX={fontSize * 2}
      />
    </Group>
  );
}

/** All live floaters for the current map, anchored to their creatures' tokens. */
export const HpFxLayer = memo(function HpFxLayer({
  floaters,
  tokens,
  pxPerFoot,
  gridSizePx,
}: {
  floaters: HpFloater[];
  tokens: Token[];
  pxPerFoot: number;
  gridSizePx: number;
}) {
  if (floaters.length === 0) return null;
  return (
    <>
      {floaters.map((f) => {
        const token = tokens.find((t) => t.kind === f.kind && t.refId === f.refId);
        if (!token) return null; // creature isn't on the viewed map
        return (
          <FloaterText
            key={f.id}
            floater={f}
            token={token}
            pxPerFoot={pxPerFoot}
            gridSizePx={gridSizePx}
          />
        );
      })}
    </>
  );
});
