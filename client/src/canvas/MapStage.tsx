import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Rect, Shape } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { StateSnapshot, Token } from '../../../shared/types';
import { useImage } from './useImage';
import { TokenShape } from './TokenShape';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { FloatingMenu } from '../components/FloatingMenu';
import { TokenHoverCard } from '../components/TokenHoverCard';

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

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

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

  // ---- Fog of war ----
  const isDm = snapshot.role === 'dm';
  const setFogMode = useStore((s) => s.setFogMode);
  const paintFog = useStore((s) => s.paintFog);
  const coverFog = useStore((s) => s.coverFog);
  const [fogBrush, setFogBrush] = useState<'off' | 'reveal' | 'hide'>('off');
  const [brushSize, setBrushSize] = useState(1); // cells per side (1,3,5)
  const cols = Math.max(1, Math.ceil(imgW / grid));
  const rows = Math.max(1, Math.ceil(imgH / grid));
  const fogMode = map?.fogMode ?? 'off';
  const fogOn = fogMode !== 'off';
  const revealedSet = useMemo(
    () => new Set(map?.fogRevealed ?? []),
    [map?.fogRevealed],
  );
  const fogActive = isDm && fogOn && fogBrush !== 'off';
  const paintingRef = useRef(false);
  const strokeRef = useRef<Set<string>>(new Set());

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
    if (fresh.length) paintFog(map.id, fresh, fogBrush === 'reveal');
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
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
    if (!fogActive || !paintingRef.current) return;
    const stage = e.target.getStage();
    if (stage) emitFogCell(stage);
  };

  const endStroke = () => {
    paintingRef.current = false;
  };

  const revealAll = () => {
    if (!map) return;
    const all: string[] = [];
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) all.push(`${c},${r}`);
    paintFog(map.id, all, true);
  };

  const chooseFogMode = (mode: 'off' | 'map' | 'tokens') => {
    if (!map) return;
    setFogMode(map.id, mode);
    if (mode === 'off') setFogBrush('off');
    // 'tokens' fog reads best starting fully visible (DM hides spots), whereas
    // 'map' fog starts covered (DM reveals). Seed the sensible default once.
    if (mode === 'tokens' && revealedSet.size === 0) revealAll();
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
  const panning = !onPlaceAt && !fogActive;
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
            {isDm && (
              <>
                <span className="ctrl-sep" />
                <span className="zoom-label">Fog:</span>
                <button
                  className={`btn tiny ${fogMode === 'off' ? 'on' : ''}`}
                  onClick={() => chooseFogMode('off')}
                  title="No fog"
                >
                  Off
                </button>
                <button
                  className={`btn tiny ${fogMode === 'map' ? 'on' : ''}`}
                  onClick={() => chooseFogMode('map')}
                  title="Hide the map and tokens under fog"
                >
                  Map
                </button>
                <button
                  className={`btn tiny ${fogMode === 'tokens' ? 'on' : ''}`}
                  onClick={() => chooseFogMode('tokens')}
                  title="Hide only tokens; map stays visible"
                >
                  Tokens
                </button>
                {fogOn && (
                  <>
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
                      onClick={() => map && coverFog(map.id)}
                      title="Re-cover everything"
                    >
                      Cover all
                    </button>
                    <button className="btn tiny" onClick={revealAll}>
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
            style={{ cursor: onPlaceAt || fogActive ? 'crosshair' : 'default' }}
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
              {fogOn && (fogMode === 'map' || isDm) && (
                <Shape
                  listening={false}
                  opacity={fogMode === 'map' ? (isDm ? 0.5 : 1) : 0.35}
                  sceneFunc={(ctx: Konva.Context) => {
                    // 'map' fog blacks out the terrain; 'tokens' fog is a
                    // DM-only purple marker showing where tokens are hidden.
                    ctx.fillStyle = fogMode === 'map' ? '#04060a' : '#7a3df0';
                    for (let c = 0; c < cols; c++) {
                      for (let r = 0; r < rows; r++) {
                        if (!revealedSet.has(`${c},${r}`)) {
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
                  draggable={draggableTokens && !fogActive}
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
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
