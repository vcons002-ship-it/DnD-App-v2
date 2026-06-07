import { useEffect, useRef } from 'react';
import { Group, Circle, Rect, Text, Image as KonvaImage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import type { Token } from '../../../shared/types';
import { COMBAT_ROLE_ICON } from '../../../shared/combatRole';
import { presentAuras, AURA_HEX } from '../lib/conditions';
import type { TokenDisplay } from '../lib/entities';
import { useImage } from './useImage';

const isImageIcon = (icon: string): boolean =>
  icon.startsWith('/') || icon.startsWith('http');

/** Battlefield disposition dot colours. */
const DISPOSITION_HEX: Record<string, string> = {
  friendly: '#39c46b',
  neutral: '#f5c518',
  enemy: '#e23b3b',
};

type Props = {
  token: Token;
  display: TokenDisplay;
  gridSizePx: number;
  /** Pixels per foot (from the map scale) — sizes the token by its real width. */
  pxPerFoot: number;
  draggable: boolean;
  selected: boolean;
  activeTurn: boolean;
  /** 1-based position in initiative order (not the raw roll), or null. */
  initiativeRank: number | null;
  /** When false (e.g. a measure tool is active), the token ignores all pointer
   *  events so clicks/drags fall through to the stage. */
  listening?: boolean;
  onSelect: (token: Token, additive: boolean) => void;
  /** Double-click / double-tap — select + expand the player's details panel. */
  onActivate?: (token: Token) => void;
  onMove: (token: Token, x: number, y: number) => void;
  /** Right-click / long-press — opens the floating action menu at screen coords. */
  onContextMenu?: (token: Token, clientX: number, clientY: number) => void;
  /** Pointer hover over the token (desktop) — drives the hover card. */
  onHover?: (token: Token, clientX: number, clientY: number) => void;
  onHoverEnd?: (token: Token) => void;
  /** Signals drag start/stop so the map can brighten the grid while a token moves. */
  onDragActive?: (active: boolean) => void;
};

const isAdditive = (e: KonvaEventObject<Event>): boolean => {
  const evt = e.evt as MouseEvent;
  return !!(evt.shiftKey || evt.ctrlKey || evt.metaKey);
};

export function TokenShape({
  token,
  display,
  gridSizePx,
  pxPerFoot,
  draggable,
  selected,
  activeTurn,
  initiativeRank,
  listening = true,
  onSelect,
  onActivate,
  onMove,
  onContextMenu,
  onHover,
  onHoverEnd,
  onDragActive,
}: Props) {
  // Real-world footprint: width in feet → pixels. Independent of the visual grid,
  // so changing only the grid cell size never rescales a token.
  const radius = (token.widthFt * pxPerFoot) / 2;
  const auras = presentAuras(display.conditions);
  const fill = token.kind === 'pc' ? '#2d6cdf' : '#b1432f';
  const hasImageIcon = !!display.icon && isImageIcon(display.icon);
  const hasEmojiIcon = !!display.icon && !hasImageIcon;
  const iconImg = useImage(hasImageIcon ? display.icon : null);
  const hpFrac =
    display.maxHp && display.maxHp > 0 && display.curHp !== undefined
      ? Math.max(0, Math.min(1, display.curHp / display.maxHp))
      : null;
  const isDead = display.curHp !== undefined && display.curHp <= 0;

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    onDragActive?.(false);
    onMove(token, e.target.x(), e.target.y());
  };

  // Long-press (touch) mirrors right-click to open the floating menu. We keep a
  // small movement tolerance so finger jitter doesn't cancel a deliberate hold
  // (the earlier "any touchmove cancels" version rarely fired on real devices).
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const clearLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
    touchStart.current = null;
  };
  const openMenu = (clientX: number, clientY: number) =>
    onContextMenu?.(token, clientX, clientY);

  const handleContextMenu = (e: KonvaEventObject<PointerEvent>) => {
    if (!onContextMenu) return;
    e.evt.preventDefault();
    e.cancelBubble = true;
    openMenu(e.evt.clientX, e.evt.clientY);
  };

  const handleTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    if (!onContextMenu) return;
    const t = e.evt.touches[0];
    if (!t) return;
    const { clientX, clientY } = t;
    clearLongPress();
    touchStart.current = { x: clientX, y: clientY };
    longPress.current = setTimeout(() => openMenu(clientX, clientY), 500);
  };

  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches[0];
    const start = touchStart.current;
    if (!t || !start) return;
    // Cancel only once the finger has clearly moved (a real drag), not on jitter.
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) {
      clearLongPress();
    }
  };

  const handleMouseOver = (e: KonvaEventObject<MouseEvent>) =>
    onHover?.(token, e.evt.clientX, e.evt.clientY);
  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) =>
    onHover?.(token, e.evt.clientX, e.evt.clientY);
  const handleMouseOut = () => onHoverEnd?.(token);

  // Pulse the active-turn ring so whose turn it is reads at a glance.
  const turnRingR = radius + 9 + auras.length * 5;
  const turnRing = useRef<Konva.Circle>(null);
  useEffect(() => {
    const node = turnRing.current;
    if (!activeTurn || !node) return;
    const anim = new Konva.Animation((frame) => {
      if (!frame) return;
      const t = (Math.sin(frame.time / 280) + 1) / 2; // 0..1 ease
      node.radius(turnRingR + t * 6);
      node.strokeWidth(5 + t * 4);
      node.opacity(0.65 + t * 0.35);
    }, node.getLayer());
    anim.start();
    return () => {
      anim.stop();
    };
  }, [activeTurn, turnRingR]);

  const roleBadgeR = Math.max(11, radius * 0.36);

  return (
    <Group
      name="token"
      x={token.x}
      y={token.y}
      listening={listening}
      draggable={draggable}
      // Konva synthesizes a `click` for the right mouse button too (unlike the
      // DOM); ignore non-primary buttons so a right-click only opens the menu
      // and never changes selection (keeps the selected attacker intact).
      onClick={(e) => {
        if ((e.evt as MouseEvent).button !== 0) return;
        onSelect(token, isAdditive(e));
      }}
      onTap={(e) => onSelect(token, isAdditive(e))}
      onDblClick={(e) => {
        if ((e.evt as MouseEvent).button !== 0) return;
        onActivate?.(token);
      }}
      onDblTap={() => onActivate?.(token)}
      onDragStart={() => {
        clearLongPress();
        onDragActive?.(true);
      }}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={handleTouchMove}
      onMouseOver={handleMouseOver}
      onMouseMove={handleMouseMove}
      onMouseOut={handleMouseOut}
      opacity={token.isHidden ? 0.45 : 1}
    >
      {/* Concentric status rings: red (negative), green (buff), blue (concentration). */}
      {auras.map((a, i) => (
        <Circle
          key={a}
          radius={radius + 5 + i * 5}
          stroke={AURA_HEX[a]}
          strokeWidth={4}
        />
      ))}
      {activeTurn && (
        <Circle
          ref={turnRing}
          radius={turnRingR}
          stroke="#ffd21a"
          strokeWidth={5}
          shadowColor="#ffd21a"
          shadowBlur={16}
          shadowOpacity={0.95}
        />
      )}
      {hasImageIcon && iconImg ? (
        <>
          <Group
            opacity={isDead ? 0.5 : 1}
            clipFunc={(ctx: Konva.Context) => {
              ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
            }}
          >
            <KonvaImage
              image={iconImg}
              x={-radius}
              y={-radius}
              width={radius * 2}
              height={radius * 2}
            />
          </Group>
          <Circle
            radius={radius}
            stroke={selected ? '#ffffff' : '#1118'}
            strokeWidth={selected ? 4 : 2}
          />
        </>
      ) : (
        <>
          <Circle
            radius={radius}
            fill={fill}
            stroke={selected ? '#ffffff' : '#1118'}
            strokeWidth={selected ? 4 : 2}
            opacity={isDead ? 0.5 : 1}
          />
          {hasEmojiIcon && !isDead && (
            <Text
              text={display.icon}
              fontSize={radius * 1.1}
              width={radius * 2}
              height={radius * 2}
              offsetX={radius}
              offsetY={radius}
              align="center"
              verticalAlign="middle"
            />
          )}
        </>
      )}
      {/* Death marker when downed (only where HP is visible to this viewer). */}
      {isDead && (
        <Text
          text="💀"
          fontSize={radius * 1.4}
          width={radius * 2}
          height={radius * 2}
          offsetX={radius}
          offsetY={radius}
          align="center"
          verticalAlign="middle"
        />
      )}
      <Text
        text={display.name}
        fontSize={Math.max(11, gridSizePx * 0.28)}
        fill="#fff"
        align="center"
        width={radius * 4}
        offsetX={radius * 2}
        // PC names sit a little higher to make room for the crown above the rim.
        y={-radius - (token.kind === 'pc' ? 34 : 18)}
      />
      {/* HP bar (only when HP is visible to this viewer). */}
      {hpFrac !== null && (
        <Group y={radius + 4} offsetX={radius}>
          <Rect width={radius * 2} height={6} fill="#0008" cornerRadius={3} />
          <Rect
            width={radius * 2 * hpFrac}
            height={6}
            fill={hpFrac > 0.5 ? '#39c46b' : hpFrac > 0.25 ? '#f5c518' : '#e23b3b'}
            cornerRadius={3}
          />
          {/* Temporary HP — a single flat buffer pool (no max), so it shows as a
              "+N" to the right of the bar rather than a second bar. */}
          {!!display.tempHp && display.tempHp > 0 && (
            <Text
              text={`+${display.tempHp}`}
              fontSize={Math.max(10, radius * 0.4)}
              fontStyle="bold"
              fill="#5ce1ff"
              x={radius * 2 + 3}
              y={-1}
            />
          )}
        </Group>
      )}
      {/* Disposition dot (top-left): green friendly · amber neutral · red enemy. */}
      {display.disposition && (
        <Circle
          x={-radius * 0.8}
          y={-radius * 0.8}
          radius={Math.max(5, radius * 0.16)}
          fill={DISPOSITION_HEX[display.disposition]}
          stroke="#000"
          strokeWidth={1}
        />
      )}
      {/* Combat-role badge (bottom-left corner): ⚔️ melee · 🏹 ranged · ✨ caster.
          A solid dark disc behind the emoji keeps it legible over any token art. */}
      {token.combatRole && (
        <Group x={-radius * 0.72} y={radius * 0.72}>
          <Circle
            radius={roleBadgeR}
            fill="#0b0d12"
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          <Text
            text={COMBAT_ROLE_ICON[token.combatRole]}
            fontSize={roleBadgeR * 1.3}
            width={roleBadgeR * 2}
            height={roleBadgeR * 2}
            offsetX={roleBadgeR}
            offsetY={roleBadgeR}
            align="center"
            verticalAlign="middle"
          />
        </Group>
      )}
      {initiativeRank !== null && (
        <Group x={radius * 0.8} y={-radius * 0.8}>
          <Circle radius={11} fill="#f5c518" stroke="#000" strokeWidth={1} />
          <Text
            text={String(initiativeRank)}
            fontSize={13}
            fill="#000"
            width={22}
            offsetX={11}
            offsetY={6}
            align="center"
          />
        </Group>
      )}
      {/* Player-character tokens wear a crown just above the rim (with the name
          lifted above it) so the party stands out from creatures without the old
          halo crowding the status rings. */}
      {token.kind === 'pc' &&
        (() => {
          const crown = Math.min(22, Math.max(14, radius * 0.6));
          return (
            <Text
              text="👑"
              fontSize={crown}
              width={radius * 2}
              offsetX={radius}
              offsetY={crown / 2}
              y={-radius - crown / 2 - 2}
              align="center"
              verticalAlign="middle"
            />
          );
        })()}
    </Group>
  );
}
