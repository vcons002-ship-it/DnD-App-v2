import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Rect, Shape, Circle, Text } from 'react-konva';
import { rollerColor } from '../lib/rollStyle';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { FogLayer, StateSnapshot, Token } from '../../../shared/types';
import { useImage } from './useImage';
import { TokenShape } from './TokenShape';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { FloatingMenu } from '../components/FloatingMenu';
import { TokenHoverCard } from '../components/TokenHoverCard';
import { RollLogOverlay } from '../components/RollLogOverlay';

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

/** The off-map backdrop colour. MUST match `.center` in styles.css so covered
 *  map-fog cells blend seamlessly into the empty space beyond the map. */
const CANVAS_BG = '#0e0f12';

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** A single measuring shape (cone/circle/line) drawn in image-space, plus a
 *  distance label in feet. Non-listening so it never blocks token interaction. */
function MeasureShape({
  kind,
  origin,
  target,
  color,
  grid,
  feetPerSquare,
}: {
  kind: 'cone' | 'circle' | 'line';
  origin: Pt;
  target: Pt;
  color: string;
  grid: number;
  feetPerSquare: number;
}) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.hypot(dx, dy);
  const feet = Math.round((len / grid) * feetPerSquare);
  const stroke = Math.max(1.5, grid * 0.05);
  const fontSize = Math.max(11, grid * 0.34);

  let shape = null;
  if (kind === 'circle') {
    shape = (
      <Circle
        x={origin.x}
        y={origin.y}
        radius={len}
        stroke={color}
        strokeWidth={stroke}
        fill={color}
        opacity={0.18}
        listening={false}
      />
    );
  } else if (kind === 'line') {
    shape = (
      <Line
        points={[origin.x, origin.y, target.x, target.y]}
        stroke={color}
        strokeWidth={stroke}
        listening={false}
      />
    );
  } else if (len >= 1) {
    // 5e cone: an isosceles triangle whose base width equals its length.
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const bx = origin.x + ux * len;
    const by = origin.y + uy * len;
    const h = len / 2;
    shape = (
      <Line
        closed
        points={[origin.x, origin.y, bx + px * h, by + py * h, bx - px * h, by - py * h]}
        stroke={color}
        strokeWidth={stroke}
        fill={color}
        opacity={0.18}
        listening={false}
      />
    );
  }

  return (
    <>
      {shape}
      <Text
        x={target.x + 4}
        y={target.y + 4}
        text={`${feet} ft`}
        fontSize={fontSize}
        fill={color}
        stroke="#000"
        strokeWidth={0.5}
        listening={false}
      />
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
  const map = snapshot.map;
  const image = useImage(map?.imagePath ?? null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Natural map dimensions (fall back to a grid-sized blank canvas).
  const imgW = image?.naturalWidth ?? 1000;
  const imgH = image?.naturalHeight ?? 700;
  const grid = map?.gridSizePx ?? 50;

  // ---- Fog of war (two independent layers: map fog + token fog) ----
  const isDm = snapshot.role === 'dm';
  const showRollOverlay = useStore((s) => s.showRollOverlay);
  const setFogLayer = useStore((s) => s.setFogLayer);
  const paintFog = useStore((s) => s.paintFog);
  const coverFog = useStore((s) => s.coverFog);
  const setMapGrid = useStore((s) => s.setMapGrid);
  const addMeasurement = useStore((s) => s.addMeasurement);
  const clearMeasurements = useStore((s) => s.clearMeasurements);
  const [fogBrush, setFogBrush] = useState<'off' | 'reveal' | 'hide'>('off');
  const [paintLayer, setPaintLayer] = useState<FogLayer>('map');
  const [brushSize, setBrushSize] = useState(1); // cells per side (1,3,5)
  const cols = Math.max(1, Math.ceil(imgW / grid));
  const rows = Math.max(1, Math.ceil(imgH / grid));
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

  // ---- Measuring tools (cone/circle/line): shared, snap-to-grid, persistent ----
  const feetPerSquare = map?.feetPerSquare ?? 5;
  const [measureTool, setMeasureTool] = useState<'off' | 'cone' | 'circle' | 'line'>('off');
  const measureActive = measureTool !== 'off';
  const [draft, setDraft] = useState<{ origin: Pt; target: Pt } | null>(null);
  const drawingRef = useRef(false);
  const snapPt = (p: Pt): Pt => ({
    x: Math.round(p.x / grid) * grid,
    y: Math.round(p.y / grid) * grid,
  });

  // DM grid-size control (committed on blur/Enter; synced from the live map).
  const [gridPx, setGridPx] = useState(grid);
  const [gridFt, setGridFt] = useState(feetPerSquare);
  useEffect(() => setGridPx(grid), [grid]);
  useEffect(() => setGridFt(feetPerSquare), [feetPerSquare]);
  const commitGrid = () => {
    if (map) setMapGrid(map.id, gridPx, gridFt);
  };

  // Fit-to-window transform (the default / reset view).
  const fit = useMemo<View>(() => {
    const s = Math.min(size.w / imgW, size.h / imgH) || 1;
    return { scale: s, x: (size.w - imgW * s) / 2, y: (size.h - imgH * s) / 2 };
  }, [size, imgW, imgH]);

  const [view, setView] = useState<View>(fit);
  const userAdjusted = useRef(false);

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

  const gridLines = useMemo(() => {
    const lines: number[][] = [];
    for (let x = 0; x <= imgW; x += grid) lines.push([x, 0, x, imgH]);
    for (let y = 0; y <= imgH; y += grid) lines.push([0, y, imgW, y]);
    return lines;
  }, [imgW, imgH, grid]);

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
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const key = `${c},${r}`;
        if (strokeRef.current.has(key)) continue;
        strokeRef.current.add(key);
        fresh.push(key);
      }
    }
    if (fresh.length) paintFog(map.id, paintLayer, fresh, fogBrush === 'reveal');
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    if (measureActive) {
      const pos = pointerToImage(stage);
      if (pos) {
        drawingRef.current = true;
        const s = snapPt(pos);
        setDraft({ origin: s, target: s });
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
    // places a pending spawn, or otherwise deselects.
    const pos = pointerToImage(stage);
    if (onPlaceAt && pos) {
      onPlaceAt(pos.x, pos.y);
      return;
    }
    onSelectToken(null);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (measureActive && drawingRef.current) {
      const stage = e.target.getStage();
      const pos = stage ? pointerToImage(stage) : null;
      if (pos) setDraft((d) => (d ? { ...d, target: snapPt(pos) } : d));
      return;
    }
    if (!fogActive || !paintingRef.current) return;
    const stage = e.target.getStage();
    if (stage) emitFogCell(stage);
  };

  const endStroke = () => {
    // Commit a measuring shape on release (if it has any size).
    if (drawingRef.current) {
      drawingRef.current = false;
      if (draft && measureTool !== 'off') {
        const len = Math.hypot(
          draft.target.x - draft.origin.x,
          draft.target.y - draft.origin.y,
        );
        if (len >= grid * 0.25) {
          addMeasurement({ kind: measureTool, origin: draft.origin, target: draft.target });
        }
      }
      setDraft(null);
      return;
    }
    paintingRef.current = false;
  };

  const allCells = (): string[] => {
    const all: string[] = [];
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) all.push(`${c},${r}`);
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

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const oldScale = view.scale;
    const factor = e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
    const newScale = clamp(oldScale * factor, fit.scale * 0.25, fit.scale * 12);
    // Keep the point under the cursor stationary while zooming.
    const mx = (pointer.x - view.x) / oldScale;
    const my = (pointer.y - view.y) / oldScale;
    userAdjusted.current = true;
    setView({
      scale: newScale,
      x: pointer.x - mx * newScale,
      y: pointer.y - my * newScale,
    });
  };

  // Pan by dragging empty canvas (disabled while placing or painting fog).
  const panning = !onPlaceAt && !fogActive && !measureActive;
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
            <button className="btn tiny" onClick={resetView} title="Fit to window">
              Fit
            </button>
            <span className="zoom-label">{Math.round(view.scale * 100)}%</span>

            {/* Measuring tools — available to everyone; shapes are shared. */}
            <span className="ctrl-sep" />
            <span className="zoom-label">Measure:</span>
            <button
              className={`btn tiny ${measureTool === 'cone' ? 'on' : ''}`}
              onClick={() => setMeasureTool((t) => (t === 'cone' ? 'off' : 'cone'))}
              title="Cone (drag from the caster to aim)"
            >
              △ Cone
            </button>
            <button
              className={`btn tiny ${measureTool === 'circle' ? 'on' : ''}`}
              onClick={() => setMeasureTool((t) => (t === 'circle' ? 'off' : 'circle'))}
              title="Circle / radius (drag from the centre)"
            >
              ◯ Circle
            </button>
            <button
              className={`btn tiny ${measureTool === 'line' ? 'on' : ''}`}
              onClick={() => setMeasureTool((t) => (t === 'line' ? 'off' : 'line'))}
              title="Line / ruler (drag end to end)"
            >
              📏 Line
            </button>
            {snapshot.measurements.length > 0 && (
              <button
                className="btn tiny"
                onClick={() => map && clearMeasurements(map.id, !isDm)}
                title={isDm ? 'Clear all measurements' : 'Clear your measurements'}
              >
                Clear{isDm ? ' all' : ''}
              </button>
            )}

            {isDm && (
              <>
                <span className="ctrl-sep" />
                <span className="zoom-label">Grid:</span>
                <input
                  className="grid-input"
                  type="number"
                  value={gridPx}
                  onChange={(e) => setGridPx(Number(e.target.value))}
                  onBlur={commitGrid}
                  onKeyDown={(e) => e.key === 'Enter' && commitGrid()}
                  title="Grid cell size in pixels"
                />
                <span className="zoom-label">px ·</span>
                <input
                  className="grid-input"
                  type="number"
                  value={gridFt}
                  onChange={(e) => setGridFt(Number(e.target.value))}
                  onBlur={commitGrid}
                  onKeyDown={(e) => e.key === 'Enter' && commitGrid()}
                  title="Feet represented by one square"
                />
                <span className="zoom-label">ft/sq</span>
                <span className="ctrl-sep" />
                <span className="zoom-label">Fog:</span>
                <button
                  className={`btn tiny ${mapFogEnabled ? 'on' : ''}`}
                  onClick={() => toggleLayer('map')}
                  title="Black out terrain under fog for players"
                >
                  Map
                </button>
                <button
                  className={`btn tiny ${tokenFogEnabled ? 'on' : ''}`}
                  onClick={() => toggleLayer('tokens')}
                  title="Hide only tokens under fog; terrain stays visible"
                >
                  Tokens
                </button>
                {(mapFogEnabled || tokenFogEnabled) && (
                  <>
                    <span className="ctrl-sep" />
                    <span className="zoom-label">Paint:</span>
                    <button
                      className={`btn tiny ${paintLayer === 'map' ? 'on' : ''}`}
                      onClick={() => setPaintLayer('map')}
                      disabled={!mapFogEnabled}
                      title="Brush affects the map-fog layer"
                    >
                      Map
                    </button>
                    <button
                      className={`btn tiny ${paintLayer === 'tokens' ? 'on' : ''}`}
                      onClick={() => setPaintLayer('tokens')}
                      disabled={!tokenFogEnabled}
                      title="Brush affects the token-fog layer"
                    >
                      Tokens
                    </button>
                    <span className="ctrl-sep" />
                    <button
                      className={`btn tiny ${fogBrush === 'reveal' ? 'on' : ''}`}
                      onClick={() =>
                        setFogBrush((b) => (b === 'reveal' ? 'off' : 'reveal'))
                      }
                    >
                      Reveal
                    </button>
                    <button
                      className={`btn tiny ${fogBrush === 'hide' ? 'on' : ''}`}
                      onClick={() =>
                        setFogBrush((b) => (b === 'hide' ? 'off' : 'hide'))
                      }
                    >
                      Hide
                    </button>
                    {[1, 3, 5].map((n) => (
                      <button
                        key={n}
                        className={`btn tiny ${brushSize === n ? 'on' : ''}`}
                        onClick={() => setBrushSize(n)}
                        title={`Brush ${n}×${n}`}
                      >
                        {n}×
                      </button>
                    ))}
                    <button
                      className="btn tiny"
                      onClick={() => map && coverFog(map.id, paintLayer)}
                      title="Re-cover everything on the painted layer"
                    >
                      Cover all
                    </button>
                    <button
                      className="btn tiny"
                      onClick={() => revealAll(paintLayer)}
                    >
                      Reveal all
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          <Stage
            width={size.w}
            height={size.h}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            onMouseMove={handleMouseMove}
            onTouchMove={handleMouseMove}
            onMouseUp={endStroke}
            onTouchEnd={endStroke}
            onMouseLeave={endStroke}
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
              {image ? (
                <KonvaImage image={image} width={imgW} height={imgH} />
              ) : (
                <Rect width={imgW} height={imgH} fill="#2a2f3a" />
              )}
              {gridLines.map((pts, i) => (
                <Line key={i} points={pts} stroke="#ffffff22" strokeWidth={1} />
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
                    for (let c = 0; c < cols; c++) {
                      for (let r = 0; r < rows; r++) {
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
                    for (let c = 0; c < cols; c++) {
                      for (let r = 0; r < rows; r++) {
                        if (!tokenRevealed.has(`${c},${r}`)) {
                          ctx.fillRect(c * grid, r * grid, grid, grid);
                        }
                      }
                    }
                  }}
                />
              )}
              {snapshot.tokens.map((t) => (
                <TokenShape
                  key={t.id}
                  token={t}
                  display={resolveToken(snapshot, t)}
                  gridSizePx={grid}
                  draggable={draggableTokens && !fogActive && !measureActive}
                  selected={selectedIds.includes(t.id)}
                  activeTurn={t.id === activeTurnTokenId}
                  initiativeRank={initiativeRank.get(t.id) ?? null}
                  onSelect={onSelectToken}
                  onMove={(tok, x, y) => onMoveToken(tok.id, x, y)}
                  onContextMenu={(tok, cx, cy) => {
                    setHover(null);
                    setMenu({ token: tok, x: cx, y: cy });
                  }}
                  onHover={(tok, cx, cy) =>
                    setHover({ token: tok, x: cx, y: cy })
                  }
                  onHoverEnd={() => setHover(null)}
                />
              ))}
              {/* Shared measuring shapes (persisted) + the live drag preview. */}
              {snapshot.measurements.map((m) => (
                <MeasureShape
                  key={m.id}
                  kind={m.kind}
                  origin={m.origin}
                  target={m.target}
                  color={rollerColor(m.createdBy)}
                  grid={grid}
                  feetPerSquare={feetPerSquare}
                />
              ))}
              {draft && measureTool !== 'off' && (
                <MeasureShape
                  kind={measureTool}
                  origin={draft.origin}
                  target={draft.target}
                  color="#ffd21a"
                  grid={grid}
                  feetPerSquare={feetPerSquare}
                />
              )}
            </Layer>
          </Stage>
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
              attacker={
                snapshot.tokens.find(
                  (t) => selectedIds.includes(t.id) && t.id !== menu.token.id,
                ) ?? null
              }
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
            />
          )}
          {showRollOverlay && <RollLogOverlay rollLog={snapshot.rollLog} />}
        </>
      )}
    </div>
  );
}
