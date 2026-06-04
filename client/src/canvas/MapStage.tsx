import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { StateSnapshot, Token } from '../../../shared/types';
import { useImage } from './useImage';
import { TokenShape } from './TokenShape';
import { resolveToken } from '../lib/entities';

type Props = {
  snapshot: StateSnapshot;
  draggableTokens: boolean;
  selectedTokenId: string | null;
  activeTurnTokenId: string | null;
  onSelectToken: (token: Token | null) => void;
  onMoveToken: (tokenId: string, x: number, y: number) => void;
  /** When set (DM placing a unit), a map click reports image-space coords. */
  onPlaceAt?: (x: number, y: number) => void;
};

export function MapStage({
  snapshot,
  draggableTokens,
  selectedTokenId,
  activeTurnTokenId,
  onSelectToken,
  onMoveToken,
  onPlaceAt,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  const { scale, offsetX, offsetY } = useMemo(() => {
    const s = Math.min(size.w / imgW, size.h / imgH) || 1;
    return {
      scale: s,
      offsetX: (size.w - imgW * s) / 2,
      offsetY: (size.h - imgH * s) / 2,
    };
  }, [size, imgW, imgH]);

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

  const handleStageClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Click on empty space: deselect, or place a pending spawn.
    if (e.target === e.target.getStage()) {
      const stage = e.target.getStage();
      const p = stage?.getPointerPosition();
      if (p && onPlaceAt) {
        onPlaceAt((p.x - offsetX) / scale, (p.y - offsetY) / scale);
      } else {
        onSelectToken(null);
      }
    }
  };

  return (
    <div className="stage-wrap" ref={containerRef}>
      {!map && <div className="stage-empty">No active map yet.</div>}
      {map && (
        <Stage
          width={size.w}
          height={size.h}
          onMouseDown={handleStageClick}
          onTouchStart={handleStageClick}
          style={{ cursor: onPlaceAt ? 'crosshair' : 'default' }}
        >
          <Layer x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
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
                selected={t.id === selectedTokenId}
                activeTurn={t.id === activeTurnTokenId}
                onSelect={onSelectToken}
                onMove={(tok, x, y) => onMoveToken(tok.id, x, y)}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
