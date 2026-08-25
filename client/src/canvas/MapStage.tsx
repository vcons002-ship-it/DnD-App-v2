import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Image as KonvaImage, Line, Rect, Shape, Circle, Text, Label, Tag } from 'react-konva';
import { rollerColor } from '../lib/rollStyle';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { FogLayer, Measurement, StateSnapshot, Token } from '../../../shared/types';
import { useImage } from './useImage';
import { TokenShape } from './TokenShape';
import { HpFxLayer } from './HpFx';
import { DragGhostLayer } from './DragGhostLayer';
import { SpeechBubbles } from './SpeechBubbles';
import { CursorPointers } from './CursorPointers';
import { FootprintLayer } from './FootprintTrails';
import { resolveToken } from '../lib/entities';
import { safeSetItem } from '../lib/storage';
import { cropImage, removeBackground } from '../lib/imageEdit';
import { useComfyAvailable, comfyGenerate } from '../lib/comfy';
import { useStableCallback } from '../lib/useStableCallback';
import { useStore } from '../state/socket';
import { FloatingMenu } from '../components/FloatingMenu';
import { MeasureMenu } from '../components/MeasureMenu';
import { FogMenu } from '../components/FogMenu';
import { ScaleMenu } from '../components/ScaleMenu';
import { TilesMenu } from '../components/TilesMenu';
import { TokenHoverCard } from '../components/TokenHoverCard';
import { DecalPopup } from '../components/DecalPopup';
import { RollLogOverlay } from '../components/RollLogOverlay';
import { DiceButtonOverlay } from '../components/DiceButtonOverlay';
import { DamagePrompt } from '../components/DamagePrompt';

type Props = {
  snapshot: StateSnapshot;
  draggableTokens: boolean;
  selectedIds: string[];
  activeTurnTokenId: string | null;
  onSelectToken: (token: Token | null, additive?: boolean) => void;
  onMoveToken: (tokenId: string, x: number, y: number) => void;
  /** When set (DM placing a unit), a map click reports image-space coords. */
  onPlaceAt?: (x: number, y: number) => void;
};

type View = { scale: number; x: number; y: number };
type Pt = { x: number; y: number };

/**
 * Who the floating menu attacks `target` as. The DM uses the selected token.
 * A player defaults to their own claimed PC, unless they've selected a friendly
 * creature (e.g. a companion/summon) — then that creature attacks. Never the
 * target itself.
 */
function floatingAttacker(
  snapshot: StateSnapshot,
  selectedIds: string[],
  target: Token,
  isDm: boolean,
  mySocketId: string | undefined,
): Token | null {
  const selected = snapshot.tokens.filter(
    (t) => selectedIds.includes(t.id) && t.id !== target.id,
  );
  if (isDm) return selected[0] ?? null;
  const friendly = selected.find(
    (t) =>
      t.kind === 'monster' &&
      snapshot.monsters.find((m) => m.id === t.refId)?.disposition === 'friendly',
  );
  if (friendly) return friendly;
  const myChar = snapshot.characters.find((c) => c.claimedBy === mySocketId);
  const myToken = myChar
    ? snapshot.tokens.find((t) => t.kind === 'pc' && t.refId === myChar.id)
    : undefined;
  return myToken && myToken.id !== target.id ? myToken : null;
}

/** Shapes offered by the Measure menu (Line custom → a thin "ruler"). */
export type MeasureShapeKind = 'circle' | 'cone' | 'line' | 'square' | 'emanation';
export type MeasureSize = 'custom' | 'small' | 'large';
export type MeasureTool = { shape: MeasureShapeKind; size: MeasureSize };
type DraftMeasure = {
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

/** The off-map backdrop colour. MUST match `.center` in styles.css so covered
 *  map-fog cells blend seamlessly into the empty space beyond the map. */
const CANVAS_BG = '#0e0f12';

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** A single measuring shape drawn in image-space, plus a distance label in feet.
 *  Non-listening by default so it never blocks tokens; in remove mode `onRemove`
 *  makes it clickable. `emanation` is rendered by the caller as a `circle`
 *  centred on its token. */
function MeasureShape({
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

/** A scenery image decal drawn under tokens. DM-draggable to reposition, with
 *  an aspect-locked corner handle to resize; click-through for players (and
 *  for the DM while a map tool is active or decals are locked). */
function DecalImage({
  url,
  x,
  y,
  width,
  height,
  draggable,
  handleSize = 10,
  alwaysListening = false,
  badge = false,
  hasShop = false,
  onRemove,
  onMove,
  onResize,
  onActivate,
  onEditShop,
}: {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  draggable?: boolean;
  /** Corner-handle size in image px (pre-divided by zoom for constant screen size). */
  handleSize?: number;
  /** Keep the image listening even when not draggable, so a press over it still
   *  bubbles to the draggable layer and PANS (map tiles want this; click-through
   *  decals don't). It still can't be dragged unless `draggable` is set. */
  alwaysListening?: boolean;
  /** Show a small (decorative, non-listening) tag — this decal has a popup. */
  badge?: boolean;
  /** Whether the decal already has a shop popup (picks the DM button label). */
  hasShop?: boolean;
  onRemove?: () => void;
  onMove?: (x: number, y: number) => void;
  onResize?: (width: number, height: number) => void;
  /** Click (no drag) → open the decal's popup. */
  onActivate?: () => void;
  /** DM-only: render an always-clickable 🛒 corner button that opens the shop
   *  editor regardless of the decal lock state (the discoverable add/edit path). */
  onEditShop?: () => void;
}) {
  const img = useImage(url);
  // Live size during a handle drag, so the image follows the corner before the
  // server echoes the resize back; cleared when the real size arrives.
  const [tmp, setTmp] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => setTmp(null), [width, height]);
  if (!img) return null;
  const w = tmp?.w ?? width;
  const h = tmp?.h ?? height;
  const interactive = !!draggable && !onRemove;
  const setCursor = (e: KonvaEventObject<MouseEvent>, cursor: string) => {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };
  return (
    <>
      <KonvaImage
        image={img}
        x={x}
        y={y}
        width={w}
        height={h}
        listening={alwaysListening || !!onRemove || interactive || !!onActivate}
        draggable={interactive}
        onClick={onRemove ?? onActivate}
        onTap={onRemove ?? onActivate}
        onMouseEnter={(e) => onActivate && !interactive && setCursor(e, 'pointer')}
        onMouseLeave={(e) => onActivate && !interactive && setCursor(e, '')}
        onDragEnd={(e) => onMove?.(e.target.x(), e.target.y())}
      />
      {onEditShop ? (
        // DM: an always-clickable corner button — adds a shop (🛒 +) or edits an
        // existing one (🛒), no matter whether decals are locked or unlocked.
        <Label
          x={x + 2}
          y={y + 2}
          opacity={0.95}
          onClick={onEditShop}
          onTap={onEditShop}
          onMouseEnter={(e) => setCursor(e, 'pointer')}
          onMouseLeave={(e) => setCursor(e, '')}
        >
          <Tag fill="#1c2a3a" stroke="#4cc9f0" strokeWidth={0.5} cornerRadius={3} />
          <Text
            text={hasShop ? ' 🛒 ' : ' 🛒 + '}
            fontSize={Math.max(11, handleSize * 1.1)}
            fill="#cfe8ff"
            padding={1}
          />
        </Label>
      ) : badge ? (
        <Label x={x + 2} y={y + 2} listening={false} opacity={0.92}>
          <Tag fill="#1c2a3a" stroke="#4cc9f0" strokeWidth={0.5} cornerRadius={3} />
          <Text text=" 🛒 " fontSize={Math.max(11, handleSize * 1.1)} fill="#cfe8ff" padding={1} />
        </Label>
      ) : null}
      {interactive && onResize && (
        <Rect
          x={x + w - handleSize / 2}
          y={y + h - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#4cc9f0"
          stroke="#04060a"
          strokeWidth={1}
          draggable
          onMouseEnter={(e) => setCursor(e, 'nwse-resize')}
          onMouseLeave={(e) => setCursor(e, '')}
          onDragMove={(e) => {
            // Aspect-locked: the corner follows the diagonal from the anchor.
            const nw = Math.max(16, e.target.x() + handleSize / 2 - x);
            const nh = Math.max(16, nw * (height / Math.max(1, width)));
            e.target.position({ x: x + nw - handleSize / 2, y: y + nh - handleSize / 2 });
            setTmp({ w: nw, h: nh });
          }}
          onDragEnd={() => {
            if (tmp) onResize(tmp.w, tmp.h);
          }}
        />
      )}
    </>
  );
}

export function MapStage({
  snapshot,
  draggableTokens,
  selectedIds,
  activeTurnTokenId,
  onSelectToken,
  onMoveToken,
  onPlaceAt,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [menu, setMenu] = useState<{ token: Token; x: number; y: number } | null>(
    null,
  );
  const [hover, setHover] = useState<{ token: Token; x: number; y: number } | null>(
    null,
  );
  // Konva fires no mouseout for an unmounted node, so a hover card / floating menu
  // can linger after its token leaves the snapshot (deleted, hidden, fogged, or
  // moved off this map). Prune them when the referenced id is gone.
  useEffect(() => {
    const ids = new Set(snapshot.tokens.map((t) => t.id));
    if (menu && !ids.has(menu.token.id)) setMenu(null);
    if (hover && !ids.has(hover.token.id)) setHover(null);
  }, [snapshot.tokens, menu, hover]);
  const map = snapshot.map;

  // DM: paste an image from the clipboard → upload → choose Object or Decal.
  // Falls back to <img>/image-URL pastes (e.g. copying art out of a web page
  // or Google Slides puts only the image's URL on the clipboard, not pixels) —
  // the server fetches those via /api/icons/from-url.
  useEffect(() => {
    if (snapshot.role !== 'dm') return;
    const openWith = openPasteDialog;
    const onPaste = async (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        const fd = new FormData();
        fd.append('image', file);
        try {
          const res = await fetch('/api/icons', { method: 'POST', body: fd });
          if (!res.ok) throw new Error('upload failed');
          const { icon } = await res.json();
          await openWith(icon);
        } catch {
          notify('Could not paste that image.');
        }
        return;
      }
      // No pixel data — look for an <img src> in an HTML paste, or a URL in a
      // text paste. NEVER hijack a paste aimed at a text field (chat etc.).
      const el = e.target as HTMLElement | null;
      const editable =
        !!el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (editable) return;
      const html = e.clipboardData?.getData('text/html') ?? '';
      const text = e.clipboardData?.getData('text/plain')?.trim() ?? '';
      const srcMatch = html.match(/<img[^>]+src=(?:"([^"]+)"|'([^']+)')/i);
      const src = (srcMatch?.[1] ?? srcMatch?.[2])?.replace(/&amp;/g, '&');
      // Inline data: URI (some apps embed the pixels in the HTML) — upload it
      // directly, no server fetch needed.
      if (src?.startsWith('data:image/')) {
        e.preventDefault();
        try {
          const blob = await (await fetch(src)).blob();
          const fd = new FormData();
          fd.append('image', blob, 'paste.png');
          const res = await fetch('/api/icons', { method: 'POST', body: fd });
          if (!res.ok) throw new Error('upload failed');
          const { icon } = await res.json();
          await openWith(icon);
        } catch {
          notify('Could not paste that image.');
        }
        return;
      }
      // Any http(s) URL is worth trying — Slides/Docs image URLs carry no file
      // extension; the server verifies the response really is an image.
      const remote =
        (src && /^https?:\/\//i.test(src) ? src : '') ||
        (/^https?:\/\/\S+$/i.test(text) ? text : '');
      if (!remote) {
        if (html || text)
          notify('No image on the clipboard — copy the image itself (right-click → Copy image).');
        return;
      }
      e.preventDefault();
      try {
        const res = await fetch('/api/icons/from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: remote }),
        });
        if (!res.ok) {
          const why = (await res.json().catch(() => null))?.error;
          notify(`Could not fetch that image link${why ? ` — ${why}` : ''}.`);
          return;
        }
        const { icon } = await res.json();
        await openWith(icon);
      } catch {
        notify('Could not fetch that image link.');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.role]);

  const image = useImage(map?.imagePath ?? null);

  // Remount the Stage when devicePixelRatio changes (e.g. snapping the window
  // to a monitor with different Windows scaling) — Konva sizes its canvas
  // buffer at creation, so without this the map renders blurry/misaligned.
  const [dprKey, setDprKey] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;
    const apply = (w: number, h: number) =>
      // Skip no-op updates: a Windows snap fires a burst of resize events and
      // re-rendering the full canvas for each glitched the map + UI.
      setSize((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
    const ro = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect;
      if (!rect) return;
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      // Coalesce the burst into one update per animation frame.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apply(w, h));
    });
    ro.observe(el);

    // Watch for DPI changes (cross-monitor snap with different scaling).
    let mql: MediaQueryList | null = null;
    const onDpr = () => {
      setDprKey((k) => k + 1);
      watchDpr(); // re-arm at the new ratio
    };
    const watchDpr = () => {
      mql?.removeEventListener?.('change', onDpr);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener?.('change', onDpr);
    };
    watchDpr();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      mql?.removeEventListener?.('change', onDpr);
    };
  }, []);

  // Composite map dimensions. The base image sits at the origin; image tiles can
  // extend the map in ANY direction — a tile placed left/up of the origin gives a
  // NEGATIVE min corner. The logical map is the bounding box of the base image
  // and every tile; the grid, fog, and scale all span this box. For a legacy
  // single-image map the box is just (0,0)→(baseW,baseH), unchanged.
  const tiles = snapshot.mapImages;
  const baseW = image?.naturalWidth ?? 0;
  const baseH = image?.naturalHeight ?? 0;
  const extX0 = Math.min(0, ...tiles.map((t) => t.x));
  const extY0 = Math.min(0, ...tiles.map((t) => t.y));
  const extX1 = Math.max(baseW, ...tiles.map((t) => t.x + t.w));
  const extY1 = Math.max(baseH, ...tiles.map((t) => t.y + t.h));
  const imgW = extX1 - extX0 || 1000;
  const imgH = extY1 - extY0 || 700;
  const grid = map?.gridSizePx ?? 50;

  // ---- Fog of war (two independent layers: map fog + token fog) ----
  const isDm = snapshot.role === 'dm';
  const mySocketId = useStore((s) => s.socket?.id);
  const showRollOverlay = useStore((s) => s.showRollOverlay);
  const showDiceButton = useStore((s) => s.showDiceButton);
  const saveResolve = useStore((s) => s.saveResolve);
  const hpFx = useStore((s) => s.hpFx);
  const dragGhosts = useStore((s) => s.dragGhosts);
  const dragToken = useStore((s) => s.dragToken);
  const typingChars = useStore((s) => s.typingChars);
  const sayBubbles = useStore((s) => s.sayBubbles);
  const cursors = useStore((s) => s.cursors);
  const moveCursor = useStore((s) => s.moveCursor);
  const hideCursor = useStore((s) => s.hideCursor);
  const showCursors = useStore((s) => s.showCursors);
  const cursorThrottle = useRef(0);
  const resolveSaveAt = useStore((s) => s.resolveSaveAt);
  const setDetailsExpanded = useStore((s) => s.setDetailsExpanded);
  const nudgeRightPanel = useStore((s) => s.nudgeRightPanel);
  const setCombatTarget = useStore((s) => s.setCombatTarget);
  const clearSaveResolve = useStore((s) => s.clearSaveResolve);
  const setFogLayer = useStore((s) => s.setFogLayer);
  const paintFog = useStore((s) => s.paintFog);
  const coverFog = useStore((s) => s.coverFog);
  const setMapGrid = useStore((s) => s.setMapGrid);
  const addMeasurement = useStore((s) => s.addMeasurement);
  const removeMeasurement = useStore((s) => s.removeMeasurement);
  const clearMeasurements = useStore((s) => s.clearMeasurements);
  const addAnnotation = useStore((s) => s.addAnnotation);
  const pasteObject = useStore((s) => s.pasteObject);
  const notify = useStore((s) => s.notify);
  const removeAnnotation = useStore((s) => s.removeAnnotation);
  const clearAnnotations = useStore((s) => s.clearAnnotations);
  const moveAnnotation = useStore((s) => s.moveAnnotation);
  const resizeAnnotation = useStore((s) => s.resizeAnnotation);
  const openDecalPopup = useStore((s) => s.openDecalPopup);
  const addMapImage = useStore((s) => s.addMapImage);
  const moveMapImage = useStore((s) => s.moveMapImage);
  const resizeMapImage = useStore((s) => s.resizeMapImage);
  const reorderMapImage = useStore((s) => s.reorderMapImage);
  const removeMapImage = useStore((s) => s.removeMapImage);
  // Tile-arrange mode: tiles become draggable/resizable on the map.
  const [tilesMode, setTilesMode] = useState(false);
  // Annotation tool: a freehand pen or text-label placer, with a colour.
  const [annotate, setAnnotate] = useState<'pen' | 'text' | null>(null);
  const [annoColor, setAnnoColor] = useState('#ffd166');
  const penRef = useRef<number[] | null>(null);
  const [penDraft, setPenDraft] = useState<number[] | null>(null);
  const [fogBrush, setFogBrush] = useState<'off' | 'reveal' | 'hide'>('off');
  const [paintLayer, setPaintLayer] = useState<FogLayer>('map');
  const [brushSize, setBrushSize] = useState(1); // cells per side (1,3,5)
  // Fog cell index range over the composite box (may be negative when tiles
  // extend left/up). Cells are keyed "col,row" = floor(x/grid),floor(y/grid).
  const colMin = Math.floor(extX0 / grid);
  const colMax = Math.ceil(extX1 / grid);
  const rowMin = Math.floor(extY0 / grid);
  const rowMax = Math.ceil(extY1 / grid);
  const mapFogEnabled = map?.mapFogEnabled ?? false;
  const tokenFogEnabled = map?.tokenFogEnabled ?? false;
  const mapRevealed = useMemo(
    () => new Set(map?.mapFogRevealed ?? []),
    [map?.mapFogRevealed],
  );
  const tokenRevealed = useMemo(
    () => new Set(map?.tokenFogRevealed ?? []),
    [map?.tokenFogRevealed],
  );
  const fogActive = isDm && fogBrush !== 'off';
  const paintingRef = useRef(false);
  const strokeRef = useRef<Set<string>>(new Set());
  // Fog-brush cells are accumulated and flushed on a short timer so a fast sweep
  // coalesces into ~1 broadcast per 120 ms — each fog:paint triggers a full
  // server-side snapshot rebuild + broadcast, so per-mousemove emits saturate the
  // event loop and stutter every player's map.
  const pendingFogRef = useRef<string[]>([]);
  const fogFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (fogFlushRef.current) clearTimeout(fogFlushRef.current);
    },
    [],
  );

  // ---- Map scale ----------------------------------------------------------
  // Scale is GRID-BASED: feet-per-pixel = feet-per-square ÷ pixels-per-square,
  // which is FIXED by the grid. So composing a map from tiles — adding one or
  // resizing one — only changes how many squares the map spans; it never
  // rescales the existing map or its distances. The map's total width in feet is
  // therefore a derived read-out (extent × feet-per-pixel), computed below.
  // (A map with no usable grid scale falls back to its stored width ÷ base image
  // width, then to a 5 ft / 50 px default — keeping old saves unchanged.)
  const feetPerSquare = map?.feetPerSquare ?? 5;
  const mapWidthFt = map?.mapWidthFt ?? 0;
  const gridFpp = grid > 0 && feetPerSquare > 0 ? feetPerSquare / grid : 0;
  const fpp = gridFpp || (mapWidthFt > 0 && baseW ? mapWidthFt / baseW : 0.1);
  // Pixels per foot — tokens are sized by their real width in feet, so they keep
  // their footprint when only the visual grid cell changes.
  const pxPerFoot = fpp > 0 ? 1 / fpp : grid / 5;

  // ---- Measuring tools: a "Measure" dropdown with standard + custom shapes ----
  const [tool, setTool] = useState<MeasureTool | null>(null);
  const [snap, setSnap] = useState(true);
  const [removeMode, setRemoveMode] = useState(false);
  // DM preference: lock scenery decals (click-through + undraggable) so they
  // can't be grabbed while moving tokens/panning. Persisted per session.
  const [decalsLocked, setDecalsLocked] = useState(
    () => localStorage.getItem(`decals-locked:${snapshot.sessionCode}`) === '1',
  );
  const toggleDecalsLocked = () =>
    setDecalsLocked((cur) => {
      safeSetItem(`decals-locked:${snapshot.sessionCode}`, cur ? '0' : '1');
      return !cur;
    });
  // A reference-line drag that sets the map scale (DM only).
  const [scaleMode, setScaleMode] = useState(false);
  const [matchMode, setMatchMode] = useState(false);
  const [pasteImg, setPasteImg] = useState<{ url: string; w: number; h: number } | null>(null);
  const [pasteName, setPasteName] = useState('');
  // Paste-dialog edits: the original (for Undo), a busy flag while the canvas
  // work + re-upload runs, and the drag-selected crop box in PREVIEW pixels.
  const [pasteOrig, setPasteOrig] = useState<{ url: string; w: number; h: number } | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [cropSel, setCropSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropStart = useRef<{ x: number; y: number } | null>(null);
  const pastePreviewRef = useRef<HTMLImageElement>(null);
  // Open the paste/decal dialog with an image (used by clipboard paste AND by
  // ComfyUI scenery generation). Stable identity so the paste effect can call it.
  const openPasteDialog = useCallback(async (icon: string) => {
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 200, h: 200 });
      img.src = icon;
    });
    setPasteName('');
    setCropSel(null);
    setPasteImg({ url: icon, w: dims.w, h: dims.h });
    setPasteOrig({ url: icon, w: dims.w, h: dims.h });
  }, []);
  // ComfyUI scenery generation (DM) — routes the result into the paste dialog.
  const comfyOk = useComfyAvailable();
  const [sceneOpen, setSceneOpen] = useState(false);
  const [scenePrompt, setScenePrompt] = useState('');
  const [sceneBusy, setSceneBusy] = useState(false);
  const generateScenery = async () => {
    if (!scenePrompt.trim() || sceneBusy) return;
    setSceneBusy(true);
    try {
      const { path, error } = await comfyGenerate(scenePrompt, 'decal');
      if (!path) {
        notify(error || 'Generation failed — is ComfyUI running with a checkpoint loaded?');
        return;
      }
      await openPasteDialog(path);
      setSceneOpen(false);
      setScenePrompt('');
    } finally {
      setSceneBusy(false);
    }
  };
  const [scaleLine, setScaleLine] = useState<{ origin: Pt; target: Pt } | null>(null);
  const [scalePrompt, setScalePrompt] = useState<{ lenPx: number } | null>(null);
  const [scaleFt, setScaleFt] = useState('');
  const scaleDrawRef = useRef(false);
  const measureActive = !!tool || removeMode || scaleMode || matchMode || !!annotate;
  // While a token is dragging (or measuring) the grid brightens for alignment.
  const [draggingToken, setDraggingToken] = useState(false);
  const gridHot = draggingToken || measureActive;

  // Identity-stable token handlers so the memoized TokenShape only re-renders
  // when its own token/display actually changes (not on every snapshot).
  const handleTokenSelect = useStableCallback((tok: Token, additive: boolean) => {
    if (saveResolve) resolveSaveAt(tok.id);
    else onSelectToken(tok, additive);
  });
  const handleTokenActivate = useStableCallback((tok: Token) => {
    if (saveResolve) return;
    onSelectToken(tok, false);
    setDetailsExpanded(true); // open the player's read-only Details
    nudgeRightPanel(); // and pop the right drawer open (collapsed on phones)
  });
  const handleTokenMove = useStableCallback((tok: Token, x: number, y: number) =>
    onMoveToken(tok.id, x, y),
  );
  const handleTokenDragPreview = useStableCallback((tok: Token, x: number, y: number) =>
    dragToken(tok.id, x, y),
  );
  const handleTokenMenu = useStableCallback((tok: Token, cx: number, cy: number) => {
    setHover(null);
    // Also aim the Combat section's target dropdown at the right-clicked token,
    // so closing the menu still leaves the side panel set up to attack it.
    setCombatTarget(tok.id);
    setMenu({ token: tok, x: cx, y: cy });
  });
  const handleTokenHover = useStableCallback((tok: Token, cx: number, cy: number) =>
    setHover({ token: tok, x: cx, y: cy }),
  );
  const handleTokenHoverEnd = useStableCallback(() => setHover(null));

  // The map-tool menus (Measure/Scale/Fog) are portaled into a slot in the top
  // toolbar above the map; grab that slot once the toolbar has mounted.
  const [toolSlot, setToolSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setToolSlot(document.getElementById('map-tool-slot'));
  }, []);

  // Esc exits the "Apply damage" click-to-target save mode.
  useEffect(() => {
    if (!saveResolve) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && clearSaveResolve();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveResolve, clearSaveResolve]);

  const [draft, setDraft] = useState<DraftMeasure | null>(null);
  const drawingRef = useRef(false); // a custom drag is in progress
  const pendingRef = useRef(false); // click-rotate / emanation-radius: awaiting 2nd click
  const snapPt = (p: Pt): Pt =>
    snap ? { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid } : p;
  // Feet -> stored image-space distance (square stores HALF its side; circle/
  // emanation a radius; cone/line a length).
  const presetPx = (shape: MeasureShapeKind, ft: number): number =>
    (shape === 'square' ? ft / 2 : ft) / fpp;
  // The persisted Measurement.kind for a (shape,size) pick.
  const kindOf = (t: MeasureTool): Measurement['kind'] =>
    t.shape === 'line' ? (t.size === 'custom' ? 'ruler' : 'line') : t.shape;
  const tokenAt = (p: Pt): Token | undefined =>
    // Match the token's RENDERED radius (widthFt ÷ feet-per-pixel), not the legacy
    // grid×size — on a map whose grid isn't 5 ft/square those diverge and the
    // clickable disc mis-targets an emanation onto a neighbour.
    snapshot.tokens.find(
      (t) => Math.hypot(p.x - t.x, p.y - t.y) <= (t.widthFt ?? t.size * 5) / fpp / 2,
    );

  // DM scale control (committed on blur/Enter; synced from the live map). The
  // grid cell is purely visual; the map width (ft) drives the scale, prefilled
  // from the current implied width so legacy maps show their existing scale.
  const [gridPx, setGridPx] = useState(grid);
  // The map's total width in feet is DERIVED from the scale + the composite
  // extent (so it grows as you add tiles, while the scale itself stays fixed).
  const [widthFt, setWidthFt] = useState(0);
  useEffect(() => setGridPx(grid), [grid]);
  useEffect(() => setWidthFt(Math.round(fpp * imgW)), [fpp, imgW]);
  // Set the scale from a dragged reference line ("this line is X ft"): that fixes
  // feet-per-pixel; store it as the grid's feet-per-square (× the px cell). The
  // stored width is just the implied read-out for the CURRENT extent.
  const commitScale = (px: number, ftWide: number) => {
    if (!map || !imgW || ftWide <= 0) return;
    const fps = (ftWide / imgW) * px; // exact float → grid-based fpp is precise
    setMapGrid(map.id, px, fps, Math.round(ftWide));
  };
  // The DM sets the grid in FEET per square (the scale's source of truth); the
  // pixel cell is derived so the typed map width holds for the current extent.
  const commitScaleFeet = (ftPerSquare: number, ftWide: number) => {
    if (!map || !imgW || ftWide <= 0 || ftPerSquare <= 0) return;
    const px = Math.max(1, Math.round((ftPerSquare * imgW) / ftWide));
    setGridPx(px);
    setMapGrid(map.id, px, ftPerSquare, Math.round(ftWide));
  };
  const derivedFtPerSquare = feetPerSquare;

  // Confirm the reference-line prompt: its real length sets the map width.
  const applyScaleFromLine = () => {
    const ft = parseFloat(scaleFt);
    if (scalePrompt && imgW && ft > 0) {
      commitScale(gridPx, (ft * imgW) / scalePrompt.lenPx);
    }
    setScaleMode(false);
    setScaleLine(null);
    setScalePrompt(null);
    setScaleFt('');
  };

  // Esc cancels the active measure tool / pending placement / scale line.
  useEffect(() => {
    if (!measureActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      drawingRef.current = false;
      pendingRef.current = false;
      scaleDrawRef.current = false;
      setDraft(null);
      setTool(null);
      setRemoveMode(false);
      setScaleMode(false);
      setScaleLine(null);
      setScalePrompt(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measureActive]);

  // Fit-to-window transform (the default / reset view).
  const fit = useMemo<View>(() => {
    const s = Math.min(size.w / imgW, size.h / imgH) || 1;
    // Centre the composite box, shifting by its (possibly negative) min corner.
    return {
      scale: s,
      x: (size.w - imgW * s) / 2 - extX0 * s,
      y: (size.h - imgH * s) / 2 - extY0 * s,
    };
  }, [size, imgW, imgH, extX0, extY0]);

  const [view, setView] = useState<View>(fit);
  const userAdjusted = useRef(false);
  // Two-finger pinch-zoom state: the last finger spread + its midpoint (in
  // container coords), null when not pinching.
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const [pinching, setPinching] = useState(false);
  // Screen-space pointer at an empty-space press, to tell a deliberate CLICK
  // (deselect) from a PAN drag (keep selection so you can look around).
  const clickStart = useRef<{ x: number; y: number } | null>(null);

  // Reset to fit when the map changes; otherwise refit on resize until the
  // user zooms/pans, after which we preserve their view.
  useEffect(() => {
    userAdjusted.current = false;
    setView(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.id]);
  useEffect(() => {
    if (!userAdjusted.current) setView(fit);
  }, [fit]);

  // Map each token to its 1-based position in initiative order (highest first).
  const initiativeRank = useMemo(() => {
    const ranked = snapshot.tokens
      .filter((t) => t.initiative !== null)
      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
    const m = new Map<string, number>();
    ranked.forEach((t, i) => m.set(t.id, i + 1));
    return m;
  }, [snapshot.tokens]);

  const gridHidden = !!map?.gridHidden;
  const gridLines = useMemo(() => {
    const lines: number[][] = [];
    if (gridHidden) return lines;
    const ox = (((map?.gridOffsetX ?? 0) % grid) + grid) % grid;
    const oy = (((map?.gridOffsetY ?? 0) % grid) + grid) % grid;
    // Span the whole composite box (start at the first grid-aligned line at/before
    // its left/top edge), so the grid is continuous across tiles in any direction.
    const startX = Math.floor((extX0 - ox) / grid) * grid + ox;
    const startY = Math.floor((extY0 - oy) / grid) * grid + oy;
    for (let x = startX; x <= extX1; x += grid) lines.push([x, extY0, x, extY1]);
    for (let y = startY; y <= extY1; y += grid) lines.push([extX0, y, extX1, y]);
    return lines;
  }, [extX0, extY0, extX1, extY1, grid, gridHidden, map?.gridOffsetX, map?.gridOffsetY]);

  // A backdrop covering the whole viewport (in map coords) BEHIND the map, so a
  // press anywhere — including the empty area off the map or over a tile —
  // bubbles to the draggable layer and PANS. It only has to cover the viewport
  // at mouse-down (Konva keeps dragging the layer afterwards regardless), and it
  // recomputes on every pan/zoom; one extra viewport of margin makes that ample.
  // Filled with the off-map colour so it looks identical to the existing backdrop.
  const panBg = useMemo(() => {
    const s = view.scale || 1;
    const vw = size.w / s;
    const vh = size.h / s;
    const m = Math.max(vw, vh);
    return { x: -view.x / s - m, y: -view.y / s - m, w: vw + 2 * m, h: vh + 2 * m };
  }, [view, size]);

  /**
   * Map-corner overlays that belong to the map REGARDLESS of how it's drawn —
   * the dice corner (with its adv/dis switch), the two-step damage prompt, and
   * the roll-log overlay. They're rendered by both the Konva path and the Slides
   * path below: a landed hit has to be rollable, and a roll has to be armable,
   * whichever kind of map the table happens to be on.
   */
  const mapOverlays = (
    <>
      {showRollOverlay && (
        <RollLogOverlay rollLog={snapshot.rollLog} chat={snapshot.chat} />
      )}
      {showDiceButton && <DiceButtonOverlay selectedIds={selectedIds} />}
      <DamagePrompt />
    </>
  );

  // Google Slides maps render as an embedded iframe instead of a canvas.
  if (map?.slidesUrl && !map.imagePath) {
    return (
      <div className="stage-wrap" ref={containerRef}>
        <iframe
          title={map.name}
          src={map.slidesUrl}
          style={{ width: '100%', height: '100%', border: 0 }}
          allowFullScreen
        />
        {mapOverlays}
      </div>
    );
  }

  /** Convert the current pointer position into image-space coordinates. */
  const pointerToImage = (stage: Konva.Stage): { x: number; y: number } | null => {
    const p = stage.getPointerPosition();
    if (!p) return null;
    const layer = layerRef.current;
    if (layer) {
      const t = layer.getAbsoluteTransform().copy();
      t.invert();
      return t.point(p);
    }
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
  };

  /** Paint the brush footprint under the cursor (reveal/hide), once per stroke. */
  const emitFogCell = (stage: Konva.Stage) => {
    const pos = pointerToImage(stage);
    if (!pos || !map) return;
    const cc = Math.floor(pos.x / grid);
    const cr = Math.floor(pos.y / grid);
    const half = Math.floor(brushSize / 2);
    const fresh: string[] = [];
    for (let dc = -half; dc <= half; dc++) {
      for (let dr = -half; dr <= half; dr++) {
        const c = cc + dc;
        const r = cr + dr;
        if (c < colMin || r < rowMin || c >= colMax || r >= rowMax) continue;
        const key = `${c},${r}`;
        if (strokeRef.current.has(key)) continue;
        strokeRef.current.add(key);
        fresh.push(key);
      }
    }
    if (fresh.length) {
      pendingFogRef.current.push(...fresh);
      if (!fogFlushRef.current) fogFlushRef.current = setTimeout(flushFog, 120);
    }
  };
  /** Emit the accumulated fog cells as ONE paint (a stroke is a single
   *  layer/direction, so those are constant across the batch). */
  const flushFog = () => {
    if (fogFlushRef.current) {
      clearTimeout(fogFlushRef.current);
      fogFlushRef.current = null;
    }
    const cells = pendingFogRef.current;
    if (cells.length && map) {
      pendingFogRef.current = [];
      paintFog(map.id, paintLayer, cells, fogBrush === 'reveal');
    }
  };

  // Place/size a measurement. Custom = drag; standard circle/square = one click;
  // standard cone/line = click-anchor then rotate then click; emanation = click a
  // token (then optionally drag the radius for custom).
  const measureDown = (pos: Pt) => {
    if (!tool) return;
    // Second click of a two-step placement (cone/line rotate, emanation radius)
    // commits the current preview.
    if (pendingRef.current && draft) {
      addMeasurement({
        kind: draft.kind,
        origin: draft.origin,
        target: draft.target,
        tokenId: draft.tokenId,
      });
      pendingRef.current = false;
      setDraft(null);
      return;
    }
    const { shape, size } = tool;
    const kind = kindOf(tool);

    if (shape === 'emanation') {
      const tok = tokenAt(pos);
      if (!tok) return;
      const center = { x: tok.x, y: tok.y };
      if (size === 'custom') {
        pendingRef.current = true; // radius follows the cursor until the next click
        setDraft({ kind, origin: center, target: center, tokenId: tok.id });
      } else {
        const r = presetPx('emanation', MEASURE_FT.emanation[size]);
        addMeasurement({ kind, origin: center, target: { x: center.x + r, y: center.y }, tokenId: tok.id });
      }
      return;
    }

    if (size === 'custom') {
      drawingRef.current = true;
      const o = snapPt(pos);
      setDraft({ kind, origin: o, target: o });
      return;
    }

    const len = presetPx(shape, MEASURE_FT[shape][size]);
    if (shape === 'circle' || shape === 'square') {
      const o = snapPt(pos);
      addMeasurement({ kind, origin: o, target: { x: o.x + len, y: o.y } });
      return;
    }
    // cone / line: first click anchors; the angle then follows the cursor.
    const o = snapPt(pos);
    pendingRef.current = true;
    setDraft({ kind, origin: o, target: { x: o.x + len, y: o.y } });
  };

  const measureMove = (pos: Pt) => {
    if (drawingRef.current) {
      setDraft((d) => (d ? { ...d, target: snapPt(pos) } : d));
      return;
    }
    if (pendingRef.current && draft && tool) {
      if (tool.shape === 'emanation') {
        // Radius follows the cursor from the token centre.
        setDraft((d) => (d ? { ...d, target: pos } : d));
      } else {
        // Lock the preset length; the angle follows the cursor (free rotation).
        const len = presetPx(tool.shape, MEASURE_FT[tool.shape][tool.size as 'small' | 'large']);
        const dx = pos.x - draft.origin.x;
        const dy = pos.y - draft.origin.y;
        const m = Math.hypot(dx, dy) || 1;
        setDraft((d) =>
          d ? { ...d, target: { x: d.origin.x + (dx / m) * len, y: d.origin.y + (dy / m) * len } } : d,
        );
      }
    }
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    // Two fingers down → start a pinch-zoom (and suspend panning/drawing).
    const touches = (e.evt as TouchEvent).touches;
    if (touches && touches.length >= 2) {
      e.evt.preventDefault();
      pinchRef.current = pinchData(touches);
      setPinching(true);
      return;
    }
    if (scaleMode || matchMode) {
      // scaleMode → drag a reference line for a known distance; matchMode → drag
      // a BOX across one printed grid square (a live square preview shows the
      // exact cell you'll get — corner to corner).
      const pos = pointerToImage(stage);
      if (pos) {
        scaleDrawRef.current = true;
        setScalePrompt(null);
        setScaleLine({ origin: pos, target: pos });
      }
      return;
    }
    if (removeMode) return; // removal is handled by clicking a shape
    if (tool) {
      const pos = pointerToImage(stage);
      if (pos) measureDown(pos);
      return;
    }
    if (annotate === 'pen') {
      const pos = pointerToImage(stage);
      if (pos) {
        penRef.current = [pos.x, pos.y];
        setPenDraft([pos.x, pos.y]);
      }
      return;
    }
    if (annotate === 'text') {
      const pos = pointerToImage(stage);
      if (pos) {
        const text = window.prompt('Label text:')?.trim();
        if (text) addAnnotation({ kind: 'text', x: pos.x, y: pos.y, text, color: annoColor });
      }
      return;
    }
    if (fogActive) {
      paintingRef.current = true;
      strokeRef.current = new Set();
      emitFogCell(stage);
      return;
    }
    // Clicks on an existing token are handled by the token itself (select/drag).
    if (e.target.findAncestor('.token', true)) return;
    // Anywhere else on the canvas — the map image, grid, or empty space —
    // places a pending spawn, otherwise arms a possible deselect. We DON'T
    // deselect on press: dragging here pans the map, and panning while a token
    // is selected (to look around mid-decision) must keep the selection. The
    // deselect fires on release only if the pointer barely moved (a real click).
    const pos = pointerToImage(stage);
    if (onPlaceAt && pos) {
      onPlaceAt(pos.x, pos.y);
      return;
    }
    const p = stage.getPointerPosition();
    clickStart.current = p ? { x: p.x, y: p.y } : null;
  };

  // Release on the stage: a near-stationary empty-space press was a click →
  // deselect; a press that moved was a pan → keep the selection. Then run the
  // normal stroke-end handling.
  const handlePointerUp = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const start = clickStart.current;
    clickStart.current = null;
    if (start) {
      const p = e.target.getStage()?.getPointerPosition();
      if (p && Math.hypot(p.x - start.x, p.y - start.y) <= 5) onSelectToken(null);
    }
    endStroke();
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const touches = (e.evt as TouchEvent).touches;
    if (touches && touches.length >= 2 && pinchRef.current) {
      e.evt.preventDefault();
      const next = pinchData(touches);
      zoomAtPoint(next.dist / pinchRef.current.dist, next.cx, next.cy);
      pinchRef.current = next;
      return;
    }
    // Live "laser pointer": broadcast my cursor (throttled ~20/s) so others see
    // what I'm pointing at — independent of any active tool.
    const cursorStage = e.target.getStage();
    if (cursorStage && map) {
      const now = Date.now();
      if (now - cursorThrottle.current > 45) {
        cursorThrottle.current = now;
        const cp = pointerToImage(cursorStage);
        if (cp) moveCursor(cp.x, cp.y, map.id);
      }
    }
    if ((scaleMode || matchMode) && scaleDrawRef.current) {
      const stage = e.target.getStage();
      const pos = stage ? pointerToImage(stage) : null;
      if (pos) setScaleLine((l) => (l ? { ...l, target: pos } : l));
      return;
    }
    if (tool && (drawingRef.current || pendingRef.current)) {
      const stage = e.target.getStage();
      const pos = stage ? pointerToImage(stage) : null;
      if (pos) measureMove(pos);
      return;
    }
    if (annotate === 'pen' && penRef.current) {
      const stage = e.target.getStage();
      const pos = stage ? pointerToImage(stage) : null;
      if (pos) {
        penRef.current.push(pos.x, pos.y);
        setPenDraft([...penRef.current]);
      }
      return;
    }
    if (!fogActive || !paintingRef.current) return;
    const stage = e.target.getStage();
    if (stage) emitFogCell(stage);
  };

  const endStroke = () => {
    clickStart.current = null; // a press that ends any other way isn't a click
    if (pinchRef.current) {
      pinchRef.current = null;
      setPinching(false);
      return;
    }
    if (penRef.current) {
      const pts = penRef.current;
      penRef.current = null;
      setPenDraft(null);
      // Ignore a stray click (need a real stroke of at least a few points).
      if (pts.length >= 6) addAnnotation({ kind: 'freehand', points: pts, color: annoColor });
      return;
    }
    if (scaleDrawRef.current) {
      scaleDrawRef.current = false;
      if (scaleLine && matchMode && map && imgW) {
        // The dragged box → a square cell: side = the longer drag axis, anchored
        // at the drag-origin corner toward the cursor (matches the preview).
        const dx = scaleLine.target.x - scaleLine.origin.x;
        const dy = scaleLine.target.y - scaleLine.origin.y;
        const size = Math.round(Math.max(Math.abs(dx), Math.abs(dy)));
        if (size >= 8) {
          const ox = dx >= 0 ? scaleLine.origin.x : scaleLine.origin.x - size;
          const oy = dy >= 0 ? scaleLine.origin.y : scaleLine.origin.y - size;
          // The dragged box IS one grid square: keep its feet-per-square and set
          // the px cell to the box, so a square = that printed square. The width
          // read-out follows from the new grid scale × the current extent.
          const newWidth = Math.round((feetPerSquare / size) * imgW);
          setGridPx(size);
          setMapGrid(map.id, size, feetPerSquare, newWidth, {
            offsetX: ox,
            offsetY: oy,
            locked: true,
          });
        }
        setScaleLine(null);
        setMatchMode(false);
        return;
      }
      if (scaleLine) {
        const len = Math.hypot(
          scaleLine.target.x - scaleLine.origin.x,
          scaleLine.target.y - scaleLine.origin.y,
        );
        // A meaningful drag opens the "this line = ___ ft" prompt; otherwise reset.
        if (len >= grid * 0.25) setScalePrompt({ lenPx: len });
        else setScaleLine(null);
      }
      return;
    }
    // A custom drag commits on release (the click-rotate flows commit on click).
    if (drawingRef.current) {
      drawingRef.current = false;
      if (draft) {
        const len = Math.hypot(
          draft.target.x - draft.origin.x,
          draft.target.y - draft.origin.y,
        );
        if (len >= grid * 0.25) {
          addMeasurement({
            kind: draft.kind,
            origin: draft.origin,
            target: draft.target,
            tokenId: draft.tokenId,
          });
        }
      }
      setDraft(null);
      return;
    }
    if (paintingRef.current) flushFog(); // emit the tail of a fog stroke at once
    paintingRef.current = false;
  };

  const allCells = (): string[] => {
    const all: string[] = [];
    for (let c = colMin; c < colMax; c++)
      for (let r = rowMin; r < rowMax; r++) all.push(`${c},${r}`);
    return all;
  };
  const revealAll = (layer: FogLayer) => {
    if (map) paintFog(map.id, layer, allCells(), true);
  };

  const toggleLayer = (layer: FogLayer) => {
    if (!map) return;
    const enabled = layer === 'map' ? mapFogEnabled : tokenFogEnabled;
    setFogLayer(map.id, layer, !enabled);
    if (!enabled) {
      // Token fog reads best starting fully visible (DM paints spots to hide);
      // map fog starts fully covered (DM reveals). Seed the sensible default.
      const revealed = layer === 'map' ? mapRevealed : tokenRevealed;
      if (layer === 'tokens' && revealed.size === 0) revealAll('tokens');
      // Auto-target the brush at the layer the DM just turned on.
      setPaintLayer(layer);
    } else if (layer === paintLayer) {
      setFogBrush('off');
    }
  };

  // Zoom by `factor`, keeping the container point (px,py) stationary. Shared by
  // the wheel, the +/− buttons (center) and two-finger pinch (the midpoint).
  const zoomAtPoint = (factor: number, px: number, py: number) => {
    setView((v) => {
      // Max zoom: generous relative to fit, but ALSO a floor over native (1:1)
      // pixels so you can get right in close even on a big high-res map (where
      // fit.scale is tiny) — for the "feel of scale" of a vast space.
      const maxScale = Math.max(fit.scale * 20, 6);
      const newScale = clamp(v.scale * factor, fit.scale * 0.25, maxScale);
      const mx = (px - v.x) / v.scale;
      const my = (py - v.y) / v.scale;
      userAdjusted.current = true;
      return { scale: newScale, x: px - mx * newScale, y: py - my * newScale };
    });
  };
  // Button zoom: step in/out around the viewport center.
  const zoomBy = (factor: number) => zoomAtPoint(factor, size.w / 2, size.h / 2);

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    zoomAtPoint(e.evt.deltaY > 0 ? 1 / 1.1 : 1.1, pointer.x, pointer.y);
  };

  // Distance + midpoint (container coords) between the first two active touches.
  const pinchData = (touches: TouchList) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const ox = rect?.left ?? 0;
    const oy = rect?.top ?? 0;
    const [a, b] = [touches[0], touches[1]];
    return {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
      cx: (a.clientX + b.clientX) / 2 - ox,
      cy: (a.clientY + b.clientY) / 2 - oy,
    };
  };

  // Upload an image file and place it as a new map tile, butted up to the right
  // edge of the current map so it naturally extends the battlemap. Scaled down
  // if huge so it isn't unwieldy. Enters arrange mode so it can be nudged.
  const addTileFromFile = async (file: File) => {
    if (!map) return;
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = reject;
      im.src = URL.createObjectURL(file);
    }).catch(() => null);
    if (!dims) {
      notify('Could not read that image file.');
      return;
    }
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/icons', { method: 'POST', body: fd }).catch(() => null);
    if (!res || !res.ok) {
      notify('Could not upload that tile image.');
      return;
    }
    const { icon } = (await res.json()) as { icon: string };
    // Clamp a giant upload so it's not many times the existing map.
    const cap = Math.max(imgW, 2000);
    const sc = dims.w > cap ? cap / dims.w : 1;
    const w = dims.w * sc;
    const h = dims.h * sc;
    // Land it butted to the current right edge (the DM then drags it anywhere).
    // The scale is grid-based, so this just ADDS area — no rescale needed.
    addMapImage({ mapId: map.id, imagePath: icon, x: extX1, y: extY0, w, h });
    setTilesMode(true);
  };

  // Pan by dragging empty canvas (disabled while placing or painting fog).
  const panning = !onPlaceAt && !fogActive && !measureActive && !pinching;
  const handleLayerDragEnd = (e: KonvaEventObject<DragEvent>) => {
    // dragend bubbles; only react to the layer itself panning, not token drags.
    if (e.target.getClassName() !== 'Layer') return;
    userAdjusted.current = true;
    setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
  };

  const resetView = () => {
    userAdjusted.current = false;
    setView(fit);
  };

  return (
    <div className="stage-wrap" ref={containerRef}>
      {!map && <div className="stage-empty">No active map yet.</div>}
      {map && (
        <>
          <div className="stage-controls">
            <button
              className="btn tiny zoom-btn"
              onClick={() => zoomBy(1 / 1.25)}
              title="Zoom out"
            >
              −
            </button>
            <span className="zoom-label">{Math.round(view.scale * 100)}%</span>
            <button
              className="btn tiny zoom-btn"
              onClick={() => zoomBy(1.25)}
              title="Zoom in"
            >
              +
            </button>
            <button className="btn tiny" onClick={resetView} title="Fit to window">
              Fit
            </button>
          </div>
          {/* The Measure/Scale/Fog menus live in the top toolbar (above the map)
              via a portal, but keep all their state/handlers here in MapStage. */}
          {toolSlot &&
            createPortal(
              <div className="map-tool-menus">
                {/* Measuring tools — available to everyone; shapes are shared. */}
                <MeasureMenu
                  tool={tool}
                  snap={snap}
                  removeMode={removeMode}
                  hasMeasurements={snapshot.measurements.length > 0}
                  isDm={isDm}
                  onPick={(shape, sz) => {
                    setRemoveMode(false);
                    pendingRef.current = false;
                    setDraft(null);
                    setTool((cur) =>
                      cur && cur.shape === shape && cur.size === sz
                        ? null
                        : { shape, size: sz },
                    );
                  }}
                  onToggleSnap={() => setSnap((s) => !s)}
                  onToggleRemove={() => {
                    setTool(null);
                    pendingRef.current = false;
                    setDraft(null);
                    setRemoveMode((r) => !r);
                  }}
                  onClearMine={() => map && clearMeasurements(map.id, true)}
                  onClearAll={() => map && clearMeasurements(map.id, false)}
                />
                {/* Annotation tools — freehand pen + text labels (shared). */}
                <div className="annotate-tools">
                  <button
                    className={`btn tiny ${annotate === 'pen' ? 'on' : ''}`}
                    title="Freehand pen — draw on the map"
                    onClick={() => {
                      setTool(null);
                      setRemoveMode(false);
                      setDraft(null);
                      setAnnotate((a) => (a === 'pen' ? null : 'pen'));
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    className={`btn tiny ${annotate === 'text' ? 'on' : ''}`}
                    title="Text label — click the map to place text"
                    onClick={() => {
                      setTool(null);
                      setRemoveMode(false);
                      setDraft(null);
                      setAnnotate((a) => (a === 'text' ? null : 'text'));
                    }}
                  >
                    🅰
                  </button>
                  {['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#ffffff'].map((c) => (
                    <button
                      key={c}
                      className="anno-swatch"
                      style={{ background: c, outline: annoColor === c ? '2px solid #000' : 'none' }}
                      title="Pen/label colour"
                      onClick={() => setAnnoColor(c)}
                    />
                  ))}
                  {isDm && comfyOk && (
                    <>
                      <button
                        className={`btn tiny ${sceneOpen ? 'on' : ''}`}
                        title="Generate scenery art with your local ComfyUI, then place it as a decal or object"
                        onClick={() => setSceneOpen((v) => !v)}
                      >
                        🎨 Generate
                      </button>
                      {sceneOpen && (
                        <input
                          className="scene-prompt"
                          autoFocus
                          placeholder="Describe scenery — e.g. mossy stone ruins, top-down"
                          value={scenePrompt}
                          onChange={(e) => setScenePrompt(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && generateScenery()}
                        />
                      )}
                      {sceneOpen && (
                        <button
                          className="btn tiny"
                          disabled={sceneBusy || !scenePrompt.trim()}
                          onClick={generateScenery}
                        >
                          {sceneBusy ? '✨…' : '✨ Go'}
                        </button>
                      )}
                    </>
                  )}
                  {snapshot.annotations.length > 0 && (
                    <button
                      className="btn tiny"
                      title="Clear my annotations"
                      onClick={() => map && clearAnnotations(map.id, true)}
                    >
                      Clear mine
                    </button>
                  )}
                  {isDm && snapshot.annotations.length > 0 && (
                    <button
                      className="btn tiny"
                      title="Clear everyone's annotations"
                      onClick={() => map && clearAnnotations(map.id, false)}
                    >
                      Clear all
                    </button>
                  )}
                  {isDm && snapshot.annotations.some((a) => a.kind === 'image') && (
                    <>
                      <button
                        className={`btn tiny ${decalsLocked ? 'on' : ''}`}
                        title={
                          decalsLocked
                            ? 'Decals locked: click-through and undraggable — click to unlock'
                            : 'Lock decals so they become click-through and undraggable'
                        }
                        onClick={toggleDecalsLocked}
                      >
                        {decalsLocked ? '🔒' : '🔓'} Decals
                      </button>
                      <button
                        className="btn tiny"
                        title="Remove all scenery decals on this map (strokes/text stay)"
                        onClick={() => map && clearAnnotations(map.id, false, 'image')}
                      >
                        Clear decals
                      </button>
                    </>
                  )}
                </div>
                {isDm && (
                  <>
                    <ScaleMenu
                      feetPerSquare={derivedFtPerSquare}
                      widthFt={widthFt}
                      gridPx={gridPx}
                      scaleMode={scaleMode}
                      matchMode={matchMode}
                      gridHidden={!!map?.gridHidden}
                      gridLocked={!!map?.gridLocked}
                      onCommit={(ft, width) => {
                        setWidthFt(width);
                        commitScaleFeet(ft, width);
                      }}
                      onToggleHidden={() =>
                        map &&
                        setMapGrid(map.id, gridPx, Math.round(derivedFtPerSquare) || 5, widthFt, {
                          hidden: !map.gridHidden,
                        })
                      }
                      onUnlock={() =>
                        map &&
                        setMapGrid(map.id, gridPx, Math.round(derivedFtPerSquare) || 5, widthFt, {
                          locked: false,
                        })
                      }
                      onToggleMatchMode={() => {
                        setTool(null);
                        setRemoveMode(false);
                        setScaleMode(false);
                        setScaleLine(null);
                        setScalePrompt(null);
                        setMatchMode((s) => !s);
                      }}
                      onToggleScaleMode={() => {
                        setTool(null);
                        setRemoveMode(false);
                        setMatchMode(false);
                        setScaleLine(null);
                        setScalePrompt(null);
                        setScaleMode((s) => !s);
                      }}
                    />
                    <FogMenu
                      mapFogEnabled={mapFogEnabled}
                      tokenFogEnabled={tokenFogEnabled}
                      paintLayer={paintLayer}
                      fogBrush={fogBrush}
                      brushSize={brushSize}
                      onToggleLayer={toggleLayer}
                      onSetPaintLayer={setPaintLayer}
                      onSetBrush={(b) => setFogBrush(b)}
                      onSetBrushSize={setBrushSize}
                      onCoverAll={() => map && coverFog(map.id, paintLayer)}
                      onRevealAll={() => revealAll(paintLayer)}
                    />
                    <TilesMenu
                      tiles={tiles}
                      arranging={tilesMode}
                      onToggleArrange={() => setTilesMode((t) => !t)}
                      onAddFile={addTileFromFile}
                      onReorder={reorderMapImage}
                      onRemove={removeMapImage}
                    />
                  </>
                )}
              </div>,
              toolSlot,
            )}
          <Stage
            key={dprKey}
            width={size.w}
            height={size.h}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            onMouseMove={handleMouseMove}
            onTouchMove={handleMouseMove}
            onMouseUp={handlePointerUp}
            onTouchEnd={handlePointerUp}
            onMouseLeave={() => {
              hideCursor();
              endStroke();
            }}
            onWheel={handleWheel}
            style={{
              cursor: onPlaceAt || fogActive || measureActive ? 'crosshair' : 'default',
            }}
          >
            <Layer
              ref={layerRef}
              x={view.x}
              y={view.y}
              scaleX={view.scale}
              scaleY={view.scale}
              draggable={panning}
              onDragEnd={handleLayerDragEnd}
            >
              {/* Pan-anywhere backdrop: a press off the map (or over a tile)
                  grabs this and drags the layer. Same colour as the off-map area. */}
              <Rect
                x={panBg.x}
                y={panBg.y}
                width={panBg.w}
                height={panBg.h}
                fill={CANVAS_BG}
              />
              {/* Base image at the origin, at its own natural size. */}
              {image && <KonvaImage image={image} width={baseW} height={baseH} />}
              {/* Extra image tiles (bottom-to-top by z). DM drags/resizes them in
                  arrange mode; otherwise they're inert map background. */}
              {tiles.map((t) => (
                <DecalImage
                  key={t.id}
                  url={t.imagePath}
                  x={t.x}
                  y={t.y}
                  width={t.w}
                  height={t.h}
                  draggable={isDm && tilesMode && !measureActive && !fogActive && !scaleMode}
                  handleSize={12 / view.scale}
                  // Tiles are part of the map: keep them listening so dragging
                  // over the area they add still PANS (bubbles to the layer),
                  // even when you're not arranging them.
                  alwaysListening
                  onMove={(x, y) => moveMapImage(t.id, x, y)}
                  onResize={(w, h) => resizeMapImage(t.id, t.x, t.y, w, h)}
                />
              ))}
              {!image && tiles.length === 0 && (
                <Rect width={imgW} height={imgH} fill="#2a2f3a" />
              )}
              {gridLines.map((pts, i) => (
                <Line
                  key={i}
                  points={pts}
                  stroke={gridHot ? '#ffffffcc' : '#ffffff5c'}
                  strokeWidth={gridHot ? 1.5 : 1}
                  listening={false}
                />
              ))}
              {/* Map fog: covered terrain. For players the cover is opaque and
                  EXACTLY the off-map backdrop colour (CANVAS_BG), so a covered
                  area is indistinguishable from empty space beyond the map — no
                  grid, image, or tell-tale darker rectangle leaks through. The DM
                  sees a translucent dark wash so they can still work under it. */}
              {mapFogEnabled && (
                <Shape
                  listening={false}
                  opacity={isDm ? 0.5 : 1}
                  sceneFunc={(ctx: Konva.Context) => {
                    ctx.fillStyle = isDm ? '#04060a' : CANVAS_BG;
                    // For the opaque player cover, overlap cells by 1px so the
                    // grid never bleeds through sub-pixel seams. (No overlap for
                    // the DM's translucent wash — it would darken at seams.)
                    const pad = isDm ? 0 : 1;
                    for (let c = colMin; c < colMax; c++) {
                      for (let r = rowMin; r < rowMax; r++) {
                        if (!mapRevealed.has(`${c},${r}`)) {
                          ctx.fillRect(
                            c * grid - pad,
                            r * grid - pad,
                            grid + pad * 2,
                            grid + pad * 2,
                          );
                        }
                      }
                    }
                  }}
                />
              )}
              {/* Token fog: a DM-only purple marker of where tokens are hidden
                  (players just don't receive those tokens). */}
              {tokenFogEnabled && isDm && (
                <Shape
                  listening={false}
                  opacity={0.35}
                  sceneFunc={(ctx: Konva.Context) => {
                    ctx.fillStyle = '#7a3df0';
                    for (let c = colMin; c < colMax; c++) {
                      for (let r = rowMin; r < rowMax; r++) {
                        if (!tokenRevealed.has(`${c},${r}`)) {
                          ctx.fillRect(c * grid, r * grid, grid, grid);
                        }
                      }
                    }
                  }}
                />
              )}
              {/* Image decals (scenery) sit UNDER tokens; the DM drags to
                  reposition / corner-drags to resize, removes one via the
                  eraser tool, and the 🔒 toggle makes them click-through. */}
              {snapshot.annotations
                .filter((a) => a.kind === 'image' && a.url)
                .map((a) => (
                  <DecalImage
                    key={a.id}
                    url={a.url!}
                    x={a.x ?? 0}
                    y={a.y ?? 0}
                    width={a.width ?? 100}
                    height={a.height ?? 100}
                    draggable={isDm && !measureActive && !decalsLocked}
                    handleSize={12 / view.scale}
                    // Players get the decorative 🛒 marker; the DM gets a clickable
                    // shop button instead (onEditShop), so don't double it up.
                    badge={!isDm && !!a.popup}
                    hasShop={!!a.popup}
                    onRemove={removeMode ? () => removeAnnotation(a.id) : undefined}
                    onMove={(x, y) => moveAnnotation(a.id, x, y)}
                    onResize={(w, h) => resizeAnnotation(a.id, w, h)}
                    // DM: the 🛒 add/edit button shows only while editing decals
                    // (UNLOCKED) so it never clutters the map during play. When
                    // LOCKED, a body click still opens the editor; players click a
                    // shop decal to view it read-only.
                    onEditShop={
                      isDm && !removeMode && !measureActive && !decalsLocked
                        ? () => openDecalPopup(a.id)
                        : undefined
                    }
                    onActivate={
                      removeMode || measureActive
                        ? undefined
                        : isDm
                          ? decalsLocked
                            ? () => openDecalPopup(a.id)
                            : undefined
                          : a.popup
                            ? () => openDecalPopup(a.id)
                            : undefined
                    }
                  />
                ))}
              <FootprintLayer
                tokens={snapshot.tokens}
                gridSizePx={grid}
                pxPerFoot={pxPerFoot}
              />
              {snapshot.tokens.map((t) => {
                const d = resolveToken(snapshot, t);
                // Players may drag only their side: PCs + friendly creatures,
                // never objects. Mirrors the server's token:move gate — without
                // this the drag succeeds locally (a ghost move on the player's
                // screen) even though the server rejects it.
                const movable =
                  isDm ||
                  t.kind === 'pc' ||
                  (d.disposition === 'friendly' && !d.objectKind);
                return (
                  <TokenShape
                    key={t.id}
                    token={t}
                    display={d}
                    gridSizePx={grid}
                    pxPerFoot={pxPerFoot}
                    draggable={
                      draggableTokens && movable && !fogActive && !measureActive && !saveResolve
                    }
                    listening={!measureActive}
                    selected={selectedIds.includes(t.id)}
                    activeTurn={t.id === activeTurnTokenId}
                    initiativeRank={initiativeRank.get(t.id) ?? null}
                    onSelect={handleTokenSelect}
                    onActivate={handleTokenActivate}
                    onMove={handleTokenMove}
                    onContextMenu={handleTokenMenu}
                    onHover={handleTokenHover}
                    onHoverEnd={handleTokenHoverEnd}
                    onDragActive={setDraggingToken}
                    onDragPreview={handleTokenDragPreview}
                  />
                );
              })}
              {/* Shared measuring shapes (persisted) + the live drag preview. */}
              {snapshot.measurements.map((m) => {
                // An emanation re-centres on its token's live position each frame.
                let origin = m.origin;
                let target = m.target;
                if (m.kind === 'emanation') {
                  const tok = m.tokenId
                    ? snapshot.tokens.find((t) => t.id === m.tokenId)
                    : undefined;
                  if (!tok) return null;
                  const radius = Math.hypot(m.target.x - m.origin.x, m.target.y - m.origin.y);
                  origin = { x: tok.x, y: tok.y };
                  target = { x: tok.x + radius, y: tok.y };
                }
                return (
                  <MeasureShape
                    key={m.id}
                    kind={m.kind}
                    origin={origin}
                    target={target}
                    color={rollerColor(m.createdBy)}
                    grid={grid}
                    feetPerPixel={fpp}
                    onRemove={removeMode ? () => removeMeasurement(m.id) : undefined}
                  />
                );
              })}
              {draft && (
                <MeasureShape
                  kind={draft.kind}
                  origin={draft.origin}
                  target={draft.target}
                  color="#ffd21a"
                  grid={grid}
                  feetPerPixel={fpp}
                />
              )}
              {/* Map annotations: freehand strokes + text labels (shared). */}
              {snapshot.annotations.filter((a) => a.kind !== 'image').map((a) =>
                a.kind === 'freehand' ? (
                  <Line
                    key={a.id}
                    points={a.points ?? []}
                    stroke={a.color}
                    strokeWidth={3 / view.scale}
                    lineCap="round"
                    lineJoin="round"
                    tension={0.3}
                    listening={false}
                  />
                ) : (
                  <Text
                    key={a.id}
                    x={a.x ?? 0}
                    y={a.y ?? 0}
                    text={a.text ?? ''}
                    fill={a.color}
                    fontSize={18 / view.scale}
                    fontStyle="bold"
                    listening={false}
                  />
                ),
              )}
              {penDraft && (
                <Line
                  points={penDraft}
                  stroke={annoColor}
                  strokeWidth={3 / view.scale}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              )}
              {/* matchMode: a live SQUARE preview (the cell you'll get) anchored
                  at the drag corner; scaleMode: a dashed reference ruler line. */}
              {scaleLine && matchMode
                ? (() => {
                    const dx = scaleLine.target.x - scaleLine.origin.x;
                    const dy = scaleLine.target.y - scaleLine.origin.y;
                    const s = Math.max(Math.abs(dx), Math.abs(dy));
                    return (
                      <Rect
                        x={dx >= 0 ? scaleLine.origin.x : scaleLine.origin.x - s}
                        y={dy >= 0 ? scaleLine.origin.y : scaleLine.origin.y - s}
                        width={s}
                        height={s}
                        stroke="#4fd1ff"
                        strokeWidth={Math.max(2, grid * 0.06)}
                        dash={[grid * 0.3, grid * 0.2]}
                        fill="#4fd1ff22"
                        listening={false}
                      />
                    );
                  })()
                : scaleLine && (
                    <Line
                      points={[
                        scaleLine.origin.x,
                        scaleLine.origin.y,
                        scaleLine.target.x,
                        scaleLine.target.y,
                      ]}
                      stroke="#4fd1ff"
                      strokeWidth={Math.max(2, grid * 0.06)}
                      dash={[grid * 0.3, grid * 0.2]}
                      listening={false}
                    />
                  )}
              {/* Live ghost tethers for tokens OTHERS are dragging. */}
              <DragGhostLayer
                ghosts={dragGhosts}
                tokens={snapshot.tokens}
                pxPerFoot={pxPerFoot}
                gridSizePx={grid}
              />
              {/* Chat bubbles over PC tokens (typing "•••" + spoken words). */}
              <SpeechBubbles
                typingChars={typingChars}
                sayBubbles={sayBubbles}
                tokens={snapshot.tokens}
                pxPerFoot={pxPerFoot}
                gridSizePx={grid}
              />
              {/* Floating ±X damage/heal numbers — topmost, click-through. */}
              <HpFxLayer
                floaters={hpFx}
                tokens={snapshot.tokens}
                pxPerFoot={pxPerFoot}
                gridSizePx={grid}
              />
              {/* Live "laser pointers" for everyone else on this map. */}
              {showCursors && (
                <CursorPointers cursors={cursors} currentMapId={map?.id} scale={view.scale} />
              )}
            </Layer>
          </Stage>
          <DecalPopup snapshot={snapshot} />
          {hover && !menu && (
            <TokenHoverCard
              snapshot={snapshot}
              token={hover.token}
              x={hover.x}
              y={hover.y}
            />
          )}
          {menu && (
            <FloatingMenu
              snapshot={snapshot}
              token={menu.token}
              attacker={floatingAttacker(
                snapshot,
                selectedIds,
                menu.token,
                isDm,
                mySocketId,
              )}
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
            />
          )}
          {mapOverlays}
          {saveResolve && (
            <div className="save-resolve-banner">
              <span>
                {saveResolve.save
                  ? `Apply ${saveResolve.label} — click targets to roll DC ${saveResolve.dc} ${saveResolve.save} saves`
                  : `Apply ${saveResolve.label} — click targets to apply damage`}
              </span>
              <button className="btn tiny" onClick={clearSaveResolve}>
                Done (Esc)
              </button>
            </div>
          )}
          {scaleMode && !scalePrompt && (
            <div className="scale-hint">Drag a line across a known distance…</div>
          )}
          {matchMode && (
            <div className="scale-hint">Drag across ONE square of the map's printed grid…</div>
          )}
          {pasteImg && (
            <div className="modal-backdrop" onClick={() => setPasteImg(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <h3>Paste image</h3>
                  <button className="btn tiny" onClick={() => setPasteImg(null)}>✕</button>
                </div>
                {/* Drag on the preview to select a crop; checkerboard shows
                    transparency after "Cut background". */}
                <div
                  className="paste-preview"
                  onMouseDown={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    cropStart.current = { x: e.clientX - r.left, y: e.clientY - r.top };
                    setCropSel(null);
                  }}
                  onMouseMove={(e) => {
                    const s = cropStart.current;
                    if (!s) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const cx = Math.max(0, Math.min(r.width, e.clientX - r.left));
                    const cy = Math.max(0, Math.min(r.height, e.clientY - r.top));
                    setCropSel({
                      x: Math.min(s.x, cx),
                      y: Math.min(s.y, cy),
                      w: Math.abs(cx - s.x),
                      h: Math.abs(cy - s.y),
                    });
                  }}
                  onMouseUp={() => {
                    cropStart.current = null;
                    setCropSel((c) => (c && c.w > 4 && c.h > 4 ? c : null));
                  }}
                  onMouseLeave={() => {
                    cropStart.current = null;
                  }}
                >
                  <img ref={pastePreviewRef} src={pasteImg.url} alt="pasted" draggable={false} />
                  {cropSel && (
                    <div
                      className="paste-crop-box"
                      style={{ left: cropSel.x, top: cropSel.y, width: cropSel.w, height: cropSel.h }}
                    />
                  )}
                </div>
                <div className="paste-tools">
                  <button
                    className="btn tiny"
                    disabled={!cropSel || pasteBusy}
                    title="Crop to the dragged selection"
                    onClick={async () => {
                      const img = pastePreviewRef.current;
                      if (!cropSel || !img) return;
                      // Preview px → natural px.
                      const f = pasteImg.w / img.clientWidth;
                      setPasteBusy(true);
                      try {
                        const next = await cropImage(pasteImg.url, {
                          x: cropSel.x * f,
                          y: cropSel.y * f,
                          w: cropSel.w * f,
                          h: cropSel.h * f,
                        });
                        setPasteImg(next);
                        setCropSel(null);
                      } catch {
                        notify('Crop failed.');
                      } finally {
                        setPasteBusy(false);
                      }
                    }}
                  >
                    ✂ Crop
                  </button>
                  <button
                    className="btn tiny"
                    disabled={pasteBusy}
                    title="Make the (flat) background transparent — flood-fills from the corners"
                    onClick={async () => {
                      setPasteBusy(true);
                      try {
                        setPasteImg(await removeBackground(pasteImg.url));
                        setCropSel(null);
                      } catch {
                        notify('Could not cut the background.');
                      } finally {
                        setPasteBusy(false);
                      }
                    }}
                  >
                    🪄 Cut background
                  </button>
                  {pasteOrig && pasteOrig.url !== pasteImg.url && (
                    <button
                      className="btn tiny"
                      disabled={pasteBusy}
                      onClick={() => {
                        setPasteImg(pasteOrig);
                        setCropSel(null);
                      }}
                    >
                      ↺ Undo edits
                    </button>
                  )}
                  <span className="muted">{pasteBusy ? 'working…' : 'drag preview to crop'}</span>
                </div>
                <label className="settings-field">
                  Name (for object)
                  <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Object" />
                </label>
                <div className="modal-actions">
                  <button
                    className="btn green"
                    onClick={() => {
                      if (!map) return;
                      // Place at the centre of the current view, in image space.
                      const cx = (size.w / 2 - view.x) / view.scale;
                      const cy = (size.h / 2 - view.y) / view.scale;
                      pasteObject({ mapId: map.id, x: cx, y: cy, icon: pasteImg.url, name: pasteName.trim() || 'Object' });
                      setPasteImg(null);
                    }}
                    title="Add as a draggable object token (image, unclipped)"
                  >
                    🪙 Object
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      if (!map) return;
                      const cx = (size.w / 2 - view.x) / view.scale;
                      const cy = (size.h / 2 - view.y) / view.scale;
                      // Clamp the decal to ~6 grid squares wide, keeping aspect.
                      const maxW = grid * 6;
                      const scale = pasteImg.w > maxW ? maxW / pasteImg.w : 1;
                      const w = pasteImg.w * scale;
                      const h = pasteImg.h * scale;
                      addAnnotation({
                        kind: 'image',
                        x: cx - w / 2,
                        y: cy - h / 2,
                        url: pasteImg.url,
                        width: w,
                        height: h,
                        color: '#ffffff',
                      });
                      setPasteImg(null);
                    }}
                    title="Add as flat scenery under the tokens (set dressing)"
                  >
                    🖼 Scenery decal
                  </button>
                  <button className="btn" onClick={() => setPasteImg(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {scalePrompt && (
            <div className="scale-prompt">
              <span>This line is</span>
              <input
                className="grid-input"
                type="number"
                autoFocus
                value={scaleFt}
                onChange={(e) => setScaleFt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyScaleFromLine()}
              />
              <span>ft</span>
              <button className="btn tiny" onClick={applyScaleFromLine}>
                Apply
              </button>
              <button
                className="btn tiny"
                onClick={() => {
                  setScaleMode(false);
                  setScaleLine(null);
                  setScalePrompt(null);
                  setScaleFt('');
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
