import { memo, useEffect, useMemo, useRef } from 'react';
import { Circle, Group, Line, Text } from 'react-konva';
import Konva from 'konva';
import type { Token } from '../../../shared/types';
import type { HpFloater } from '../state/socket';

/**
 * Transient combat FX over tokens, driven by server 'fx:hp' events:
 *  - floating ±X damage/heal numbers (always),
 *  - typed ELEMENTAL bursts: a tinted ring pulse + the type's emoji + a radial
 *    particle spray in the type's palette (lightning adds a jagged bolt),
 *  - heals: soft green ring + rising sparkles,
 *  - 'death': skull + an expanding smoke puff,
 *  - 'loot': rising gold sparkle over the plundered container.
 * Physical/untyped damage stays plain so the board doesn't get noisy.
 *
 * Performance: everything is one-shot Konva tweens on non-listening,
 * non-perfect-draw nodes — no idle animation loops, no shadows on particles —
 * and every node unmounts with the store's ~1.2 s floater expiry.
 */
const BURSTS: Record<string, { emoji: string; color: string; palette: string[] }> = {
  fire: { emoji: '🔥', color: '#ff8c3b', palette: ['#ff9b3b', '#ffd34d', '#ff5e2f'] },
  cold: { emoji: '❄️', color: '#8fd8ff', palette: ['#bfeaff', '#8fd8ff', '#ffffff'] },
  lightning: { emoji: '⚡', color: '#ffd84d', palette: ['#fff3a0', '#ffd84d', '#ffffff'] },
  thunder: { emoji: '💥', color: '#d8c9a8', palette: ['#d8c9a8', '#bdb39a', '#ffffff'] },
  acid: { emoji: '🧪', color: '#9be04a', palette: ['#9be04a', '#c9f06a', '#6fae2f'] },
  poison: { emoji: '☠️', color: '#8bc97f', palette: ['#8bc97f', '#5a9e57', '#b7e3a8'] },
  necrotic: { emoji: '💀', color: '#a98bd4', palette: ['#a98bd4', '#6e5a91', '#4a3d63'] },
  radiant: { emoji: '✨', color: '#ffe9a0', palette: ['#fff3b0', '#ffe9a0', '#ffffff'] },
  force: { emoji: '🔮', color: '#b39dff', palette: ['#b39dff', '#8f78e0', '#e0d8ff'] },
  psychic: { emoji: '🌀', color: '#ff8ad8', palette: ['#ff8ad8', '#d06ab0', '#ffc1ea'] },
};
const HEAL = { color: '#39c46b', palette: ['#7fe0a0', '#39c46b', '#d6ffe5'] };
const GOLD = { palette: ['#ffd84d', '#ffec9e', '#e0a82e'] };
const SMOKE = ['#8a8a8a', '#666666', '#9a9a9a'];

/** Per-burst random particle specs, computed once so re-renders don't reroll. */
type ParticleSpec = {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  r: number;
  color: string;
  dur: number;
};
function makeSpecs(
  count: number,
  spread: number,
  palette: string[],
  mode: 'radial' | 'rise' | 'smoke',
): ParticleSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.8;
    const dist = spread * (0.6 + Math.random() * 0.9);
    return {
      x0: (Math.random() - 0.5) * spread * 0.4,
      y0: (Math.random() - 0.5) * spread * 0.4,
      dx: mode === 'rise' ? (Math.random() - 0.5) * spread * 0.7 : Math.cos(ang) * dist,
      dy:
        mode === 'rise'
          ? -dist * (0.9 + Math.random() * 0.5)
          : mode === 'smoke'
            ? -dist * 0.35
            : Math.sin(ang) * dist,
      r:
        mode === 'smoke'
          ? spread * (0.28 + Math.random() * 0.22)
          : spread * (0.07 + Math.random() * 0.07),
      color: palette[i % palette.length],
      dur: (mode === 'smoke' ? 0.9 : 0.55) + Math.random() * 0.3,
    };
  });
}

/** A one-shot particle spray: radial sparks, rising sparkles, or a smoke puff
 *  (smoke grows + drifts up instead of shrinking). */
function Particles({
  cx,
  cy,
  spread,
  palette,
  count,
  mode,
}: {
  cx: number;
  cy: number;
  spread: number;
  palette: string[];
  count: number;
  mode: 'radial' | 'rise' | 'smoke';
}) {
  const specs = useMemo(() => makeSpecs(count, spread, palette, mode), [count, spread, palette, mode]);
  const refs = useRef<(Konva.Circle | null)[]>([]);

  useEffect(() => {
    const tweens = refs.current
      .map((node, i) => {
        if (!node) return null;
        const s = specs[i];
        return new Konva.Tween({
          node,
          x: node.x() + s.dx,
          y: node.y() + s.dy,
          opacity: 0,
          scaleX: mode === 'smoke' ? 2.2 : 0.3,
          scaleY: mode === 'smoke' ? 2.2 : 0.3,
          duration: s.dur,
          easing: Konva.Easings.EaseOut,
        });
      })
      .filter((t): t is Konva.Tween => !!t);
    tweens.forEach((t) => t.play());
    return () => tweens.forEach((t) => t.destroy());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {specs.map((s, i) => (
        <Circle
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          x={cx + s.x0}
          y={cy + s.y0}
          radius={s.r}
          fill={s.color}
          opacity={mode === 'smoke' ? 0.45 : 0.95}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </>
  );
}

/** A jagged lightning bolt striking down onto the token — two flash-out lines
 *  (a white core over a gold glow). */
function LightningBolt({ cx, cy, radius }: { cx: number; cy: number; radius: number }) {
  const group = useRef<Konva.Group>(null);
  // Zigzag from above the token down to its center, jagging left/right.
  const points = useMemo(() => {
    const pts: number[] = [];
    const top = -radius * 2.6;
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const y = top + (0 - top) * (i / steps);
      const x = i === steps ? 0 : (Math.random() - 0.5) * radius * 0.9;
      pts.push(x, y);
    }
    return pts;
  }, [radius]);

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    const tween = new Konva.Tween({
      node,
      opacity: 0,
      duration: 0.35,
      easing: Konva.Easings.EaseIn,
    });
    tween.play();
    return () => tween.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Group ref={group} x={cx} y={cy} listening={false}>
      <Line
        points={points}
        stroke="#ffd84d"
        strokeWidth={Math.max(3, radius * 0.22)}
        lineCap="round"
        lineJoin="round"
        opacity={0.7}
        perfectDrawEnabled={false}
      />
      <Line
        points={points}
        stroke="#ffffff"
        strokeWidth={Math.max(1.5, radius * 0.09)}
        lineCap="round"
        lineJoin="round"
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

/** Expanding tinted ring pulse off the token rim. */
function RingPulse({
  cx,
  cy,
  radius,
  color,
  soft,
}: {
  cx: number;
  cy: number;
  radius: number;
  color: string;
  soft?: boolean;
}) {
  const ring = useRef<Konva.Circle>(null);
  useEffect(() => {
    const node = ring.current;
    if (!node) return;
    const tween = new Konva.Tween({
      node,
      scaleX: soft ? 1.35 : 1.6,
      scaleY: soft ? 1.35 : 1.6,
      opacity: 0,
      duration: 0.55,
      easing: Konva.Easings.EaseOut,
    });
    tween.play();
    return () => tween.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Circle
      ref={ring}
      x={cx}
      y={cy}
      radius={radius}
      stroke={color}
      strokeWidth={Math.max(2, radius * 0.12)}
      opacity={soft ? 0.6 : 0.85}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

/** A glyph that pops up and fades (the burst's emoji, the death skull…). */
function GlyphPop({
  cx,
  cy,
  text,
  fontSize,
  rise,
  duration = 0.8,
}: {
  cx: number;
  cy: number;
  text: string;
  fontSize: number;
  rise: number;
  duration?: number;
}) {
  const glyph = useRef<Konva.Text>(null);
  useEffect(() => {
    const node = glyph.current;
    if (!node) return;
    const tween = new Konva.Tween({
      node,
      y: node.y() - rise,
      scaleX: 1.25,
      scaleY: 1.25,
      opacity: 0,
      duration,
      easing: Konva.Easings.EaseOut,
    });
    tween.play();
    return () => tween.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Text
      ref={glyph}
      x={cx}
      y={cy}
      text={text}
      fontSize={fontSize}
      opacity={0.95}
      width={fontSize * 2}
      align="center"
      offsetX={fontSize}
      offsetY={fontSize * 0.55}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

/** The composed burst for one floater (or null when it should stay plain). */
function BurstFx({
  floater,
  token,
  pxPerFoot,
}: {
  floater: HpFloater;
  token: Token;
  pxPerFoot: number;
}) {
  const radius = (token.widthFt * pxPerFoot) / 2;
  const { x: cx, y: cy } = token;

  if (floater.effect === 'loot') {
    return (
      <>
        <Particles cx={cx} cy={cy} spread={radius * 1.1} palette={GOLD.palette} count={9} mode="rise" />
        <GlyphPop cx={cx} cy={cy} text="💰" fontSize={Math.max(14, radius * 0.8)} rise={radius} duration={0.9} />
      </>
    );
  }

  const heal = floater.delta > 0;
  if (heal) {
    return (
      <>
        <RingPulse cx={cx} cy={cy} radius={radius} color={HEAL.color} soft />
        <Particles cx={cx} cy={cy} spread={radius} palette={HEAL.palette} count={6} mode="rise" />
      </>
    );
  }

  const style = BURSTS[floater.damageType ?? ''];
  const death = floater.effect === 'death';
  if (!style && !death) return null; // plain physical/untyped damage

  return (
    <>
      {style && (
        <>
          <RingPulse cx={cx} cy={cy} radius={radius} color={style.color} />
          <Particles cx={cx} cy={cy} spread={radius * 1.3} palette={style.palette} count={8} mode="radial" />
          {floater.damageType === 'lightning' ? (
            <LightningBolt cx={cx} cy={cy} radius={radius} />
          ) : (
            <GlyphPop
              cx={cx}
              cy={cy}
              text={style.emoji}
              fontSize={Math.max(14, radius * 0.95)}
              rise={radius * 0.9}
            />
          )}
        </>
      )}
      {death && (
        <>
          <Particles cx={cx} cy={cy} spread={radius * 1.2} palette={SMOKE} count={5} mode="smoke" />
          <GlyphPop
            cx={cx}
            cy={cy}
            text="💀"
            fontSize={Math.max(16, radius * 1.05)}
            rise={radius * 0.7}
            duration={1.0}
          />
        </>
      )}
    </>
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
        return (
          <Group key={f.id} listening={false}>
            <BurstFx floater={f} token={token} pxPerFoot={pxPerFoot} />
            {/* A pure-effect event (loot sparkle) has no number to float. */}
            {f.delta !== 0 && (
              <FloaterText
                floater={f}
                token={token}
                pxPerFoot={pxPerFoot}
                gridSizePx={gridSizePx}
              />
            )}
          </Group>
        );
      })}
    </>
  );
});
