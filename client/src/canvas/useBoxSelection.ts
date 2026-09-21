import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type Konva from 'konva';
import type { Token } from '../../../shared/types';
import { mapToScreen, projectGround, type BattlefieldView } from './miniatureProjection';

type Point = { x: number; y: number };
type Gesture = { start: Point; end: Point; pointerId: number; additive: boolean; clicked?: Token; element: HTMLDivElement };

/** Capture before Konva's pan/token handlers. Rectangle and base centres share
 * screen coordinates, including the tilted camera's perspective projection. */
export function useBoxSelection({ enabled, mapId, stageRef, tokens, selectedIds, onSelectTokens, onSelectToken, view, width, height, tilt }: {
  enabled: boolean;
  mapId?: string;
  stageRef: RefObject<Konva.Stage | null>;
  tokens: Token[];
  selectedIds: string[];
  onSelectTokens?: (ids: string[]) => void;
  onSelectToken: (token: Token | null, additive?: boolean) => void;
  view: BattlefieldView;
  width: number;
  height: number;
  tilt: number;
}) {
  const gesture = useRef<Gesture | null>(null);
  const [box, setBox] = useState<{ start: Point; end: Point } | null>(null);
  const cancel = () => {
    const old = gesture.current;
    gesture.current = null;
    setBox(null);
    if (old?.element.hasPointerCapture(old.pointerId)) old.element.releasePointerCapture(old.pointerId);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); cancel(); };
  }, [mapId]);
  const point = (event: PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
  };
  const handlers = {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (!enabled || !onSelectTokens || !event.ctrlKey || event.button !== 0 || event.pointerType !== 'mouse' ||
        !(event.target instanceof HTMLCanvasElement) || !event.target.closest('.konvajs-content')) return;
      event.preventDefault(); event.stopPropagation();
      const stage = stageRef.current;
      stage?.setPointersPositions(event.nativeEvent);
      const pointer = stage?.getPointerPosition();
      const node = pointer ? stage?.getIntersection(pointer)?.findAncestor('.token', true) : null;
      const start = point(event);
      gesture.current = { start, end: start, pointerId: event.pointerId, additive: event.shiftKey,
        clicked: tokens.find(t => t.id === node?.getAttr('tokenId')), element: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLDivElement>) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      current.end = point(event);
      if (Math.hypot(current.end.x - current.start.x, current.end.y - current.start.y) >= 4) setBox({ start: current.start, end: current.end });
    },
    onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const end = point(event);
      if (Math.hypot(end.x - current.start.x, end.y - current.start.y) < 4) {
        // Preserve the existing Ctrl-click toggle when no box was drawn.
        if (current.clicked) onSelectToken(current.clicked, true);
      } else {
        const left = Math.min(current.start.x, end.x), right = Math.max(current.start.x, end.x);
        const top = Math.min(current.start.y, end.y), bottom = Math.max(current.start.y, end.y);
        const ids = tokens.filter(token => {
          const ground = mapToScreen(token.x, token.y, view, tilt);
          const p = projectGround(ground.x, ground.y, width, height, tilt);
          return p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
        }).map(token => token.id);
        onSelectTokens?.(current.additive ? [...new Set([...selectedIds, ...ids])] : ids);
      }
      cancel();
    },
    onPointerCancelCapture: cancel,
    onLostPointerCapture: cancel,
    // Suppress compatibility mouse events, including after cancellation, while
    // the pointer gesture owns the canvas. Pointerdown preventDefault prevents
    // their generation in Chromium; this also guards browsers that emit them.
    onMouseDownCapture: (event: React.MouseEvent<HTMLDivElement>) => { if (gesture.current) { event.preventDefault(); event.stopPropagation(); } },
    onWheelCapture: (event: React.WheelEvent<HTMLDivElement>) => { if (gesture.current) event.stopPropagation(); },
  };
  return { handlers, box };
}
