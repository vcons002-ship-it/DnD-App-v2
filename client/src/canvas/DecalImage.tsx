import { useEffect, useState } from 'react';
import { Label, Rect, Tag, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { MapArtwork } from './MapArtwork';
import { useImage } from './useImage';

/** A scenery image decal drawn under tokens. DM-draggable to reposition, with
 *  an aspect-locked corner handle to resize; click-through for players (and
 *  for the DM while a map tool is active or decals are locked). */
export function DecalImage({
  url,
  videoPath,
  onPlaybackError,
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
  videoPath?: string | null;
  onPlaybackError?: () => void;
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
      <MapArtwork
        url={url}
        videoPath={videoPath}
        onPlaybackError={onPlaybackError}
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
