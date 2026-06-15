import { memo, useLayoutEffect, useRef, useState } from 'react';
import { Group, Rect, Line, Text } from 'react-konva';
import Konva from 'konva';
import type { Token } from '../../../shared/types';

/**
 * Chat bubbles floating over a PC token: a "•••" indicator while that player is
 * typing (server `fx:typing`) and their words when they send (server `fx:say`,
 * which also clears the typing bubble). Both are transient store state that
 * auto-expires, so this layer just renders whatever's live. Click-through and
 * declarative — there's never more than a handful of these at once.
 */
const MAX_W = 200;
const PAD_X = 8;
const PAD_Y = 5;
const TAIL = 8;
const BG = 'rgba(18,20,26,0.92)';

/** One bubble; measures its (wrapped) text after layout so the rounded
 *  background + downward tail fit snugly and centre over the token. */
const Bubble = memo(function Bubble({
  x,
  yTop,
  text,
  fontSize,
  typing,
}: {
  x: number;
  yTop: number;
  text: string;
  fontSize: number;
  typing: boolean;
}) {
  const textRef = useRef<Konva.Text>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;
    node.setAttr('width', undefined); // reset to auto → natural single-line width
    const w = Math.min(node.getTextWidth(), MAX_W);
    node.width(w); // apply (wraps if it was wider than MAX_W)
    setDims({ w, h: node.height() });
  }, [text, fontSize]);

  const bw = dims.w + PAD_X * 2;
  const bh = dims.h + PAD_Y * 2;
  const left = x - bw / 2;
  const top = yTop - TAIL - bh; // tail tip lands on (x, yTop)
  const stroke = typing ? '#9aa0a6' : '#ffd21a';
  return (
    <Group listening={false}>
      {dims.w > 0 && (
        <>
          <Rect
            x={left}
            y={top}
            width={bw}
            height={bh}
            cornerRadius={6}
            fill={BG}
            stroke={stroke}
            strokeWidth={1}
            shadowColor="#000"
            shadowBlur={4}
            shadowOpacity={0.6}
          />
          <Line
            points={[x - TAIL * 0.7, top + bh - 0.5, x + TAIL * 0.7, top + bh - 0.5, x, top + bh + TAIL]}
            closed
            fill={BG}
            stroke={stroke}
            strokeWidth={1}
          />
        </>
      )}
      <Text
        ref={textRef}
        x={left + PAD_X}
        y={top + PAD_Y}
        text={text}
        fontSize={fontSize}
        fontStyle={typing ? 'bold' : 'normal'}
        fill={typing ? '#cfd3d8' : '#f2f2f2'}
        align="center"
        lineHeight={1.15}
      />
    </Group>
  );
});

export const SpeechBubbles = memo(function SpeechBubbles({
  typingChars,
  sayBubbles,
  tokens,
  pxPerFoot,
  gridSizePx,
}: {
  typingChars: Record<string, true>;
  sayBubbles: Record<string, { text: string; id: number }>;
  tokens: Token[];
  pxPerFoot: number;
  gridSizePx: number;
}) {
  const fontSize = Math.max(12, gridSizePx * 0.26);
  // Say bubbles win over typing for the same character (the store already
  // clears typing on say, but guard against an out-of-order render).
  const entries: { refId: string; text: string; typing: boolean }[] = [];
  for (const refId of Object.keys(sayBubbles))
    entries.push({ refId, text: sayBubbles[refId].text, typing: false });
  for (const refId of Object.keys(typingChars))
    if (!(refId in sayBubbles)) entries.push({ refId, text: '• • •', typing: true });
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map((e) => {
        // PC chat bubbles AND AI creature-dialogue bubbles both key on the
        // token's refId; match any token kind (refIds are unique per entity).
        const tok = tokens.find((t) => t.refId === e.refId);
        if (!tok) return null; // entity not on the viewer's map
        const radius = (tok.widthFt * pxPerFoot) / 2;
        return (
          <Bubble
            key={e.refId}
            x={tok.x}
            yTop={tok.y - radius - 2}
            text={e.text}
            fontSize={fontSize}
            typing={e.typing}
          />
        );
      })}
    </>
  );
});
