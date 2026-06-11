import { memo, useEffect, useRef } from 'react';
import { Circle, Group, Text } from 'react-konva';
import Konva from 'konva';
import type { Token } from '../../../shared/types';
import type { HpFloater } from '../state/socket';

/**
 * Burst styling per damage type: a brief emoji pop + tinted ring pulse on the
 * struck token (e.g. a flame for fire damage). Physical hits (bludgeoning /
 * piercing / slashing) and untyped damage stay plain — the floating −X is
 * enough there; the burst marks the ELEMENTAL/magical flavor. Heals always get
 * a soft green pulse. Everything is one-shot Konva tweens on non-listening
 * nodes (no idle animation loops), expired with the floater (~1.2 s).
 */
const BURSTS: Record<string, { emoji: string; color: string }> = {
  fire: { emoji: '🔥', color: '#ff8c3b' },
  cold: { emoji: '❄️', color: '#8fd8ff' },
  lightning: { emoji: '⚡', color: '#ffd84d' },
  thunder: { emoji: '💥', color: '#d8c9a8' },
  acid: { emoji: '🧪', color: '#9be04a' },
  poison: { emoji: '☠️', color: '#8bc97f' },
  necrotic: { emoji: '💀', color: '#a98bd4' },
  radiant: { emoji: '✨', color: '#ffe9a0' },
  force: { emoji: '🔮', color: '#b39dff' },
  psychic: { emoji: '🌀', color: '#ff8ad8' },
};
const HEAL_BURST = { emoji: '✨', color: '#39c46b' };

/** The burst style for a floater, or null for plain physical/untyped damage. */
function burstFor(f: HpFloater): { emoji: string; color: string } | null {
  if (f.delta > 0) return HEAL_BURST;
  return BURSTS[f.damageType ?? ''] ?? null;
}

/** One-shot elemental/heal burst: a tinted ring pulse expanding off the token
 *  rim while the type's emoji pops upward and fades. */
function BurstFx({
  floater,
  token,
  pxPerFoot,
  style,
}: {
  floater: HpFloater;
  token: Token;
  pxPerFoot: number;
  style: { emoji: string; color: string };
}) {
  const ring = useRef<Konva.Circle>(null);
  const emoji = useRef<Konva.Text>(null);
  const radius = (token.widthFt * pxPerFoot) / 2;
  // Heals pulse gently; damage bursts read a touch harder.
  const heal = floater.delta > 0;
  const fontSize = Math.max(14, radius * (heal ? 0.7 : 0.95));

  useEffect(() => {
    const tweens: Konva.Tween[] = [];
    if (ring.current) {
      tweens.push(
        new Konva.Tween({
          node: ring.current,
          scaleX: heal ? 1.35 : 1.6,
          scaleY: heal ? 1.35 : 1.6,
          opacity: 0,
          duration: 0.55,
          easing: Konva.Easings.EaseOut,
        }),
      );
    }
    if (emoji.current) {
      tweens.push(
        new Konva.Tween({
          node: emoji.current,
          y: emoji.current.y() - radius * 0.9,
          scaleX: 1.25,
          scaleY: 1.25,
          opacity: 0,
          duration: 0.8,
          easing: Konva.Easings.EaseOut,
        }),
      );
    }
    tweens.forEach((t) => t.play());
    return () => tweens.forEach((t) => t.destroy());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Group x={token.x} y={token.y} listening={false}>
      <Circle
        ref={ring}
        radius={radius}
        stroke={style.color}
        strokeWidth={Math.max(2, radius * 0.12)}
        opacity={heal ? 0.6 : 0.85}
        perfectDrawEnabled={false}
      />
      <Text
        ref={emoji}
        text={style.emoji}
        fontSize={fontSize}
        opacity={0.95}
        width={fontSize * 2}
        align="center"
        offsetX={fontSize}
        offsetY={fontSize * 0.55}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

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
        const burst = burstFor(f);
        return (
          <Group key={f.id} listening={false}>
            {burst && (
              <BurstFx floater={f} token={token} pxPerFoot={pxPerFoot} style={burst} />
            )}
            <FloaterText
              floater={f}
              token={token}
              pxPerFoot={pxPerFoot}
              gridSizePx={gridSizePx}
            />
          </Group>
        );
      })}
    </>
  );
});
