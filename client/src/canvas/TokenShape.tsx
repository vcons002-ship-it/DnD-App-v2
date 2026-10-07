import {difficultTravel} from '../../../shared/advancedSpells';
import {mirrorImageCount,MIRROR_IMAGE_SPREAD} from '../../../shared/linkedSpells';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {stopAtWalls,wallCollisionRadiusFt,type MapWall} from '../../../shared/mapWalls';
import {
  Group,
  Circle,
  Rect,
  RegularPolygon,
  Line,
  Shape,
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
import { facingAfterMove } from '../../../shared/tokenFacing';
import { moveDistanceFt, tokenMoveDuration, tokenMoveProgress } from './tokenMotion';
import type {TokenPresentation} from './tokenPresentation';

const isImageIcon = (icon: string): boolean =>
  icon.startsWith('/') || icon.startsWith('http');

/** Battlefield disposition dot colours. */
export const DISPOSITION_HEX: Record<string, string> = {
  friendly: '#39c46b',
  neutral: '#f5c518',
  enemy: '#e23b3b',
};

type Props = {
  token: Token;
  presentation?: TokenPresentation;
  sharedDarkvision?: boolean;
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
  /** Replaces the portrait; the name, health and base hit region stay live. */
  miniatureReady?: boolean;
  miniaturePending?: boolean;
  hideAffinity?: boolean;
  viewRotation?: number;
  miniatureDiameterFt?: number;
  movementWalls?: readonly MapWall[];
  /** A hint, rather than a hard cap; the table handles accumulated movement. */
  movementAllowanceFt?: number;
  terrainZones?: readonly {x:number;y:number;radiusFt:number}[];
  onSelect: (token: Token, additive: boolean) => void;
  /** Double-click / double-tap — select + expand the player's details panel. */
  onActivate?: (token: Token) => void;
  onMove: (token: Token, x: number, y: number, placed?: (p: {x:number;y:number}) => void) => void;
  /** Right-click / long-press — opens the floating action menu at screen coords. */
  onContextMenu?: (token: Token, clientX: number, clientY: number) => void;
  /** Pointer hover over the token (desktop) — drives the hover card. */
  onHover?: (token: Token, clientX: number, clientY: number) => void;
  onHoverEnd?: (token: Token) => void;
  /** Signals drag start/stop so the map can brighten the grid while a token moves. */
  onDragActive?: (active: boolean) => void;
  /** Private to this browser. A null point removes the planning figure. */
  onDragPreview?: (token: Token, point: {x:number;y:number;facing:number} | null) => void;
  /** Local WebGL position, without a React render or network throttle. */
  onVisualMove?: (token: Token, x: number, y: number, finished: boolean) => void;
  /** Keep the whole token/HUD concealed when its live anchor enters fog. */
  isVisibleAt?: (id: string, x: number, y: number) => boolean;
};

const isAdditive = (e: KonvaEventObject<Event>): boolean => {
  const evt = e.evt as MouseEvent;
  return !!(evt.shiftKey || evt.ctrlKey || evt.metaKey);
};

function TokenShapeInner({
  token,
  presentation,
  sharedDarkvision=false,
  display,
  gridSizePx,
  pxPerFoot,
  draggable,
  selected,
  activeTurn,
  initiativeRank,
  listening = true,
  miniatureReady = false,
  miniaturePending = false,
  hideAffinity = false,
  viewRotation = 0,
  miniatureDiameterFt,
  movementWalls,
  movementAllowanceFt,
  terrainZones,
  onSelect,
  onActivate,
  onMove,
  onContextMenu,
  onHover,
  onHoverEnd,
  onDragActive,
  onDragPreview,
  onVisualMove,
  isVisibleAt,
}: Props) {
  // Real-world footprint: width in feet → pixels. Independent of the visual grid,
  // so changing only the grid cell size never rescales a token.
  const radius = (((miniatureReady || miniaturePending) ? miniatureDiameterFt ?? token.widthFt : token.widthFt) * pxPerFoot) / 2;
  const auras = presentAuras(display.conditions.filter(c=>!c.id.startsWith("spell-mark:") || !/hunter.s mark/i.test(c.label)));
  const fill = token.kind === 'pc' ? '#2d6cdf' : '#b1432f';
  const hasImageIcon = !!display.icon && isImageIcon(display.icon);
  const hasEmojiIcon = !!display.icon && !hasImageIcon;
  const iconImg = useImage(hasImageIcon ? display.icon : null);
  const hpFrac =
    display.maxHp && display.maxHp > 0 && display.curHp !== undefined
      ? Math.max(0, Math.min(1, display.curHp / display.maxHp))
      : null;
  // PCs at zero HP are downed, not dead. The resolver preserves public enemy
  // death flags and recognizes PCs only after three failures or a Dead mark.
  const isDead = display.dead === true;

  // The drag handle follows the pointer, but its art stays at the committed
  // origin. Only the private shadow travels until a server snapshot commits.
  const tokenNode = useRef<Konva.Group>(null);
  const tokenArt = useRef<Konva.Group>(null);
  const tokenBody = useRef<Konva.Group>(null);
  const dragOverlay = useRef<Konva.Group>(null);
  const previewBase = useRef<Konva.Group>(null);
  const previewArrow = useRef<Konva.Line>(null);
  const tether = useRef<Konva.Line>(null);
  const distText = useRef<Konva.Text>(null);
  const motion = useRef(0);
  const pose = useRef({x:token.x,y:token.y});
  const committed = useRef({x:token.x,y:token.y});
  const dragging = useRef(false);
  const cancelled = useRef(false);
  const latest = useRef({token,onVisualMove,onDragPreview,onDragActive,isVisibleAt});
  latest.current = {token,onVisualMove,onDragPreview,onDragActive,isVisibleAt};

  const clearPreview = () => {
    dragOverlay.current?.visible(false);
    tokenArt.current?.position({x:0,y:0});
    onDragPreview?.(token,null);
    onDragActive?.(false);
    dragging.current=false;
  };
  const cancelDrag = () => {
    if(!dragging.current)return;
    cancelled.current=true;
    tokenNode.current?.stopDrag();
    clearPreview();
    tokenNode.current?.position(committed.current);
    tokenNode.current?.getLayer()?.batchDraw();
  };

  // Every viewer animates authoritative moves, including collision corrections.
  // Layout effects restore the previous painted pose before React's new x/y can
  // appear. The same frame drives the base, HUD, name depth mask and 3D model.
  useLayoutEffect(() => {
    const node=tokenNode.current;
    if(!node)return;
    const destination={x:token.x,y:token.y};
    if(presentation){
      if(dragging.current&&(destination.x!==committed.current.x||destination.y!==committed.current.y))cancelDrag();
      committed.current=destination;pose.current=presentation.position(token.id)??destination;
      node.position(pose.current);return;
    }
    if(destination.x===committed.current.x && destination.y===committed.current.y)return;
    if(dragging.current)cancelDrag();
    committed.current=destination;
    cancelAnimationFrame(motion.current);
    const from={...pose.current};
    const duration=window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0
      : tokenMoveDuration(Math.hypot(destination.x-from.x,destination.y-from.y),pxPerFoot);
    const start=performance.now();
    const paint=(now:number)=>{
      const t=duration ? tokenMoveProgress(now-start,duration) : 1;
      const p={x:from.x+(destination.x-from.x)*t,y:from.y+(destination.y-from.y)*t};
      pose.current=p;node.position(p);
      const live=latest.current;
      node.opacity(live.isVisibleAt?.(token.id,p.x,p.y)===false ? 0 : live.token.isHidden ? .45 : 1);
      live.onVisualMove?.(live.token,p.x,p.y,t===1);
      node.getLayer()?.batchDraw();
      motion.current=t<1 ? requestAnimationFrame(paint) : 0;
    };
    paint(start);
  },[token.x,token.y,pxPerFoot,presentation]);

  useEffect(()=>{
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')cancelDrag();};
    window.addEventListener('keydown',escape);
    return ()=>{
      window.removeEventListener('keydown',escape);
      cancelAnimationFrame(motion.current);
      const live=latest.current;
      if(motion.current)live.onVisualMove?.(live.token,live.token.x,live.token.y,true);
      if(dragging.current){latest.current.onDragPreview?.(latest.current.token,null);latest.current.onDragActive?.(false);}
    };
  },[]);

  const paintDrag = (cx: number, cy: number) => {
    const origin=committed.current;
    tokenArt.current?.position({x:origin.x-cx,y:origin.y-cy});
    tether.current?.points([origin.x,origin.y,cx,cy]);
    const facing=facingAfterMove(origin.x,origin.y,cx,cy,token.facing);
    const visible=isVisibleAt?.(token.id,cx,cy)!==false;
    previewBase.current?.position({x:cx,y:cy});
    previewBase.current?.visible(visible);
    // Models face +map Y; Konva's positive rotation runs clockwise.
    previewArrow.current?.rotation(-facing*180/Math.PI);
    onDragPreview?.(token,visible ? {x:cx,y:cy,facing} : null);
    if (distText.current) {
      const distance = moveDistanceFt(cx-origin.x,cy-origin.y,pxPerFoot);
      const difficult=difficultTravel(origin,{x:cx,y:cy},terrainZones??[],pxPerFoot);
      const cost=Math.round((distance+difficult)*10)/10;
      distText.current.text(`${distance} ft${difficult>.01?` ? costs ${cost} ft`:''}${movementAllowanceFt === undefined ? '' : ` / ${movementAllowanceFt} ft`}`);
      distText.current.fill(movementAllowanceFt !== undefined && cost > movementAllowanceFt ? '#ff9276' : '#ffd21a');
      distText.current.position({x:(origin.x+cx)/2,y:(origin.y+cy)/2-distText.current.fontSize()*1.1});
    }
    dragOverlay.current?.getLayer()?.batchDraw();
  };

  const handleDragStart = () => {
    clearLongPress();cancelled.current=false;dragging.current=true;
    cancelAnimationFrame(motion.current);motion.current=0;
    pose.current={...committed.current};
    onVisualMove?.(token,token.x,token.y,true);
    onDragActive?.(true);
    dragOverlay.current?.visible(true);
    dragOverlay.current?.moveToTop();
    paintDrag(tokenNode.current!.x(),tokenNode.current!.y());
  };
  const constrainMove=(x:number,y:number)=>stopAtWalls(committed.current,{x,y},wallCollisionRadiusFt(token.widthFt)*pxPerFoot,movementWalls);
  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    const p=constrainMove(e.target.x(),e.target.y());e.target.position(p);paintDrag(p.x,p.y);
  };
  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if(cancelled.current)return;
    const {x,y}=constrainMove(e.target.x(),e.target.y());
    clearPreview();
    // No optimistic teleport: wait for the accepted position. A rejected move
    // simply leaves the token here, so no stale acknowledgement can move it.
    e.target.position(committed.current);
    e.target.getLayer()?.batchDraw();
    onMove(token,x,y);
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
  // Clear a pending hold on unmount so a token removed mid-press (deleted, hidden,
  // or moved off-map by a snapshot) can't fire openMenu on a vanished token.
  useEffect(() => clearLongPress, []);
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
    const layer = node.getLayer();
    let last = 0;
    // The ring shares the main token layer, so an animation bound to that layer
    // would redraw the ENTIRE scene (map, fog, every token) 60×/s for all of
    // combat. Instead: no layer arg (so Konva doesn't auto-redraw), and we
    // batchDraw ourselves throttled to ~20fps — same visible pulse, ⅓ the draws.
    const anim = new Konva.Animation((frame) => {
      if (!frame || frame.time - last < 50) return;
      last = frame.time;
      const t = (Math.sin(frame.time / 280) + 1) / 2; // 0..1 ease
      node.radius(turnRingR + t * 6);
      node.strokeWidth(5 + t * 4);
      node.opacity(0.65 + t * 0.35);
      layer?.batchDraw();
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [activeTurn, turnRingR, miniatureReady]);

  const frontInitiative = (miniatureReady || miniaturePending) && initiativeRank !== null;
  const initiativeHudOffset = frontInitiative ? 24 : 0;
  const playerNameSize = Math.max(11, Math.min(18, radius * .4));
  const monsterNameSize = Math.max(10, Math.min(14, gridSizePx * .14));
  const monsterLabelWidth = Math.max(64, Math.min(130, radius * 2.6));
  const tagWidth = token.revealTag ? (token.revealTag.length + 2) * monsterNameSize * 0.65 : 0;
  const nameWidth = useMemo(() => {
    const measure = new Konva.Text({ text: display.name, fontSize: monsterNameSize });
    const width = measure.getTextWidth();
    measure.destroy();
    return Math.min(monsterLabelWidth, width + 2);
  }, [display.name, monsterNameSize, monsterLabelWidth]);
  const roleBadgeR = Math.max(11, radius * 0.36);
  const labelY = initiativeHudOffset + radius + Math.max(hpFrac !== null ? 14 : 4,
    token.combatRole ? roleBadgeR - radius * .28 + 4 : 4);


  // Silhouette by token shape. `image` draws the icon unclipped (pasted art);
  // the others fill/stroke a shape and clip image icons to it.
  const shape = token.shape ?? 'circle';
  useLayoutEffect(()=>{
    const body=tokenBody.current;if(!body)return;
    body.clearCache();body.filters([]);
    if(sharedDarkvision&&!miniatureReady&&!miniaturePending){
      body.cache({pixelRatio:2});
      body.filters([(data:ImageData)=>{
        for(let i=0;i<data.data.length;i+=4){
          const l=(data.data[i]*.2126+data.data[i+1]*.7152+data.data[i+2]*.0722)/255;
          const value=255*(.018+l*.10);
          data.data[i]=data.data[i+1]=data.data[i+2]=value;
        }
      }]);
    }
    body.getLayer()?.batchDraw();
  },[sharedDarkvision,miniatureReady,miniaturePending,iconImg,display,shape,radius,selected,isDead]);
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
      ref={tokenNode}
      name="token"
      tokenId={token.id}
      miniatureReady={miniatureReady}
      miniaturePending={miniaturePending}
      x={presentation?.position(token.id)?.x??token.x}
      y={presentation?.position(token.id)?.y??token.y}
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
      opacity={isVisibleAt?.(token.id,presentation?.position(token.id)?.x??token.x,presentation?.position(token.id)?.y??token.y)===false ? 0 : token.isHidden ? 0.45 : 1}
    >
      {/* The entire painted token is decoration. Names, badges, HP bars and
          status/turn rings must not steal clicks from nearby token bodies. */}
      <Group ref={tokenArt} name="token-art" listening={false}>
      {/* Concentric status rings: red (negative), green (buff), blue (concentration). */}
      {!miniatureReady && !miniaturePending && auras.map((a, i) => (
        <Circle
          key={a}
          radius={radius + 5 + i * 5}
          stroke={AURA_HEX[a]}
          strokeWidth={4}
        />
      ))}
      {activeTurn && !miniatureReady && !miniaturePending && (
        <Circle
          name="active-turn-ring"
          ref={turnRing}
          radius={turnRingR}
          stroke="#ffd21a"
          strokeWidth={5}
          shadowColor="#ffd21a"
          shadowBlur={16}
          shadowOpacity={0.95}
        />
      )}
      {miniaturePending && <Group name="token-miniature-loading" listening={false}>
        <Circle radius={Math.min(radius * .3, 12)} stroke="#c9bb9b" strokeWidth={1.5} dash={[3, 3]} />
        <Text text="Loading 3D..." x={-45} y={16} width={90} align="center" fontSize={11} fill="#e8ddc6" stroke="#111" strokeWidth={2} fillAfterStrokeEnabled />
      </Group>}
      {!miniatureReady&&!miniaturePending&&Array.from({length:mirrorImageCount(display.conditions)}).map((_,i)=><Group key={`mirror-${i}`} name="mirror-image-duplicate" opacity={.35} x={Math.cos(i*Math.PI*2/3)*radius*2*MIRROR_IMAGE_SPREAD} y={Math.sin(i*Math.PI*2/3)*radius*2*MIRROR_IMAGE_SPREAD} listening={false}>
        {iconImg?<KonvaImage image={iconImg} x={-radius} y={-radius} width={radius*2} height={radius*2}/>:<><Silhouette fill={fill}/><Text text={display.icon||display.name.slice(0,2)} x={-radius} y={-radius} width={radius*2} height={radius*2} fontSize={radius} align="center" verticalAlign="middle"/></>}
      </Group>)}
      <Group ref={tokenBody} name="token-body" visible={!miniatureReady && !miniaturePending}>
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
              opacity={token.invisible ? .28 : isDead ? 0.5 : 1}
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
            <Group opacity={token.invisible ? .28 : isDead ? 0.5 : 1} clipFunc={clip}>
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
          <Silhouette fill={fill} opacity={token.invisible ? .28 : isDead ? 0.5 : 1} />
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
      </Group>
      <Group name="token-upright-hud" rotation={-viewRotation}>
          {!miniatureReady && !token.sharedSightOnly && token.markLabels?.some(label=>/hunter.s mark/i.test(label)) && <Group y={-radius-22} listening={false} name="hunters-mark-sigil">
        <RegularPolygon sides={4} radius={14} stroke="#ffe7a1" strokeWidth={2} fill="#352106" rotation={0} shadowColor="#ffa62b" shadowBlur={8}/>
        <Circle radius={4} fill="#fff5d2"/>
      </Group>}

      {/* 2D fallback. The 3D layer replaces a confirmed-dead figure with a skull. */}
      {isDead && !miniatureReady && !miniaturePending && (
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
      {!isDead && <Text
        stroke="#000"
        strokeWidth={3}
        fillAfterStrokeEnabled
        lineJoin="round"
        name="token-label"
        text={display.name}
        fontSize={token.kind === 'pc' ? playerNameSize : monsterNameSize}
        fill="#fff"
        align="center"
        width={token.kind === 'pc' ? radius * 4 : nameWidth}
        offsetX={token.kind === 'pc' ? radius * 2 : (nameWidth + tagWidth) / 2}
        wrap={token.kind === 'pc' ? 'word' : 'none'}
        ellipsis={token.kind !== 'pc'}
        height={token.kind === 'pc' ? undefined : monsterNameSize * 1.25}
        // Monster names clear the base, health bar and combat badge; PC layout stays compact.
        y={token.kind === 'pc' ? initiativeHudOffset + radius + 4 : labelY}
      />}
      {/* HP bar (only when HP is visible to this viewer). */}
      {!isDead && hpFrac !== null && (
        <Group name="token-health" y={initiativeHudOffset + radius + (token.kind === 'pc' ? playerNameSize + 8 : 4)} offsetX={radius}>
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
      {!isDead && token.revealTag && (
        <Group name="token-tracking-tag" x={(nameWidth - tagWidth) / 2} y={labelY}>
          <Text text={token.revealTag} x={4} width={tagWidth - 4} align="left" fontSize={monsterNameSize}
            fontStyle="bold" fill="#fff" stroke="#000" strokeWidth={3} fillAfterStrokeEnabled />
        </Group>
      )}
      {/* Disposition dot (top-left): green friendly · amber neutral · red enemy. */}
      {display.disposition && !miniatureReady && !miniaturePending && !hideAffinity && (
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
      {!isDead && token.kind !== 'pc' && token.combatRole && !miniatureReady && !miniaturePending && (
        <Group name="token-combat-role" x={-radius * 0.72} y={radius * 0.72}>
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
      {!isDead && initiativeRank !== null && (
        <Group name="token-initiative-rank" x={frontInitiative ? 0 : radius * 0.8} y={frontInitiative ? radius + 12 : -radius * 0.8}>
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
      {/* The crown distinguishes 2D player-character tokens. A ready miniature
          provides its own silhouette, so it keeps only the health/status HUD. */}
      {!isDead && token.kind === 'pc' && !miniatureReady && !miniaturePending &&
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
      </Group>
      {/* One hit-only node follows the actual body silhouette, without padding
          from labels, shadows, selected outlines or decorative rings. The empty
          scene function paints nothing; Konva uses hitFunc on its separate hit
          canvas, and events still bubble to the existing draggable token group.
          Group listening=false (e.g. measuring) also disables this hit region. */}
      <Shape
        name="token-hit-region"
        tokenId={token.id}
        fill="#000"
        strokeEnabled={false}
        shadowEnabled={false}
        perfectDrawEnabled={false}
        sceneFunc={() => {}}
        hitFunc={(ctx, hitShape) => {
          ctx.beginPath();
          // An image token paints a circular fallback until its icon loads
          // (or if the icon is missing/failed), so its hit region must too.
          if (miniatureReady || miniaturePending) {
            // The model, weapon and HUD never receive input. Its circular base
            // is the sole hit region, even if its old portrait used another shape.
            ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
            ctx.closePath();
          } else if (shape === 'square' || (shape === 'image' && hasImageIcon && iconImg)) {
            ctx.rect(-radius, -radius, radius * 2, radius * 2);
          } else if (shape === 'diamond') {
            // RegularPolygon's four vertices lie on its 1.3r radius, not on
            // the smaller icon clipping path used by the existing artwork.
            const r = radius * 1.3;
            ctx.moveTo(0, -r);
            ctx.lineTo(r, 0);
            ctx.lineTo(0, r);
            ctx.lineTo(-r, 0);
            ctx.closePath();
          } else if (shape === 'triangle') {
            ctx.moveTo(0, -radius);
            ctx.lineTo(radius * 0.87, radius * 0.5);
            ctx.lineTo(-radius * 0.87, radius * 0.5);
            ctx.closePath();
          } else {
            ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
            ctx.closePath();
          }
          ctx.fillStrokeShape(hitShape);
        }}
      />
    </Group>
    {/* Drag-distance readout (only on draggable tokens; hidden until a drag
        starts, then driven imperatively in paintDrag — never re-renders). A
        dashed tether from the previous spot to the token + a "N ft" pill that
        rides above it, all cleared on release. */}
    {draggable && (
      <Group ref={dragOverlay} name="token-move-preview" tokenId={token.id} visible={false} listening={false}>
        <Group ref={previewBase}>
          <Circle radius={radius} fill="#7fb6c8" opacity={.18} stroke="#b8e3ef" strokeWidth={2}/>
          {!miniatureReady && !miniaturePending && (iconImg ? <KonvaImage image={iconImg} x={-radius} y={-radius} width={radius*2} height={radius*2} opacity={.32}/>
            : <Text text={hasEmojiIcon ? display.icon : display.name.slice(0,1)} x={-radius} y={-radius*.5} width={radius*2} align="center" fontSize={radius} fill="#b8e3ef" opacity={.45}/>)}
          <Line ref={previewArrow} points={[-radius*.22,radius*1.05,0,radius*1.4,radius*.22,radius*1.05]} stroke="#b8e3ef" strokeWidth={3} lineCap="round" lineJoin="round"/>
        </Group>
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
    p.presentation === n.presentation &&
    p.sharedDarkvision === n.sharedDarkvision &&
    sameTokenDisplay(p.display, n.display) &&
    p.gridSizePx === n.gridSizePx &&
    p.pxPerFoot === n.pxPerFoot &&
    p.draggable === n.draggable &&
    p.selected === n.selected &&
    p.activeTurn === n.activeTurn &&
    p.initiativeRank === n.initiativeRank &&
    p.listening === n.listening &&
    p.miniatureReady === n.miniatureReady &&
    p.miniaturePending === n.miniaturePending &&
    p.hideAffinity === n.hideAffinity &&
    p.viewRotation === n.viewRotation &&
    p.miniatureDiameterFt === n.miniatureDiameterFt &&
    p.movementWalls === n.movementWalls &&
    p.movementAllowanceFt === n.movementAllowanceFt && p.terrainZones===n.terrainZones &&
    p.onSelect === n.onSelect &&
    p.onActivate === n.onActivate &&
    p.onMove === n.onMove &&
    p.onContextMenu === n.onContextMenu &&
    p.onHover === n.onHover &&
    p.onHoverEnd === n.onHoverEnd &&
    p.onDragActive === n.onDragActive &&
    p.onDragPreview === n.onDragPreview &&
    p.onVisualMove === n.onVisualMove &&
    p.isVisibleAt === n.isVisibleAt,
);
