import { memo, useEffect, useRef } from 'react';
import {
  Group,
  Circle,
  Rect,
  RegularPolygon,
  Line,
  Text,
  Image as KonvaImage,
} from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import type { Token } from '../../../shared/types';
import { COMBAT_ROLE_ICON } from '../../../shared/combatRole';
import { presentAuras, AURA_HEX } from '../lib/conditions';
import { sameTokenDisplay, sameTokenFields, type TokenDisplay } from '../lib/entities';
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
  /** Throttled live drag position, broadcast so others see a ghost tether. */
  onDragPreview?: (token: Token, x: number, y: number) => void;
};

const isAdditive = (e: KonvaEventObject<Event>): boolean => {
  const evt = e.evt as MouseEvent;
  return !!(evt.shiftKey || evt.ctrlKey || evt.metaKey);
};

function TokenShapeInner({
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
  onDragPreview,
}: Props) {
  // Real-world footprint: width in feet → pixels. Independent of the visual grid,
  // so changing only the grid cell size never rescales a token.
  const radius = (token.widthFt * pxPerFoot) / 2;
  // Feet per map-pixel (the inverse of the token-sizing scale) — turns a drag's
  // pixel delta into a real-world distance for the live readout.
  const feetPerPixel = pxPerFoot > 0 ? 1 / pxPerFoot : 0;
  const auras = presentAuras(display.conditions);
  const fill = token.kind === 'pc' ? '#2d6cdf' : '#b1432f';
  const hasImageIcon = !!display.icon && isImageIcon(display.icon);
  const hasEmojiIcon = !!display.icon && !hasImageIcon;
  const iconImg = useImage(hasImageIcon ? display.icon : null);
  const hpFrac =
    display.maxHp && display.maxHp > 0 && display.curHp !== undefined
      ? Math.max(0, Math.min(1, display.curHp / display.maxHp))
      : null;
  // Dead = 0 HP where the viewer can see HP, the server-computed `dead` flag on a
  // public (HP-hidden) enemy, or the DM's manual "Dead" condition.
  const isDead =
    (display.curHp !== undefined && display.curHp <= 0) ||
    ('dead' in display && display.dead === true) ||
    display.conditions.some((c) => c.label.toLowerCase() === 'dead');

  // Live "distance from the previous spot" readout while dragging: a dashed
  // tether from the start position to the token + a "N ft" pill, updated
  // imperatively (refs + batchDraw) so the drag never triggers a React render —
  // a mid-drag re-render would re-apply token.x/y and snap the node back. The
  // origin is the committed token.x/token.y (frozen during the drag).
  const dragOverlay = useRef<Konva.Group>(null);
  const tether = useRef<Konva.Line>(null);
  const distText = useRef<Konva.Text>(null);
  // Throttle the network preview (the local tether stays smooth either way).
  const lastDragEmit = useRef(0);

  const paintDrag = (cx: number, cy: number) => {
    tether.current?.points([token.x, token.y, cx, cy]);
    if (distText.current) {
      const ft = feetPerPixel > 0
        ? Math.round(Math.hypot(cx - token.x, cy - token.y) * feetPerPixel)
        : 0;
      distText.current.text(`${ft} ft`);
      // Ride the MIDDLE of the tether (lifted just clear of the dashes), so the
      // number reads as part of the line rather than crowding the token.
      distText.current.position({
        x: (token.x + cx) / 2,
        y: (token.y + cy) / 2 - distText.current.fontSize() * 0.9,
      });
    }
    dragOverlay.current?.getLayer()?.batchDraw();
  };

  const handleDragStart = () => {
    clearLongPress();
    onDragActive?.(true);
    lastDragEmit.current = 0; // let the first move broadcast immediately
    const ov = dragOverlay.current;
    if (ov) {
      ov.visible(true);
      ov.moveToTop(); // keep the tether + label above other tokens
    }
    paintDrag(token.x, token.y);
  };

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    const cx = e.target.x();
    const cy = e.target.y();
    paintDrag(cx, cy);
    // Broadcast the live position (throttled ~18 fps) for everyone else's ghost.
    if (onDragPreview) {
      const now = performance.now();
      if (now - lastDragEmit.current >= 55) {
        lastDragEmit.current = now;
        onDragPreview(token, cx, cy);
      }
    }
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    dragOverlay.current?.visible(false); // temporary — gone on release
    onDragActive?.(false);
    onMove(token, e.target.x(), e.target.y());
  };

  // Long-press (touch) mirrors right-click to open the floating menu. We keep a
  // small movement tolerance so finger jitter doesn't cancel a deliberate hold
  // (the earlier "any touchmove cancels" version rarely fired on real devices).
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const menuOpened = useRef(false); // long-press fired this touch → swallow the tap
  // Manual double-tap detection: Konva's synthesized `dbltap` is unreliable next
  // to these long-press handlers, so we track the previous touch ourselves and
  // de-dupe against `dbltap` in case it DOES fire for the same gesture.
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastActivate = useRef(0);
  const activate = () => {
    if (Date.now() - lastActivate.current < 600) return; // already fired
    lastActivate.current = Date.now();
    onActivate?.(token);
  };
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
    const t = e.evt.touches[0];
    if (!t) return;
    const { clientX, clientY } = t;
    // Two quick nearby touches = a double-tap → activate (select + open the
    // details/right panel) instead of arming another long-press.
    const prev = lastTap.current;
    lastTap.current = { t: Date.now(), x: clientX, y: clientY };
    if (
      prev &&
      Date.now() - prev.t < 350 &&
      Math.hypot(clientX - prev.x, clientY - prev.y) < 30
    ) {
      clearLongPress();
      lastTap.current = null;
      activate();
      return;
    }
    if (!onContextMenu) return;
    clearLongPress();
    menuOpened.current = false;
    touchStart.current = { x: clientX, y: clientY };
    longPress.current = setTimeout(() => {
      menuOpened.current = true; // opened by hold — the release tap must not act
      openMenu(clientX, clientY);
    }, 500);
  };

  // On lift: if the hold opened the menu, swallow the synthesized tap/click so
  // the token doesn't re-select (and the menu's open-grace keeps it visible).
  const handleTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
    if (menuOpened.current) {
      e.evt.preventDefault();
      e.cancelBubble = true;
      menuOpened.current = false;
    }
    clearLongPress();
  };

  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches[0];
    const start = touchStart.current;
    if (!t || !start) return;
    // Cancel only once the finger has clearly moved (a real drag), not on jitter.
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) {
      clearLongPress();
      lastTap.current = null; // a drag is not the first tap of a double-tap
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

  // Silhouette by token shape. `image` draws the icon unclipped (pasted art);
  // the others fill/stroke a shape and clip image icons to it.
  const shape = token.shape ?? 'circle';
  const strokeColor = selected ? '#ffffff' : '#1118';
  const strokeW = selected ? 4 : 2;
  // Clip path for an image icon, matched to the silhouette.
  const clip = (ctx: Konva.Context) => {
    const r = radius;
    if (shape === 'square') ctx.rect(-r, -r, r * 2, r * 2);
    else if (shape === 'diamond') {
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
    } else if (shape === 'triangle') {
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.87, r * 0.5); ctx.lineTo(-r * 0.87, r * 0.5); ctx.closePath();
    } else ctx.arc(0, 0, r, 0, Math.PI * 2, false);
  };
  // The solid silhouette node (fill + stroke) for non-image tokens / outlines.
  const Silhouette = (props: { fill?: string; opacity?: number; outlineOnly?: boolean }) => {
    const p = {
      fill: props.outlineOnly ? undefined : props.fill,
      stroke: strokeColor,
      strokeWidth: strokeW,
      opacity: props.opacity,
    };
    if (shape === 'square')
      return <Rect x={-radius} y={-radius} width={radius * 2} height={radius * 2} {...p} />;
    if (shape === 'diamond')
      return <RegularPolygon sides={4} radius={radius * 1.3} {...p} />;
    if (shape === 'triangle')
      return (
        <Line
          closed
          points={[0, -radius, radius * 0.87, radius * 0.5, -radius * 0.87, radius * 0.5]}
          {...p}
        />
      );
    return <Circle radius={radius} {...p} />;
  };

  return (
    <>
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
      onTap={(e) => {
        if (menuOpened.current) return; // hold-opened the menu; don't re-select
        onSelect(token, isAdditive(e));
      }}
      onDblClick={(e) => {
        if ((e.evt as MouseEvent).button !== 0) return;
        activate();
      }}
      onDblTap={() => activate()}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
        shape === 'image' ? (
          // Pasted art: draw the whole image as-is (no clip), with an outline
          // only when selected so it doesn't get a permanent box.
          <>
            <KonvaImage
              image={iconImg}
              x={-radius}
              y={-radius}
              width={radius * 2}
              height={radius * 2}
              opacity={isDead ? 0.5 : 1}
            />
            {selected && (
              <Rect
                x={-radius}
                y={-radius}
                width={radius * 2}
                height={radius * 2}
                stroke="#ffffff"
                strokeWidth={3}
              />
            )}
          </>
        ) : (
          <>
            <Group opacity={isDead ? 0.5 : 1} clipFunc={clip}>
              <KonvaImage
                image={iconImg}
                x={-radius}
                y={-radius}
                width={radius * 2}
                height={radius * 2}
              />
            </Group>
            <Silhouette outlineOnly />
          </>
        )
      ) : (
        <>
          <Silhouette fill={fill} opacity={isDead ? 0.5 : 1} />
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
      {/* Death marker when downed (visible HP at 0, or a manual "Dead" mark). */}
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
    {/* Drag-distance readout (only on draggable tokens; hidden until a drag
        starts, then driven imperatively in paintDrag — never re-renders). A
        dashed tether from the previous spot to the token + a "N ft" pill that
        rides above it, all cleared on release. */}
    {draggable && (
      <Group ref={dragOverlay} visible={false} listening={false}>
        <Line
          ref={tether}
          points={[token.x, token.y, token.x, token.y]}
          stroke="#ffd21a"
          strokeWidth={2}
          dash={[9, 6]}
          opacity={0.95}
          shadowColor="#000"
          shadowBlur={3}
          shadowOpacity={0.6}
        />
        <Circle
          x={token.x}
          y={token.y}
          radius={4}
          fill="#ffd21a"
          stroke="#000"
          strokeWidth={1}
        />
        <Text
          ref={distText}
          text=""
          fontSize={Math.max(13, gridSizePx * 0.34)}
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
    )}
    </>
  );
}

// Snapshots rebuild every token/display object on each broadcast, so compare by
// content (the fields actually rendered) instead of identity — together with
// MapStage's identity-stable handlers this skips re-rendering unchanged tokens.
export const TokenShape = memo(
  TokenShapeInner,
  (p, n) =>
    sameTokenFields(p.token, n.token) &&
    sameTokenDisplay(p.display, n.display) &&
    p.gridSizePx === n.gridSizePx &&
    p.pxPerFoot === n.pxPerFoot &&
    p.draggable === n.draggable &&
    p.selected === n.selected &&
    p.activeTurn === n.activeTurn &&
    p.initiativeRank === n.initiativeRank &&
    p.listening === n.listening &&
    p.onSelect === n.onSelect &&
    p.onActivate === n.onActivate &&
    p.onMove === n.onMove &&
    p.onContextMenu === n.onContextMenu &&
    p.onHover === n.onHover &&
    p.onHoverEnd === n.onHoverEnd &&
    p.onDragActive === n.onDragActive &&
    p.onDragPreview === n.onDragPreview,
);
