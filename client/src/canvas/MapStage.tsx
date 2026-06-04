import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { StateSnapshot, Token } from '../../../shared/types';
import { useImage } from './useImage';
import { TokenShape } from './TokenShape';
import { resolveToken } from '../lib/entities';

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

  const handleStageClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
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

  // Pan by dragging empty canvas (disabled while placing a token).
  const panning = !onPlaceAt;
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
          </div>
          <Stage
            width={size.w}
            height={size.h}
            onMouseDown={handleStageClick}
            onTouchStart={handleStageClick}
            onWheel={handleWheel}
            style={{ cursor: onPlaceAt ? 'crosshair' : 'default' }}
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
              {snapshot.tokens.map((t) => (
                <TokenShape
                  key={t.id}
                  token={t}
                  display={resolveToken(snapshot, t)}
                  gridSizePx={grid}
                  draggable={draggableTokens}
                  selected={selectedIds.includes(t.id)}
                  activeTurn={t.id === activeTurnTokenId}
                  onSelect={onSelectToken}
                  onMove={(tok, x, y) => onMoveToken(tok.id, x, y)}
                />
              ))}
            </Layer>
          </Stage>
        </>
      )}
    </div>
  );
}
