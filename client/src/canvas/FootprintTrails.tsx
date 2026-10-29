import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Path, Image as KonvaImage } from 'react-konva';
import {footstepLayout} from './footstepLayout';
import {tokenMoveDuration, tokenMoveProgress} from './tokenMotion';
import type { Token } from '../../../shared/types';

export type FootprintMark = {id:string;tokenId:string;x:number;y:number;angle:number;foot:number;side:number;opacity:number};
export const BOOT_SHAPE = 'M -.12 -.17 C .02 -.18 .15 -.25 .34 -.22 C .56 -.21 .61 -.11 .60 .02 C .59 .18 .45 .24 .26 .22 L -.09 .15 Q -.19 .02 -.12 -.17 Z M -.24 -.16 L -.49 -.15 Q -.57 0 -.49 .15 L -.24 .15 Z';
export const BOOT_TREAD = 'M .22 -.17 L .20 .17 M .36 -.16 L .34 .16 M .49 -.11 L .47 .10 M -.40 -.10 L -.40 .10';

/** A single move: a fading line of footprints from a token's old spot to its new one. */
type Trail = {
  id: string;
  tokenId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  /** Token footprint width in feet — sizes the prints to the creature. */
  widthFt: number;
  /** Footprint count for this move (derived from its length → constant spacing). */
  n: number;
  steps: ReturnType<typeof footstepLayout>;
  duration: number;
  /** When set, the whole trail fades out by this time (bumped past the cap). */
  expireAt?: number;
};

// Local-only ground marks: a soft hold, then an oldest-first fade.
const HOLD = 4000;
const STAGGER = 70;
const FADE = 2600;
const BASE = .92;
const MAX_TRAILS = 6;
const EXPIRE_FADE = 900;
const TICK_MS = 32;

const lifetimeOf = (t: Trail) => t.duration + HOLD + (t.n - 1) * STAGGER + FADE;
const alive = (t: Trail, at: number) =>
  t.expireAt != null ? at < t.expireAt : at - t.start < lifetimeOf(t);

/** Alternating boot impressions deposited behind committed movement. */
export function FootprintLayer({
  tokens,
  pxPerFoot,
  isVisibleAt,
  onMarks,
  renderFallback = true,
  compact = false,
  movementDurationMs,
  visualPosition,
}: {
  tokens: Token[];
  pxPerFoot: number;
  isVisibleAt?: (id:string,x:number,y:number)=>boolean;
  onMarks?: (marks:FootprintMark[])=>void;
  renderFallback?: boolean;
  /** Legacy: bounded stamps on a separate layer, with a slower fade clock. */
  compact?: boolean;
  movementDurationMs?: number;
  visualPosition?: (id:string)=>{x:number;y:number}|undefined;
}) {
  const [trails, setTrails] = useState<Trail[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const prevPos = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Diff token positions across snapshots → a real move leaves a fresh trail.
  useEffect(() => {
    const nextPos = new Map<string, { x: number; y: number }>();
    const fresh: Trail[] = [];
    const t0 = Date.now();
    for (const t of tokens) {
      const prev = prevPos.current.get(t.id);
      nextPos.set(t.id, { x: t.x, y: t.y });
      const moved = prev ? Math.hypot(t.x - prev.x, t.y - prev.y) : 0;
      const steps = footstepLayout(moved, t.widthFt, pxPerFoot);
      if (prev && steps.length && !t.leavesNoTracks && !(t.teleportedAt && t0-t.teleportedAt<1000)) {
        fresh.push({
          id: `${t.id}-${t0}`,
          tokenId: t.id,
          from: prev,
          to: { x: t.x, y: t.y },
          start: t0,
          widthFt: t.widthFt,
          n: steps.length,
          steps,
          duration: movementDurationMs??tokenMoveDuration(moved, pxPerFoot),
        });
      }
    }
    prevPos.current = nextPos;
    if (!fresh.length) return;
    setNow(t0);
    setTrails((cur) => {
      let next = [...cur, ...fresh];
      // Cap the active (non-expiring) trails; bump the oldest excess into a
      // short graceful fade-out instead of dropping them instantly.
      const active = next.filter((t) => t.expireAt == null);
      const limit=compact?2:MAX_TRAILS;
      if (active.length > limit) {
        const bumped = new Set(
          active.slice(0, active.length - limit).map((t) => t.id),
        );
        next = next.map((t) =>
          bumped.has(t.id) ? { ...t, expireAt: t0 + EXPIRE_FADE } : t,
        );
      }
      return next.slice(-12);
    });
  }, [tokens, pxPerFoot, compact, movementDurationMs]);

  // Self-tick the fade and prune fully-gone trails while any is still alive.
  const anyLive = trails.some((t) => alive(t, Date.now()));
  useEffect(() => {
    if (!anyLive) return;
    const iv = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setTrails((cur) => cur.filter((t) => alive(t, at)));
    }, compact?100:TICK_MS);
    return () => clearInterval(iv);
  }, [anyLive,compact]);

  const marks:FootprintMark[] = trails.flatMap((tr) => {
        const dx = tr.to.x - tr.from.x;
        const dy = tr.to.y - tr.from.y;
        const len = Math.hypot(dx, dy) || 1;
        const perpX = -dy / len; // perpendicular, to offset left/right feet
        const perpY = dx / len;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const elapsed = now - tr.start;
        const capFade =
          tr.expireAt != null
            ? Math.max(0, Math.min(1, (tr.expireAt - now) / EXPIRE_FADE))
            : 1;
        const scale = Math.max(.3, Math.min(4, tr.widthFt / 5));
        const foot = Math.max(1, pxPerFoot * scale * 1.3);
        const spread = foot * .42;
        const n = tr.n;
        const marks:FootprintMark[] = [];
        const position=visualPosition?.(tr.tokenId);
        const progress=elapsed>=tr.duration?1:position?Math.max(0,Math.min(1,((position.x-tr.from.x)*dx+(position.y-tr.from.y)*dy)/(len*len))):tr.duration?tokenMoveProgress(elapsed,tr.duration):1;
        for (let i = 0; i < n; i++) {
          // The whole trail holds at BASE for HOLD ms, then prints fade oldest-first.
          const {fraction: f, side} = tr.steps[i];
          // Do not show a footfall ahead of the moving figure.
          if (f > progress) continue;
          const localT = elapsed - tr.duration - HOLD - i * STAGGER;
          const natural = localT < 0 ? BASE : BASE * (1 - localT / FADE);
          const op = Math.max(0, natural) * capFade;
          if (op <= 0) continue;
          const x=tr.from.x+dx*f+perpX*spread*side,y=tr.from.y+dy*f+perpY*spread*side;
          if(isVisibleAt&&!isVisibleAt(tr.tokenId,x,y))continue;
          marks.push({id:`${tr.id}-${i}`,tokenId:tr.tokenId,x,y,angle:angle+side*6,foot,side,opacity:op});
        }
        return marks;
      }).slice(compact?-96:0);
  const stamp=useMemo(()=>{
    if(!compact)return undefined;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const c=canvas.getContext('2d')!;c.translate(64,64);c.scale(96,96);
    c.fillStyle='#fff3d8';c.strokeStyle='#181b20';c.lineWidth=.085;
    const shape=new Path2D(BOOT_SHAPE);c.fill(shape);c.stroke(shape);
    c.strokeStyle='#514c43';c.lineWidth=.055;c.globalAlpha=.8;c.stroke(new Path2D(BOOT_TREAD));return canvas;
  },[compact]);
  useEffect(()=>{onMarks?.(marks);},[trails,now,pxPerFoot,isVisibleAt,onMarks,renderFallback]);
  useEffect(()=>()=>onMarks?.([]),[onMarks]);
  return <>{renderFallback&&marks.map(m=>stamp?<KonvaImage key={m.id} name="footstep" tokenId={m.tokenId} image={stamp} x={m.x} y={m.y} rotation={m.angle} offsetX={64} offsetY={64} scaleX={m.foot/96} scaleY={m.foot*m.side/96} opacity={m.opacity} listening={false} perfectDrawEnabled={false}/>:<Group key={m.id} name="footstep" x={m.x} y={m.y}
    rotation={m.angle} scaleX={m.foot} scaleY={m.foot*m.side} opacity={m.opacity} listening={false}>
    <Path data={BOOT_SHAPE} fill="#fff3d8" stroke="#181b20" strokeWidth={.085}/>
    <Path data={BOOT_TREAD} stroke="#514c43" strokeWidth={.055} opacity={.8}/>
  </Group>)}</>;
}
