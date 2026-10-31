import {renderedImage} from '../lib/renderImages';
import {spellCastCost} from '../lib/spellcasting';
import {explicitTokenInspection} from '../lib/tokenInspection';
import {retainedRenderingEnabled} from '../lib/retainedRendering';
import {installRetainedTokenLayer,invalidateRetainedToken} from './retainedTokenLayer';
import {sameBoardSnapshot} from '../../../shared/boardSnapshot';
import {LegacyVisionOverlay} from './LegacyVisionOverlay';
import {LegacyModeControl} from '../components/LegacyModeControl';
import {useLegacyMovement} from '../lib/useLegacyMovement';
import {ServerRenderingOwnerControls} from '../components/ServerRenderingControl';
import {apiFetch} from '../lib/api';
import {MapArtwork} from './MapArtwork';
import {useMapAnimation} from '../lib/useMapAnimation';
import {requestText} from '../lib/dialogs';
import {requestBattlefieldFrame,cancelBattlefieldFrame} from './battlefieldFrame';
import {createLatestFrame} from '../lib/latestFrame';
import {ManualFog,type ManualFogHandle} from './ManualFog';
import {mirrorImageCount} from '../../../shared/linkedSpells';
import {tokenInSpellArea,areaExcludesCaster,areaOrigin,type SpellAreaPlacement} from '../../../shared/spellAreas';
import {tokenDistanceFt} from '../../../shared/distance';
import {SpellAreaShapes} from './SpellAreaShapes';
import {DEATH_SKULL} from '../lib/miniatures';
import {ObjectControls} from '../components/ObjectControls';
import './door-controls.css';
import { activeHasteCondition, speedIsZero, walkingSpeedFeet } from '../../../shared/spellBuffs';
import {PlayerVisionOverlay,type PlayerVisionHandle} from './PlayerVisionOverlay';
import {TokenPresentation} from './tokenPresentation';
import {reduceRollBackground} from '../lib/rollBackgroundBudget';
import {WallMenu,type WallTool} from '../components/WallMenu';
import {doorApproachPoints,distanceToWall,sanitizeWalls,hasLineOfSight,type MapWall} from '../../../shared/mapWalls';
import {doorInReach,doorInteractionArea} from '../../../shared/doorInteraction';
import {wallVertices,wallCenter,wallSvgPath,wallBoundarySegments,translateWall,simplifyWallPath} from '../../../shared/wallGeometry';
import {fogVisionContains,visionShowsAffinity,needsVisibilityLayer,usesMapVision,usesTokenVision} from '../../../shared/playerVision';
import {presentAuras,AURA_HEX} from '../lib/conditions';
import { miniatureBaseWidthFt } from '../../../shared/monsterAppearance';
import { tokenVisibleAt } from '../../../shared/fog';
import { monsterTint, monsterVariation } from '../../../shared/monsterAppearance';
import { productionFamily } from '../../../shared/assetProduction';
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Group, Line, Rect, Circle, Text, Label, Tag, Path, Image as KonvaImage } from 'react-konva';
import { rollerColor } from '../lib/rollStyle';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import type { AbilityRollPayload, FogLayer, Measurement, StateSnapshot, Token } from '../../../shared/types';
import { useImage } from './useImage';
import { TokenShape, DISPOSITION_HEX } from './TokenShape';
import type { MiniatureLayerHandle, MiniatureToken } from './MiniatureLayer';
import { createMiniatureNameReader, setMiniatureNamesRendered } from './miniatureNameLabels';
import { MiniatureFallback } from './MiniatureFallback';
import { BATTLEFIELD_TILT_DEGREES, groundYScale, screenToMap, perspectiveSlope, unprojectGround, mapToScreen, projectGround } from './miniatureProjection';
import { useBoxSelection } from './useBoxSelection';
import { installPerspectiveCanvas } from './perspectiveCanvas';
import { installPerspectiveInput } from './perspectiveInput';
import { resolveMiniature, miniatureForQuality, miniatureForPreload, miniaturePreloadDefinitions, useMiniatureCatalog } from '../lib/miniatures';
import { HpFxLayer, HpNumberLayer } from './HpFx';
import {weaponTravelMs} from '../../../shared/weaponImpact';
import {spellImpactStyle,weaponImpactStyle,persistentSpellVisual} from '../../../shared/spellImpact';
import type {SpellImpact} from './spellImpactEffects';
import { DragGhostLayer } from './DragGhostLayer';
import { SpeechBubbles } from './SpeechBubbles';
import { CursorPointers } from './CursorPointers';
import { useContentStable } from '../lib/useContentStable';
import { FootprintLayer, type FootprintMark } from './FootprintTrails';
import { resolveToken,tokenEntityIndex } from '../lib/entities';
import { safeSetItem } from '../lib/storage';
import { cropImage, removeBackground } from '../lib/imageEdit';
import { useComfyAvailable, comfyGenerate } from '../lib/comfy';
import { useStableCallback } from '../lib/useStableCallback';
import { getPlayerId, useStore, isRollImpactPending } from '../state/socket';
import { FloatingMenu } from '../components/FloatingMenu';
import { MeasureMenu } from '../components/MeasureMenu';
import { AnnotationMenu } from '../components/AnnotationMenu';
import { CompactToolbarMenu } from '../components/CompactToolbarMenu';
import { FogMenu } from '../components/FogMenu';
import {useEnvironmentQuality} from '../lib/useEnvironmentQuality';
import {useEnvironmentEditor} from '../lib/useEnvironmentEditor';
import {DEFAULT_MAP_ENVIRONMENT} from '../../../shared/mapEnvironment';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
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
  onSelectTokens?: (ids: string[]) => void;
  onMoveToken: (tokenId: string, x: number, y: number, placed?: (p: {x:number;y:number}) => void) => void;
  /** When set (DM placing a unit), a map click reports image-space coords. */
  onPlaceAt?: (x: number, y: number) => void;
  /** Presentation-only: avoid duplicating the compact feed beside open chat. */
  fullChatVisible?: boolean;
  /** Bring a token into view (a new `nonce` = a new request). The camera moves
   *  only when the token sits outside the comfortable middle of the screen. */
  focusRequest?: { tokenId: string; nonce: number } | null;
};

type View = { scale: number; x: number; y: number };
type Pt = { x: number; y: number };

const MiniatureLayer = lazy(() => import('./MiniatureLayer').then((module) => ({ default: module.MiniatureLayer })));

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
    (t) => !t.sharedSightOnly && selectedIds.includes(t.id) && t.id !== target.id,
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
  onPlaybackError?:()=>void;
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

function MapStageInner({
  snapshot: sourceSnapshot,
  draggableTokens: sourceDraggableTokens,
  selectedIds,
  activeTurnTokenId,
  onSelectToken,
  onSelectTokens,
  onMoveToken,
  onPlaceAt: sourceOnPlaceAt,
  fullChatVisible = false,
  focusRequest,
}: Props) {
  const {quality:environmentQuality,budget:graphics}=useEnvironmentQuality();
  const legacy=graphics.legacy;
  const retained=retainedRenderingEnabled();
  const konvaPixelRatio=legacy?1:Math.min(window.devicePixelRatio||1,graphics.pixelRatioCap);
  Konva.pixelRatio=konvaPixelRatio;
  const [dmViewMode,setDmViewMode]=useState<'dm'|'scene'|'player'>('dm');
  const actualDm=sourceSnapshot.role==='dm';
  const partyPreview=actualDm&&dmViewMode==='player';
  const setDmPartyView=useStore(s=>s.setDmPartyView);
  const previewSocketId=useStore(s=>s.socket?.id);

  useEffect(()=>{if(actualDm)setDmPartyView(partyPreview);},[actualDm,partyPreview,previewSocketId,setDmPartyView]);
  const sourceViewSnapshot=useMemo(()=>partyPreview?{...sourceSnapshot,...(sourceSnapshot.partyView??{
    tokens:[],monsters:[],exploredTerrain:[],playerVision:{rangeFt:60 as const,radius:0,heavy:true,origins:[],lights:[],walls:sourceSnapshot.map?.walls},
  }),role:'player' as const}:sourceSnapshot,[sourceSnapshot,partyPreview]);
  const legacyMovement=useLegacyMovement(sourceViewSnapshot,legacy&&sourceSnapshot.serverRendering?.enabled===true);
  const snapshot=legacyMovement.snapshot;
  // Player visibility changes what the DM sees, not who controls the map.
  const draggableTokens=sourceDraggableTokens;
  const onPlaceAt=sourceOnPlaceAt;
  const miniatureCatalogRevision = useMiniatureCatalog(!legacy);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const legacyFootstepsLayerRef = useRef<Konva.Layer|null>(null);
  const spellAreaLayerRef = useRef<Konva.Layer|null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const groundTokenLayerRef = useRef<Konva.Layer>(null);
  const tokenLayerRef = useRef<Konva.Layer>(null);
  const sharedTokenLayerRef = useRef<Konva.Layer>(null);
  const miniatureRef = useRef<MiniatureLayerHandle>(null);
  const hpHeadPosition=useCallback((id:string)=>miniatureRef.current?.headPosition(id),[]);
  const footprintMarks=useRef<FootprintMark[]>([]);
  const readFootprints=useCallback(()=>footprintMarks.current,[]);
  const updateFootprints=useCallback((marks:FootprintMark[])=>{footprintMarks.current=marks;miniatureRef.current?.setFootprints(marks);},[]);
  const visionRef=useRef<PlayerVisionHandle>(null);
  // Skip dynamic sight/light composition only when it cannot conceal terrain.
  // Painted fog, token filtering, movement and targeting remain independent.
  const renderPlayerVision=needsVisibilityLayer(snapshot.map,snapshot.playerVision);
  const memoryTerrainCanvas=useCallback(()=>visionRef.current?.memoryCanvas()??null,[]);
  const visionCoverFrame=useCallback(()=>visionRef.current?.cover(),[]);
  const presentation=useRef(new TokenPresentation()).current;
  const presentationSnapshot=useMemo(()=>snapshot,[snapshot.map,snapshot.tokens,snapshot.playerVision,snapshot.exploredTerrain,snapshot.role]);
  // Retain the simpler flash experiment for repeatable measurements only.
  const spellColorOverlay=new URLSearchParams(window.location.search).get('spellColorOverlay')==='1';
  const spellMist=new URLSearchParams(window.location.search).get('spellMist')!=='off';
  const visionSpellLights=useRef(false);
  const visionLightTime=useRef(0);
  const handleVisionLights=useCallback((lights:import('../../../shared/playerVision').VisionLight[])=>{
    const now=performance.now();
    const spell=!spellColorOverlay&&lights.some(l=>l.transient),changed=spell!==visionSpellLights.current;
    if(!changed&&now-visionLightTime.current<(spell?16:66))return;
    visionSpellLights.current=spell;
    visionLightTime.current=now;visionRef.current?.lights(lights);
  },[spellColorOverlay]);
  const [readyMiniatures, setReadyMiniatures] = useState<ReadonlySet<string>>(new Set());
  const handleMiniatureReady = useCallback((ids: ReadonlySet<string>) => {
    setReadyMiniatures((old) => old.size === ids.size && [...old].every((id) => ids.has(id)) ? old : ids);
  }, []);
  const [failedMiniatures, setFailedMiniatures] = useState<ReadonlySet<string>>(new Set());
  const [miniaturesUnavailable, setMiniaturesUnavailable] = useState(false);
  const handleMiniatureUnavailable = useCallback(() => { setReadyMiniatures(new Set()); setMiniaturesUnavailable(true); }, []);
  const handleTokenVisualMove = useCallback((token: Token, x: number, y: number, finished: boolean) => {
    miniatureRef.current?.moveToken(token.id, x, y, finished, token.facing);
    visionRef.current?.move(token.id,x,y);
  }, []);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const viewPreferenceKey = `dnd.battlefieldView:${getPlayerId()}`;
  const [preferredTilted, setTilted] = useState(() => {
    try { return localStorage.getItem(viewPreferenceKey) === 'tilted'; }
    catch { return false; }
  });
  const [savedTiltDegrees, setTiltDegrees] = useState(() => preferredTilted ? BATTLEFIELD_TILT_DEGREES : 0);
  const rotationKey = `dnd.battlefieldRotation:${getPlayerId()}`;
  const [savedRotationDegrees, setRotationDegrees] = useState(() => {
    try { const saved=Number(localStorage.getItem(rotationKey));return Number.isFinite(saved)?saved%360:0; } catch { return 0; }
  });
  const tilted=!legacy&&preferredTilted, tiltDegrees=legacy?0:savedTiltDegrees, rotationDegrees=legacy?0:savedRotationDegrees;
  const viewAnimation=useRef(0);
  const projectionState=useRef({tilt:tiltDegrees,rotation:rotationDegrees});
  const projectionCanvases=useRef<ReturnType<typeof installPerspectiveCanvas>[]>([]);
  const rotationLabel=useRef<HTMLButtonElement>(null);
  const rotationGesture=useRef<{x:number;start:number;angle:number;pointerId:number;frame:number;view:View}|null>(null);
  useEffect(()=>()=>{cancelBattlefieldFrame(viewAnimation.current);if(rotationGesture.current)cancelBattlefieldFrame(rotationGesture.current.frame);},[]);
  useLayoutEffect(()=>{cancelBattlefieldFrame(viewAnimation.current);projectionState.current={tilt:tiltDegrees,rotation:rotationDegrees};},[legacy]);
  const tokenPreferenceKey = `dnd.tokenView:${getPlayerId()}`;
  const [preferred3dTokens, setUse3dTokens] = useState(() => {
    try { return localStorage.getItem(tokenPreferenceKey) !== '2d'; }
    catch { return true; }
  });
  const monsterPreferenceKey = `dnd.monsterTokenView:${getPlayerId()}`;
  const [preferred3dMonsters, setUse3dMonsters] = useState(() => {
    try { return (localStorage.getItem(monsterPreferenceKey) ?? localStorage.getItem(tokenPreferenceKey)) !== '2d'; }
    catch { return true; }
  });
  const use3dTokens=!legacy&&preferred3dTokens, use3dMonsters=!legacy&&preferred3dMonsters;
  useEffect(()=>{useStore.getState().socket?.emit('client:rendering',legacy,{pc:legacy||!use3dTokens||miniaturesUnavailable,monster:legacy||!use3dMonsters||miniaturesUnavailable});},[legacy,use3dTokens,use3dMonsters,miniaturesUnavailable,previewSocketId]);
  const groundScaleY = groundYScale(tiltDegrees);
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
  // Keep authoring data and permissions while rendering the party sight snapshot.
  const map = actualDm ? sourceSnapshot.map : snapshot.map;
  const {placement:lightPlacement,place:placeLight,editMapId,edit:requestFeatureEdit}=useEnvironmentEditor();
  const placingLight=actualDm&&lightPlacement?.mapId===map?.id&&!!lightPlacement;
  useEffect(()=>{
    if(lightPlacement&&(lightPlacement.mapId!==map?.id||!actualDm))placeLight(null);
    const cancel=(event:KeyboardEvent)=>{if(lightPlacement&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();placeLight(null);}};
    window.addEventListener('keydown',cancel,true);return()=>window.removeEventListener('keydown',cancel,true);
  },[map?.id,actualDm,lightPlacement,placeLight]);

  // DM: paste an image from the clipboard → upload → choose Object or Decal.
  // Falls back to <img>/image-URL pastes (e.g. copying art out of a web page
  // or Google Slides puts only the image's URL on the clipboard, not pixels) —
  // the server fetches those via /api/icons/from-url.
  useEffect(() => {
    if (!actualDm) return;
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
  }, [actualDm]);

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
  const mapAnimation=useMapAnimation();
  const animateMap=!legacy&&mapAnimation.enabled;
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
  // This flag controls the rendered view, not permission to perform DM actions.
  const isDm = snapshot.role === 'dm';
  const mySocketId = useStore((s) => s.socket?.id);
  const showRollOverlay = useStore((s) => s.showRollOverlay);
  const showDiceButton = useStore((s) => s.showDiceButton);
  const orbTarget = useStore(s => s.orbTarget);
  const setOrbTarget = useStore(s => s.setOrbTarget);
  const saveResolve = useStore((s) => s.saveResolve);
  const resolvingRoll=useStore(s=>saveResolve?s.snapshot?.rollLog.find(r=>r.id===saveResolve.rollId):undefined);
  const actionSnapshot=actualDm?sourceSnapshot:snapshot;
  const teleportCast=useStore(s=>s.teleportCast),clearTeleportCast=useStore(s=>s.clearTeleportCast);
  const pendingSpellCost=(payload:AbilityRollPayload)=>{
    const caster=(payload.kind==='pc'?actionSnapshot.characters:actionSnapshot.monsters).find(c=>c.id===payload.refId);
    const ability=caster&&'sheetAbilities'in caster?caster.sheetAbilities.find(a=>a.id===payload.abilityId):undefined;
    return caster&&'sheetAbilities'in caster&&ability?spellCastCost(caster,ability,payload.castLevel,payload.slotPool):undefined;
  };
  const [teleportPoint,setTeleportPoint]=useState<Pt|null>(null);
  const teleportActor=teleportCast?actionSnapshot.tokens.find(t=>t.kind===teleportCast.kind&&t.refId===teleportCast.refId):undefined;
  useEffect(()=>{setTeleportPoint(null);},[teleportCast]);
  useEffect(()=>{if(!teleportCast)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')clearTeleportCast();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[teleportCast]);
  useEffect(()=>{if(teleportCast&&(!teleportActor||teleportActor.mapId!==map?.id))clearTeleportCast();},[teleportCast,teleportActor?.id,map?.id]);
  const teleportError=teleportPoint&&teleportActor&&map?(tokenDistanceFt({...teleportActor,widthFt:0},{...teleportPoint,widthFt:0},map)>30?'Choose a destination within 30 ft.':!hasLineOfSight(teleportActor,teleportPoint,map.walls)?'Choose a destination you can see.':null):null;
  const areaSocketId=useStore(s=>s.socket?.id);
  const areaCast=useStore(s=>s.areaCast),clearAreaCast=useStore(s=>s.clearAreaCast);
  const [areaPoints,setAreaPoints]=useState<Pt[]>([]),[areaPointer,setAreaPointer]=useState<Pt|null>(null),[areaAngle,setAreaAngle]=useState(0),[areaDirectionLocked,setAreaDirectionLocked]=useState(false),[areaExcluded,setAreaExcluded]=useState<string[]>([]);
  const areaActor=areaCast?actionSnapshot.tokens.find(t=>t.kind===areaCast.payload.kind&&t.refId===areaCast.payload.refId):undefined;
  useEffect(()=>{setAreaPoints(areaCast?.spec.kind==='emanation'&&areaCast.spec.self&&areaActor?[{x:areaActor.x,y:areaActor.y}]:[]);setAreaPointer(null);setAreaAngle(0);setAreaDirectionLocked(false);setAreaExcluded([]);},[areaCast]);
  useEffect(()=>{if(areaCast&&(!areaActor||!map||areaActor.mapId!==map.id))clearAreaCast();},[areaCast,areaActor?.mapId,map?.id]);
  useEffect(()=>{if(!areaCast)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')clearAreaCast();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[areaCast]);
  const placeSpellArea=(p:Pt)=>{
    if(!areaCast||!areaActor)return;
    if(areaCast.spec.self){setAreaPoints([{x:areaActor.x,y:areaActor.y}]);setAreaDirectionLocked(true);return;}
    if(areaCast.spec.kind==='line'||areaCast.spec.kind==='cone'){
      if((areaCast.spec.count??1)>1){setAreaPoints(old=>old.length<(areaCast.spec.count??1)?[...old,p]:old);setAreaDirectionLocked(true);}
      else if(!areaPoints.length)setAreaPoints([p]);else setAreaDirectionLocked(true);
    }else if((areaCast.spec.count??1)>1)setAreaPoints(old=>{
      if(old.length>=(areaCast.spec.count??1))return old;
      if(areaCast.name.trim().toLowerCase()==='fire storm'&&old.length&&map){
        const grid=areaCast.spec.sizeFt*map.gridSizePx/map.feetPerSquare,dx=p.x-old[0].x,dy=p.y-old[0].y;
        const x=Math.round((dx*Math.cos(areaAngle)+dy*Math.sin(areaAngle))/grid)*grid,y=Math.round((-dx*Math.sin(areaAngle)+dy*Math.cos(areaAngle))/grid)*grid;
        p={x:old[0].x+x*Math.cos(areaAngle)-y*Math.sin(areaAngle),y:old[0].y+x*Math.sin(areaAngle)+y*Math.cos(areaAngle)};
      }
      return old.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-6)?old:[...old,p];
    });
    else setAreaPoints([p]);
  };
  const areaPlacement:SpellAreaPlacement={mapId:map?.id??'',points:areaPoints,angle:areaAngle};
  const areaPreview=areaCast&&areaActor?{...areaPlacement,points:areaPoints.length?areaPoints:areaCast.spec.self?[areaActor]:areaPointer?[areaPointer]:[]}:areaPlacement;
  const areaTargets=areaCast&&areaActor&&map?actionSnapshot.tokens.filter(t=>{
    const e=resolveToken(actionSnapshot,t);
    return !t.sharedSightOnly&&!e.dead&&!(t.kind==='monster'&&actionSnapshot.monsters.find(m=>m.id===t.refId)?.objectKind)&&
      !(areaExcludesCaster(areaCast.spec)&&t.id===areaActor.id)&&tokenInSpellArea(areaCast.spec,areaPreview,areaActor,t,map.gridSizePx/map.feetPerSquare)&&
      areaPreview.points.some((_,i)=>hasLineOfSight(areaCast.spec.self?areaActor:areaOrigin(areaCast.spec,areaPreview,areaActor,map.gridSizePx/map.feetPerSquare,i),t,map.walls));
  }):[];
  // Send the latest geometry at most every 70 ms while the pointer is moving.
  const areaShareTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const latestAreaShare=useRef<import('../../../shared/types').SpellAreaPreviewIntent|null>(null);
  useEffect(()=>{
    const hadPreview=!!latestAreaShare.current;
    latestAreaShare.current=areaCast&&areaActor&&map?{...areaCast.payload,area:areaPreview}:null;
    if(!latestAreaShare.current){if(hadPreview)useStore.getState().shareSpellArea(null);if(areaShareTimer.current)clearTimeout(areaShareTimer.current);areaShareTimer.current=null;return;}
    if(!areaShareTimer.current)areaShareTimer.current=setTimeout(()=>{areaShareTimer.current=null;if(latestAreaShare.current)useStore.getState().shareSpellArea(latestAreaShare.current);},70);
  },[areaCast,areaActor?.x,areaActor?.y,map?.id,areaPoints,areaPointer,areaAngle]);
  useEffect(()=>()=>{if(areaShareTimer.current)clearTimeout(areaShareTimer.current);useStore.getState().shareSpellArea(null);},[]);
  const areaRangeError=areaCast&&areaActor&&map&&!areaCast.spec.self&&areaPoints.some(p=>tokenDistanceFt({...areaActor,widthFt:0},{...p,widthFt:0},map)>areaCast.spec.rangeFt+1e-6||!hasLineOfSight(areaActor,p,map.walls));
  const hpFx = useStore((s) => s.hpFx);
  const preparedHpFx=useStore(s=>s.preparedHpFx);
  const rollBackground = useStore(s => reduceRollBackground(s));
  const rollBackgroundPrepared=useStore(s=>!s.liveDice&&!!s.rollFx?.backgroundPrepared);
  const spellRollFx = useStore(s=>s.rollFx);
  // Remote cursors, drag tethers and chat bubbles arrive many times a second.
  // Their layers subscribe to the store themselves; the map only needs to know
  // WHICH tokens a remote drag hides, as a string so unrelated packets don't
  // re-render the whole stage.
  const hiddenGhostKey = useStore((s) => Object.keys(s.dragGhosts).filter((id) => s.dragGhosts[id].hidden).sort().join('|'));
  const hiddenGhosts = useMemo(() => new Set(hiddenGhostKey ? hiddenGhostKey.split('|') : []), [hiddenGhostKey]);
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
  const setVisionFog = useStore((s)=>s.setVisionFog);
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
  const legacyTerrain=legacy&&renderPlayerVision&&!!snapshot.terrainRaster&&!tilesMode;
  // Annotation tool: a freehand pen or text-label placer, with a colour.
  const [annotate, setAnnotate] = useState<'pen' | 'text' | null>(null);
  const [annoColor, setAnnoColor] = useState('#ffd166');
  const penRef = useRef<number[] | null>(null);
  const [penDraft, setPenDraft] = useState<number[] | null>(null);
  const [fogBrush, setFogBrush] = useState<'off' | 'reveal' | 'hide'>('off');
  const [wallTool,setWallTool]=useState<WallTool>('off');
  const [doorWallId,setDoorWallId]=useState<string|null>(null),[selectedDoor,setSelectedDoor]=useState<string|null>(null);
  const [dismissedDoors,setDismissedDoors]=useState<string[]>([]);
  const openDoorControls=(id:string)=>{setDismissedDoors(old=>old.filter(key=>key!==id));setSelectedDoor(id);};
  const [wallSnap,setWallSnap]=useState(false);
  const [wallAnchor,setWallAnchor]=useState<Pt|null>(null),[wallPointer,setWallPointer]=useState<Pt|null>(null);
  const [wallThickness,setWallThickness]=useState(1);
  const [featureSelection,setFeatureSelection]=useState<string[]>([]),[wallPreview,setWallPreview]=useState<MapWall|null>(null);
  const wallSelection=featureSelection.length===1&&featureSelection[0].startsWith('wall:')?featureSelection[0].slice(5):null;
  const setWallSelection=(id:string|null)=>setFeatureSelection(id?[`wall:${id}`]:[]);
  const wallStroke=useRef<Pt[]>([]);
  const wallGesture=useRef<{mode:'move'|'rotate';wall:MapWall;start:Pt}|null>(null);
  const wallActive=actualDm&&wallTool!=='off';
  const selectedWall=wallPreview??map?.walls?.find(w=>w.id===wallSelection);
  const rotationHandle=(w:MapWall)=>{const c=wallCenter(w),r=Math.max(...wallVertices(w).map(p=>Math.hypot(p.x-c.x,p.y-c.y)))+26/view.scale,a=((w.rotation??0)-90)*Math.PI/180;return {x:c.x+Math.cos(a)*r,y:c.y+Math.sin(a)*r};};
  const cancelWallStroke=()=>{setWallAnchor(null);setWallPointer(null);setWallPreview(null);wallGesture.current=null;wallStroke.current=[];};
  useEffect(()=>{cancelWallStroke();setWallSelection(null);},[wallTool,map?.id]);
  useEffect(()=>{if(editMapId===map?.id&&actualDm){setWallTool('edit');requestFeatureEdit(null);}},[editMapId,map?.id,actualDm,requestFeatureEdit]);
  useEffect(()=>{if(wallActive){if(onSelectTokens)onSelectTokens([]);else onSelectToken(null);}},[wallActive]);
  const pickFeature=(p:Pt):string|null=>{
    const light=map?.environment?.lights.filter(l=>Math.hypot(l.x-p.x,l.y-p.y)<14/view.scale).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    if(light)return `light:${light.id}`;
    const wall=[...(map?.walls??[])].filter(w=>distanceToWall(p,w)<14/view.scale).sort((a,b)=>Number(!!b.window||!!b.door||!!b.arch)-Number(!!a.window||!!a.door||!!a.arch)||distanceToWall(p,a)-distanceToWall(p,b))[0];
    return wall?`wall:${wall.id}`:null;
  };
  const selectFeature=(id:string|null,additive=false)=>setFeatureSelection(old=>!id?additive?old:[]:additive?old.includes(id)?old.filter(x=>x!==id):[...old,id]:[id]);
  const deleteFeatures=useStableCallback(()=>{
    if(!actualDm||!map||!featureSelection.length)return;
    useStore.getState().socket?.emit('map:deleteFeatures',{mapId:map.id,wallIds:featureSelection.filter(id=>id.startsWith('wall:')).map(id=>id.slice(5)),lightIds:featureSelection.filter(id=>id.startsWith('light:')).map(id=>id.slice(6))});
    setFeatureSelection([]);cancelWallStroke();
  });
  useEffect(()=>{
    if(!wallActive||wallTool!=='edit')return;
    const key=(e:KeyboardEvent)=>{
      const el=e.target as HTMLElement|null;if(el?.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('[role=dialog]'))return;
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)deleteFeatures();}
      else if(e.key==='Escape'&&featureSelection.length){e.preventDefault();e.stopImmediatePropagation();setFeatureSelection([]);cancelWallStroke();}
    };
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[wallActive,wallTool,featureSelection,deleteFeatures]);
  const strokeWall=(a:Pt,b:Pt):MapWall=>{
    const thickness=wallThickness*grid/(map?.feetPerSquare??5),id=crypto.randomUUID();
    if(wallTool==='circle'){const r=Math.hypot(b.x-a.x,b.y-a.y);return {id,kind:'circle',ax:a.x-r,ay:a.y-r,bx:a.x+r,by:a.y+r,thickness};}
    if(wallTool==='freehand'){
      const points=simplifyWallPath([...wallStroke.current,b],Math.max(.5,1.2/view.scale));
      return {id,kind:'path',ax:Math.min(...points.map(p=>p.x)),ay:Math.min(...points.map(p=>p.y)),bx:Math.max(...points.map(p=>p.x)),by:Math.max(...points.map(p=>p.y)),points,thickness};
    }
    return {id,ax:a.x,ay:a.y,bx:b.x,by:b.y,...(wallTool==='rectangle'?{kind:'rectangle' as const}:{thickness})};
  };
  const wallPoint=(p:Pt):Pt=>{
    for(const wall of map?.walls??[])for(const point of wallVertices(wall))
      if(Math.hypot(p.x-point.x,p.y-point.y)<10/view.scale)return point;
    const ox=map?.gridOffsetX??0,oy=map?.gridOffsetY??0;
    return wallSnap?{x:Math.round((p.x-ox)/grid)*grid+ox,y:Math.round((p.y-oy)/grid)*grid+oy}:p;
  };
  useEffect(()=>{setWallTool('off');setWallAnchor(null);setWallPointer(null);setSelectedDoor(null);setDismissedDoors([]);setDoorWallId(null);},[map?.id,mySocketId]);
  useEffect(()=>{
    if(!wallActive)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){cancelWallStroke();if(!wallAnchor&&!wallGesture.current)setWallTool('off');}};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[wallActive,wallAnchor]);
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
  const fogActive = actualDm && fogBrush !== 'off';
  const paintingRef = useRef(false);
  const strokeRef = useRef<Set<string>>(new Set());
  // Preview immediately for the DM; persist/broadcast at most four batches per
  // second while brushing. Stroke release always flushes the final cells.
  const mapFogMask=useRef<ManualFogHandle>(null),tokenFogMask=useRef<ManualFogHandle>(null);
  const pendingFogRef = useRef<string[]>([]);
  const pendingFogContext=useRef<{mapId:string;layer:FogLayer;reveal:boolean}>();
  const fogFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Emit the accumulated fog cells as ONE paint (a stroke is a single
   *  layer/direction, so those are constant across the batch). */
  const flushFog = () => {
    if (fogFlushRef.current) {
      clearTimeout(fogFlushRef.current);
      fogFlushRef.current = null;
    }
    const cells = pendingFogRef.current;
    const context=pendingFogContext.current;
    if (cells.length && context) {
      pendingFogRef.current = [];
      pendingFogContext.current=undefined;
      paintFog(context.mapId, context.layer, cells, context.reveal);
    }
  };


  useEffect(
    () => () => {
      flushFog();strokeRef.current.clear();paintingRef.current=false;
    },
    [map?.id],
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
  // Assisted Legacy needs an authorized mask sequence before interpolating.
  // Local Legacy computes sight at the displayed pose, just like local 2D/3D.
  presentation.sync(presentationSnapshot,pxPerFoot,performance.now(),legacy&&snapshot.legacyGeometry!==undefined&&!legacyMovement.playback||window.matchMedia('(prefers-reduced-motion: reduce)').matches,legacyMovement.playback);
  const dmSceneLighting=dmViewMode!=='dm';
  const environment = useMemo<EnvironmentPreviewSettings|undefined>(()=>{
    const saved=snapshot.map?.environment??DEFAULT_MAP_ENVIRONMENT;
    const carriedLanterns=snapshot.tokens.filter(t=>t.carriedLantern&&!t.isHidden&&!t.sharedSightOnly).map(t=>({id:t.id,x:t.x,y:t.y,diameter:(t.miniatureWidthFt??t.widthFt)*pxPerFoot,facing:t.facing??0}));
    if(legacy||!map || (!saved.enabled&&!carriedLanterns.length) || map.slidesUrl)return undefined;
    const settings=saved.enabled?saved:{...DEFAULT_MAP_ENVIRONMENT,enabled:true,shadows:false,mist:false};
    return {...settings,dmVisibility:isDm&&!dmSceneLighting,...(snapshot.playerVision&&!snapshot.playerVision.daylight?{darkvisionTerrain:[...(map.imagePath&&baseW&&baseH?[{url:map.imagePath,videoPath:animateMap?map.videoPath:undefined,x:0,y:0,w:baseW,h:baseH}]:[]),...tiles.map(t=>({url:t.imagePath,videoPath:animateMap?t.videoPath:undefined,x:t.x,y:t.y,w:t.w,h:t.h}))],darkvisionGrid:{size:map.gridHidden?0:grid,x:map.gridOffsetX??0,y:map.gridOffsetY??0}}:{}),carriedLanterns,overlay:true,mapUrl:'',mapX:extX0,mapY:extY0,mapWidth:imgW,mapHeight:imgH,
      walls:map.walls,lights:[...settings.lights,...(snapshot.playerVision?.lights??[]).filter(l=>!settings.lights.some(s=>s.id===l.id)&&!carriedLanterns.some(c=>c.id===l.id)).map(l=>({id:l.id,x:l.x,y:l.y,radiusFt:l.radius/pxPerFoot,heightFt:l.height/pxPerFoot,intensity:l.strength,color:'warm' as const,flicker:false,visibleTorch:false}))],
      ...(environmentQuality==='off'?{mist:false,weather:'none' as const,particles:'none' as const,lightning:false,groundWetness:0,shadows:false}:{}),
      scenery:false,pixelsPerFoot:pxPerFoot,mistCoverage:'map',mistHeight:settings.mistHeightFt*pxPerFoot,mistQuality:graphics.mistQuality,particleScale:graphics.particleScale,mapShadowSize:graphics.mapShadowSize,
      fog:!isDm&&mapFogEnabled?{grid,revealed:map.mapFogRevealed}:undefined};
  },[legacy,snapshot.map?.environment,animateMap,map?.videoPath,map?.walls,map?.environment,map?.imagePath,map?.gridHidden,map?.gridOffsetX,map?.gridOffsetY,baseW,baseH,tiles,map?.slidesUrl,snapshot.playerVision,snapshot.tokens,environmentQuality,graphics.resolved,extX0,extY0,imgW,imgH,pxPerFoot,isDm,dmSceneLighting,mapFogEnabled,grid,map?.mapFogRevealed]);


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
  const generateScenery = async (prompt: string) => {
    const { path, error } = await comfyGenerate(prompt, 'decal');
    if (!path) {
      notify(error || 'Generation failed ? is ComfyUI running with a checkpoint loaded?');
      return false;
    }
    await openPasteDialog(path);
    return true;
  };
  const [scaleLine, setScaleLine] = useState<{ origin: Pt; target: Pt } | null>(null);
  const [scalePrompt, setScalePrompt] = useState<{ lenPx: number } | null>(null);
  const [scaleFt, setScaleFt] = useState('');
  const scaleDrawRef = useRef(false);
  useEffect(() => {
    if (!orbTarget) return;
    setTool(null); setRemoveMode(false); setScaleMode(false); setMatchMode(false);
    setAnnotate(null); setTilesMode(false); setFogBrush('off'); setMenu(null);
  }, [orbTarget?.rollId]);
  const measureActive = !!areaCast || wallActive || !!tool || removeMode || scaleMode || matchMode || !!annotate;
  useEffect(()=>{if(tool||removeMode||scaleMode||matchMode||annotate||fogActive||tilesMode||placingLight||orbTarget){setWallTool('off');setWallAnchor(null);}},[tool,removeMode,scaleMode,matchMode,annotate,fogActive,tilesMode,placingLight,orbTarget]);
  // While a token is dragging (or measuring) the grid brightens for alignment.
  const gridRef=useRef<Konva.Group>(null);
  const privateDrag = useRef(false);
  const [doorDragPreview,setDoorDragPreview]=useState<{tokenId:string;ids:string[]}|null>(null);
  const [doorApproachTokenId,setDoorApproachTokenId]=useState<string|null>(null);
  useEffect(()=>{setDoorDragPreview(null);setDoorApproachTokenId(null);},[map?.id,mySocketId]);
  const handleDragActive = useStableCallback((active: boolean) => {
    privateDrag.current=active;
    for(const line of gridRef.current?.getChildren()??[]){line.setAttrs({stroke:active||measureActive?'#ffffffcc':'#ffffff5c',strokeWidth:active||measureActive?1.5:1});}
    gridRef.current?.getLayer()?.batchDraw();
    // A shared DM pointer must not disclose the otherwise private destination.
    if(active){hideCursor();setHover(null);}
  });
  const gridHot = measureActive;

  // Identity-stable token handlers so the memoized TokenShape only re-renders
  // when its own token/display actually changes (not on every snapshot).
  const handleTokenSelect = useStableCallback((tok: Token, additive: boolean) => {
    if(areaCast){placeSpellArea(tok);return;}
    if(tok.sharedSightOnly)return;
    if (orbTarget) setOrbTarget({...orbTarget,targetId:tok.id});
    else if (saveResolve) resolveSaveAt(tok.id);
    else onSelectToken(tok, additive);
    if(resolveToken(snapshot,tok).dead && !orbTarget && !saveResolve&&!explicitTokenInspection()){setDetailsExpanded(true);nudgeRightPanel();}
  });
  const handleTokenActivate = useStableCallback((tok: Token) => {
    if(areaCast)return;
    if(tok.sharedSightOnly)return;
    if (saveResolve || orbTarget) return;
    onSelectToken(tok, false);
    setDetailsExpanded(true); // open the player's read-only Details
    nudgeRightPanel(); // and pop the right drawer open (collapsed on phones)
  });
  const handleTokenMove = useStableCallback((tok: Token, x: number, y: number, placed?: (p: {x:number;y:number}) => void) => {
    if(actualDm)setDoorApproachTokenId(tok.id);
    onMoveToken(tok.id, x, y, placed);
    if (actualDm) {
      if (selectedIds.length <= 1 || !selectedIds.includes(tok.id)) onSelectToken(tok, false);
      if(!explicitTokenInspection())nudgeRightPanel();
    }
  });
  const handleTokenDragPreview = useStableCallback((tok: Token, point: {x:number;y:number;facing:number}|null) => {
    miniatureRef.current?.previewMove(tok.id, point);
    if(!point||(!actualDm&&(tok.kind!=='pc'||!snapshot.characters.some(c=>c.id===tok.refId&&c.claimedBy===mySocketId)))||doors.some(d=>d.tokenId===tok.id)){
      setDoorDragPreview(old=>old?.tokenId===tok.id?null:old);return;
    }
    const ids=doors.filter(d=>doorVisible(d)&&doorInReach({...tok,...point},d,pxPerFoot)).map(d=>d.id);
    if(!ids.length){setDoorDragPreview(old=>old===null?old:null);return;}
    // Enter/leave updates only: pointer motion within the same doorway zone
    // should not rerender the battlefield on every frame.
    setDoorDragPreview(old=>old?.tokenId===tok.id&&old.ids.join('|')===ids.join('|')?old:{tokenId:tok.id,ids});
  });
  const handleTokenMenu = useStableCallback((tok: Token, cx: number, cy: number) => {
    if(tok.sharedSightOnly)return;
    setHover(null);
    // Also aim the Combat section's target dropdown at the right-clicked token,
    // so closing the menu still leaves the side panel set up to attack it.
    setCombatTarget(tok.id);
    setMenu({ token: tok, x: cx, y: cy });
  });
  const handleTokenHover = useStableCallback((tok: Token, cx: number, cy: number) => {
    if(tok.sharedSightOnly)return;
    if(!privateDrag.current)setHover({ token: tok, x: cx, y: cy });
  });
  const handleTokenHoverEnd = useStableCallback(() => setHover(null));
  useEffect(()=>{
    const direct=(id:string)=>snapshot.tokens.some(t=>t.id===id&&!t.sharedSightOnly);
    if(menu&&!direct(menu.token.id))setMenu(null);
    if(!actualDm && selectedIds.some(id=>!direct(id))){
      if(onSelectTokens)onSelectTokens(selectedIds.filter(direct));else onSelectToken(null);
    }
    if(hover&&!direct(hover.token.id))setHover(null);
    if(orbTarget?.targetId&&!direct(orbTarget.targetId))setOrbTarget({...orbTarget,targetId:undefined});
  },[snapshot.tokens,menu,hover,orbTarget,setOrbTarget,actualDm,selectedIds,onSelectTokens,onSelectToken]);

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
  const snapPt = (p: Pt): Pt => {
    if (!snap) return p;
    const ox = map?.gridOffsetX ?? 0;
    const oy = map?.gridOffsetY ?? 0;
    return {
      x: Math.round((p.x - ox) / grid) * grid + ox,
      y: Math.round((p.y - oy) / grid) * grid + oy,
    };
  };
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
      (t) => !t.sharedSightOnly && Math.hypot(p.x - t.x, p.y - t.y) <= (readyMiniatures.has(t.id) ? miniatureBaseWidthFt(t, t.kind === 'monster' ? snapshot.monsters.find(m => m.id === t.refId) : { name: resolveToken(snapshot, t).name }) : t.widthFt) / fpp / 2,
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
    const k = perspectiveSlope(size.w, size.h, tiltDegrees);
    const yaw=rotationDegrees*Math.PI/180;
    const boundsW=Math.abs(Math.cos(yaw))*imgW+Math.abs(Math.sin(yaw))*imgH;
    const boundsH=Math.abs(Math.sin(yaw))*imgW+Math.abs(Math.cos(yaw))*imgH;
    const s = Math.min(size.w / (boundsW + size.w * boundsH * groundScaleY * k / 2),
      size.h / (boundsH * groundScaleY * (1 + size.h * k / 2))) || 1;
    // Centre the composite box, shifting by its (possibly negative) min corner.
    return {
      scale: s,
      x: (size.w - imgW * s) / 2 - extX0 * s,
      y: (size.h - imgH * s * groundScaleY) / 2 - extY0 * s * groundScaleY,
    };
  }, [size, imgW, imgH, extX0, extY0, groundScaleY, tiltDegrees, rotationDegrees]);

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
    const vh = size.h / (s * groundScaleY);
    const m = Math.max(vw, vh);
    return { x: -view.x / s - m, y: -view.y / (s * groundScaleY) - m, w: vw + 2 * m, h: vh + 2 * m };
  }, [view, size, groundScaleY]);

  const doors=(map?.walls??[]).filter(w=>w.door);
  const doorVisible=(door:typeof doors[number])=>actualDm||(!door.tokenId||snapshot.tokens.some(t=>t.id===door.tokenId))&&doorApproachPoints(door).some(p=>fogVisionContains(snapshot.playerVision,p.x,p.y,usesTokenVision(map))&&(!mapFogEnabled||mapRevealed.has(`${Math.floor(p.x/grid)},${Math.floor(p.y/grid)}`)));
  const nearbyDoors=doors.filter(d=>doorVisible(d)&&(actualDm?d.id===selectedDoor||sourceSnapshot.tokens.some(t=>t.id===doorApproachTokenId&&!doors.some(door=>door.tokenId===t.id)&&doorInReach(t,d,pxPerFoot)):snapshot.tokens.some(t=>t.kind==='pc'&&!t.isHidden&&snapshot.characters.some(c=>c.id===t.refId&&c.claimedBy===mySocketId)&&doorInReach(t,d,pxPerFoot))));
  const nearbyDoorKey=nearbyDoors.map(d=>d.id).sort().join('|');
  useEffect(()=>{
    // Leaving a door's reach clears its dismissal; snapshots and camera changes do not.
    const ids=new Set(nearbyDoorKey.split('|'));
    setDismissedDoors(old=>{const next=old.filter(id=>ids.has(id));return next.length===old.length?old:next;});
  },[nearbyDoorKey]);
  const activeDoorControls=nearbyDoors.filter(d=>!dismissedDoors.includes(d.id));
  const dismissDoorControls=()=>{setDismissedDoors(old=>[...new Set([...old,...nearbyDoors.map(d=>d.id)])]);if(actualDm)setSelectedDoor(null);};
  const operateDoor=(id:string,open:boolean)=>{if(map)useStore.getState().socket?.emit('map:setDoor',{mapId:map.id,doorId:id,open});};
  const miniatureVisibleAt = useMemo(() => {
    const ownerId = useStore.getState().socket?.id;
    const owned = new Set(snapshot.characters.filter(c => c.claimedBy === ownerId).map(c => c.id));
    const friendly = new Set(snapshot.monsters.filter(m => m.disposition === 'friendly').map(m => m.id));
    const tokens = new Map(snapshot.tokens.map(t => [t.id, { x:t.x, y:t.y, kind:t.kind, hidden: t.isHidden, sharedSightOnly: t.sharedSightOnly, revealedOnly:t.revealedOnly,
      owned: t.kind === 'pc' && owned.has(t.refId), foe: t.kind === 'monster' && !friendly.has(t.refId) }]));
    return (id: string, x: number, y: number) => {
      const token = tokens.get(id);
      // Accepted Legacy positions have already passed per-viewer server filtering.
      // Avoid repeating wall/light raycasts for every token during a flat redraw.
      if((legacy&&snapshot.legacyGeometry!==undefined)||(!presentation.moving()&&token&&x===token.x&&y===token.y))return !!token;
      // Area art is pixel-clipped to the player's sight and revealed fog in the 3D layer,
      // so it plays wherever any part of it is in view (the server already checked).
      if(!token&&(id.startsWith('area:')||id.startsWith('spike-area:')))return true;
      return !!token && (token.sharedSightOnly ? (token.kind==='pc' || (token.revealedOnly?fogVisionContains(presentation.personalVision(),x,y,false)&&tokenVisibleAt({...token,role:snapshot.role,mapFog:mapFogEnabled?mapRevealed:null,tokenFog:tokenFogEnabled?tokenRevealed:null,grid,x,y}):fogVisionContains(presentation.partyVision(),x,y,usesTokenVision(snapshot.map)))) :
        (token.owned || fogVisionContains(presentation.personalVision(),x,y,usesTokenVision(snapshot.map))) && tokenVisibleAt({ ...token, role: snapshot.role,
        mapFog: mapFogEnabled ? mapRevealed : null, tokenFog: tokenFogEnabled ? tokenRevealed : null, grid, x, y }));
    };
  }, [legacy,snapshot, mapFogEnabled, tokenFogEnabled, mapRevealed, tokenRevealed, grid]);
  const visibleAtRef = useRef(miniatureVisibleAt);
  visibleAtRef.current = miniatureVisibleAt;
  // Keep TokenShape's memo stable across unrelated snapshots while reading current fog.
  const tokenVisibleAtPosition = useCallback((id: string, x: number, y: number) => visibleAtRef.current(id, x, y), []);
  const requestMovementPreview=useCallback((token:Token,x:number,y:number,done:(result:import('../../../shared/movementPreview').MovementPreview|null)=>void)=>{
    const socket=useStore.getState().socket;if(!socket?.connected){done(null);return;}
    socket.timeout(1500).emit('token:preview',{tokenId:token.id,x,y},(error,result)=>done(error?null:result));
  },[]);
  const legacyAffinity=useMemo(()=>new Set(snapshot.legacyGeometry?.affinity??[]),[snapshot.legacyGeometry?.affinity]);

  // One RAF drives all anchors, including stationary enemies becoming visible.
  // Keeping this above individual layers also survives a 2D -> 3D or shared-sight
  // remount without restarting (or skipping) the moving figure's animation.
  useLayoutEffect(()=>{
    let frame=0,lastPaint=-Infinity;
    const tokens=new Map(presentationSnapshot.tokens.map(t=>[t.id,t]));
    const paint=()=>{
      const now=performance.now();
      if(legacy&&legacyMovement.playback&&now-lastPaint<1000/60){frame=requestAnimationFrame(paint);return;}
      lastPaint=now;presentation.advance(now);
      const moving=presentation.moving();
      for(const node of stageRef.current?.find<Konva.Group>('.token')??[]){
        const token=tokens.get(node.getAttr('tokenId'));if(!token)continue;
        const p=presentation.position(token.id)??token;
        const opacity=tokenVisibleAtPosition(token.id,p.x,p.y)?(token.isHidden?.45:1):0;
        const changed=(!node.isDragging()&&(node.x()!==p.x||node.y()!==p.y))||node.opacity()!==opacity;
        if(!node.isDragging())node.position(p);
        node.opacity(opacity);
        if(changed)node.getLayer()?.batchDraw();
        miniatureRef.current?.moveToken(token.id,p.x,p.y,!moving,token.facing);
      }
      visionRef.current?.frame(now);
      if(moving)frame=requestAnimationFrame(paint);
    };
    paint();return ()=>cancelAnimationFrame(frame);
  },[presentationSnapshot,readyMiniatures,presentation,tokenVisibleAtPosition,legacy,legacyMovement.playback?.id,legacyMovement.playback?.start]);

  // Prepare map art before a door opens. Only role-filtered tokens below can
  // create an instance; this deduplicated art list contains no hidden positions.
  // Content-stable: each snapshot rebuilds these arrays, which would otherwise
  // hand MiniatureLayer a "new" preload list on every update.
  const preloadMiniatures = useContentStable(useMemo(() => [...(use3dTokens || use3dMonsters ? [DEATH_SKULL] : []), ...(use3dTokens ? snapshot.characters.flatMap(character => {
    const definition = resolveMiniature(character.name, 'pc',character);
    return definition ? [miniatureForPreload(definition,graphics.modelQuality)] : [];
  }) : []), ...(use3dMonsters?miniaturePreloadDefinitions(snapshot.miniaturePreloadFamilies??[]):[])], [snapshot.characters, snapshot.miniaturePreloadFamilies, use3dTokens, use3dMonsters, graphics.modelQuality, miniatureCatalogRevision]));

  // A player's map fog, so the 3D layer clips spell art to revealed cells.
  const spellFog=useMemo(()=>!isDm&&mapFogEnabled&&map?{grid,revealed:map.mapFogRevealed,x0:extX0,y0:extY0,x1:extX1,y1:extY1}:undefined,
    [isDm,mapFogEnabled,map?.mapFogRevealed,grid,extX0,extY0,extX1,extY1]);
  // The 2D fallback (no WebGL) can't clip pixels: it keeps the old rule and
  // draws area art only when the area's anchor point is visible.
  const hpFx2d=useMemo(()=>isDm||!miniaturesUnavailable?hpFx:hpFx.filter(f=>!f.areaPosition||
    fogVisionContains(presentation.personalVision(),f.areaPosition.x,f.areaPosition.y,true)&&(!mapFogEnabled||mapRevealed.has(`${Math.floor(f.areaPosition.x/grid)},${Math.floor(f.areaPosition.y/grid)}`))),
    [hpFx,isDm,miniaturesUnavailable,mapFogEnabled,mapRevealed,grid,presentation]);
  // Content-stable so TokenShape's memo isn't defeated by each snapshot's fresh arrays.
  const terrainZones=useContentStable(useMemo(()=>snapshot.measurements.filter(m=>m.spellName==='Spike Growth').map(m=>({...m.origin,radiusFt:m.spellArea!.spec.sizeFt})),[snapshot.measurements]));
  const movementWalls=useContentStable(map?.walls);
  const miniatureTokens = useMemo<MiniatureToken[]>(() => snapshot.tokens.flatMap((token) => {
    if(legacy)return [];
    if(map?.walls?.some(w=>w.tokenId===token.id))return [];
    if (!(token.kind === 'pc' ? use3dTokens : use3dMonsters)) return [];
    // Only role-filtered tokens can create instances; background assets have no positions.
    if ((token.isHidden && !isDm) || hiddenGhosts.has(token.id)) return [];
    const monster = token.kind === 'monster' ? snapshot.monsters.find(m => m.id === token.refId) : undefined;
    const display = resolveToken(snapshot, token), dead = display.dead === true;
    const appearance=monster??snapshot.characters.find(c=>c.id===token.refId);
    const definition = dead ? DEATH_SKULL : miniatureForQuality(resolveMiniature(display.name, token.kind, appearance, token.refId),graphics.modelQuality);
    return definition ? [{ id: token.id, x: token.x, y: token.y,
      facing: token.facing ?? 0,
      mirrorImages:dead ? 0 : mirrorImageCount(display.conditions),
      sharedSightOnly: token.sharedSightOnly,
      invisible:token.invisible,
      carriedLantern:!dead && !token.sharedSightOnly && token.carriedLantern,
      combatRole: !dead && !token.sharedSightOnly && token.kind==='monster'&&!monster?.objectKind?token.combatRole:undefined,
      hunterMarked: !dead && !!token.markLabels?.some(label=>/hunter.s mark/i.test(label)),
      conditionColors: dead || token.sharedSightOnly ? [] : presentAuras(display.conditions.filter(c=>!c.id.startsWith("spell-mark:") || !/hunter.s mark/i.test(c.label))).map(a=>AURA_HEX[a]),
      outline: token.sharedSightOnly || (snapshot.serverRendering?.enabled&&snapshot.legacyGeometry!==undefined?!legacyAffinity.has(token.id):!visionShowsAffinity(snapshot.playerVision,token.x,token.y)) || monster?.objectKind ? undefined : monster ? DISPOSITION_HEX[monster.disposition] : DISPOSITION_HEX.friendly,
      tint: !dead && monster ? monsterTint(monster) : undefined,
      shade: !dead && monster && !monster.objectKind ? monsterVariation(productionFamily(monster), token.refId).shade : undefined,
      activeTurn: !token.sharedSightOnly && token.id === activeTurnTokenId,
      selected: !token.sharedSightOnly && (orbTarget ? orbTarget.targetId === token.id : selectedIds.includes(token.id)),
      diameter: miniatureBaseWidthFt(token, monster ?? { name: resolveToken(snapshot, token).name }) * pxPerFoot, hidden: token.isHidden, definition }] : [];
  }), [legacy,snapshot,legacyAffinity, isDm, pxPerFoot, activeTurnTokenId, selectedIds, orbTarget, use3dTokens, use3dMonsters, hiddenGhosts, miniatureCatalogRevision, graphics.modelQuality]);
  const miniatureIds=useMemo(()=>new Set(miniatureTokens.map(m=>m.id)),[miniatureTokens]);
  const doorTokenIds=new Set(doors.flatMap(d=>d.tokenId?[d.tokenId]:[]));
  useEffect(() => {
    if (!miniatureTokens.length) handleMiniatureReady(new Set());
  }, [miniatureTokens.length, handleMiniatureReady]);

  const readMiniatureNames=useMemo(()=>createMiniatureNameReader(),[]);
  const mapSpellEvent=(event:typeof hpFx[number]):SpellImpact[]=>{
    if(!weaponImpactStyle(event)&&(event.suppressSpellVisual||!spellImpactStyle(event)))return [];
    if(event.areaPosition){const p=event.areaPosition;if(p.mapId!==snapshot.map?.id)return [];return [{id:event.id,event,startAt:event.numberStartAt,tokenId:`area:${event.id}`,x:p.x,y:p.y,diameter:event.spell==='Dispel Magic'?Math.min(12,p.radiusFt*2)*pxPerFoot:p.radiusFt*2*pxPerFoot,fixed:true}];}
    const token=snapshot.tokens.find(t=>t.kind===event.kind&&t.refId===event.refId&&!t.sharedSightOnly&&(isDm||!t.isHidden));
    if(!token)return [];
    // The active restraint is already the visible impact; stacking an identical
    // transient mesh would briefly double its brightness and number of links.
    if(spellImpactStyle(event)?.kind==='chains'&&resolveToken(snapshot,token).conditions.some(c=>persistentSpellVisual(c)===event.spell))return [];
    const input={event,tokenId:token.id,x:token.x,y:token.y,diameter:miniatureTokens.find(t=>t.id===token.id)?.diameter??token.widthFt*pxPerFoot};
    return [...(!event.suppressSpellVisual&&spellImpactStyle(event)?[{...input,id:event.id,startAt:event.numberStartAt===undefined?undefined:event.numberStartAt+weaponTravelMs(event)}]:[]),
      ...(weaponImpactStyle(event)?[{...input,id:`weapon-${event.id}`,weaponOnly:true,startAt:event.numberStartAt}]:[])];
  };
  const preparedSpellImpacts=legacy?[]:preparedHpFx.flatMap(mapSpellEvent);
  const spellImpacts=useMemo<SpellImpact[]>(()=>legacy?[]:[...hpFx.flatMap(mapSpellEvent),...snapshot.measurements.filter(m=>m.spellName==='Spike Growth').map(m=>({id:`spike-area:${m.id}`,tokenId:`spike-area:${m.id}`,x:m.origin.x,y:m.origin.y,diameter:40*pxPerFoot,persistent:true,fixed:true,event:{kind:'pc' as const,refId:'',delta:0,spell:'Spike Growth',effect:'spell-area' as const}})),...snapshot.tokens.flatMap(token=>{
    if(token.sharedSightOnly||(!isDm&&token.isHidden))return [];
    return resolveToken(snapshot,token).conditions.flatMap(condition=>{
      const spell=persistentSpellVisual(condition);if(!spell||isRollImpactPending(condition.combatEffect?.visualRollId))return [];
      return [{id:`active:${token.id}:${condition.id}`,tokenId:token.id,x:token.x,y:token.y,persistent:true,
        diameter:miniatureTokens.find(t=>t.id===token.id)?.diameter??token.widthFt*pxPerFoot,
        event:{kind:token.kind,refId:token.refId,delta:0,spell}}];
    });
  })],[legacy,hpFx,snapshot,miniatureTokens,pxPerFoot,isDm,spellRollFx]);
  const readSharedNames=useMemo(()=>createMiniatureNameReader(),[]);
  const miniatureNameLabels = useStableCallback(() => [...readMiniatureNames(tokenLayerRef.current,
    id=>selectedIds.includes(id)||hover?.token.id===id||orbTarget?.targetId===id), ...readSharedNames(sharedTokenLayerRef.current,()=>false)]);
  const handleRenderedNames = useCallback((ids: ReadonlySet<string>) => {
    for(const layer of [tokenLayerRef.current, sharedTokenLayerRef.current]) {
      if(!layer)continue;
      setMiniatureNamesRendered(layer,ids);
    }
  },[]);

  const paintPan = useStableCallback((position:Pt) => {
    for (const layer of [layerRef.current, legacyFootstepsLayerRef.current, groundTokenLayerRef.current, tokenLayerRef.current, sharedTokenLayerRef.current, spellAreaLayerRef.current]) {
      if (layer) { layer.position(position); layer.draw(); }
    }
    miniatureRef.current?.setView({ ...view, ...position });
    visionRef.current?.camera({view:{...view,...position}});
  });
  const panFrames=useMemo(()=>createLatestFrame(paintPan,run=>requestBattlefieldFrame(run,'camera'),cancelBattlefieldFrame),[paintPan]);
  useEffect(()=>()=>panFrames.cancel(),[panFrames,map?.id,legacy]);

  // Flat tokens belong to the ground plane, beneath miniature geometry.
  // Only ready miniature HUDs and shared tools belong above WebGL. Konva
  // keeps all hit regions so changing visual depth never changes input ownership.
  useEffect(() => {
    const background = layerRef.current?.getNativeCanvasElement();
    const groundTokens = groundTokenLayerRef.current?.getNativeCanvasElement();
    const foreground = tokenLayerRef.current?.getNativeCanvasElement();
    if (background) background.style.zIndex = legacyTerrain?'1':'0';
    if (groundTokens) groundTokens.style.zIndex = legacyTerrain?'1':'0';
    if (foreground) foreground.style.zIndex = '2';
    const shared=sharedTokenLayerRef.current?.getNativeCanvasElement();
    if(shared){shared.style.zIndex='4';shared.style.filter=map?.explorationMode==='revealed'?'none':'grayscale(1)';shared.style.opacity=map?.explorationMode==='revealed'?'1':'.78';shared.style.pointerEvents='none';shared.dataset.testid='shared-sight-hud';}
  }, [dprKey, legacy, map?.id, map?.slidesUrl, map?.imagePath,map?.explorationMode,legacyTerrain]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    // Legacy uses an unrotated, untilted stage. Native Konva canvases and input
    // avoid allocating the oversized scene/hit/warp buffers needed for 3D orbit.
    if (!stage) return;
    for (const layer of stage.getLayers()) if (layer.getCanvas().getPixelRatio() !== konvaPixelRatio) layer.getCanvas().setPixelRatio(konvaPixelRatio);
    const tilt = legacy ? 0 : projectionState.current.tilt, rotation = legacy ? 0 : projectionState.current.rotation;
    const perspectiveLayers=legacy?[]:[layerRef.current,groundTokenLayerRef.current,tokenLayerRef.current,sharedTokenLayerRef.current,spellAreaLayerRef.current].filter((layer):layer is Konva.Layer=>!!layer);
    const canvases=perspectiveLayers.map(layer=>installPerspectiveCanvas(layer,size.w,size.h,tilt,rotation));
    projectionCanvases.current=canvases;
    const input=legacy?undefined:installPerspectiveInput(stage,size.w,size.h,tilt,rotation,()=>projectionState.current);
    const retainedLayers=retained?[groundTokenLayerRef.current,sharedTokenLayerRef.current,...(legacy?[]:[tokenLayerRef.current])].filter((l):l is Konva.Layer=>!!l).map(layer=>installRetainedTokenLayer(layer,canvases[perspectiveLayers.indexOf(layer)]?.buffer)):[];
    for (const layer of stage.getLayers()) layer.draw();
    // Dispose wrappers in reverse order: the retained paint delegates to the
    // perspective buffer, whose padding must remain valid until it is removed.
    return () => {retainedLayers.forEach(dispose=>dispose());input?.();canvases.forEach(dispose=>dispose());projectionCanvases.current=[];};
  }, [size.w, size.h, dprKey, konvaPixelRatio, legacy, retained, map?.id, map?.slidesUrl, map?.imagePath]);

  const selectionBox = useBoxSelection({
    enabled: actualDm && !!map && !measureActive && !fogActive && !onPlaceAt && !tilesMode && !saveResolve && !orbTarget,
    mapId: map?.id, stageRef, tokens: snapshot.tokens, selectedIds, onSelectTokens, onSelectToken,
    view, width: size.w, height: size.h, tilt: tiltDegrees, rotation: rotationDegrees,
  });
  const featureBox=useBoxSelection({enabled:wallActive&&wallTool==='edit',mapId:map?.id,stageRef,tokens:[],selectedIds:featureSelection,onSelectTokens:setFeatureSelection,onSelectToken:()=>{},
    items:[...(map?.walls??[]).map(w=>({...wallCenter(w),id:`wall:${w.id}`,points:wallVertices(w)})),...(map?.environment?.lights??[]).map(l=>({id:`light:${l.id}`,x:l.x,y:l.y}))],
    onClickAt:p=>{const flat=unprojectGround(p.x,p.y,size.w,size.h,tiltDegrees,rotationDegrees);selectFeature(pickFeature(screenToMap(flat.x,flat.y,view,tiltDegrees)),true);},
    view,width:size.w,height:size.h,tilt:tiltDegrees,rotation:rotationDegrees});
  const activeSelectionBox=wallActive&&wallTool==='edit'?featureBox:selectionBox;

  /**
   * Map-corner overlays that belong to the map REGARDLESS of how it's drawn —
   * the dice corner (with its adv/dis switch), the two-step damage prompt, and
   * the roll-log overlay. They're rendered by both the Konva path and the Slides
   * path below: a landed hit has to be rollable, and a roll has to be armable,
   * whichever kind of map the table happens to be on.
   */
  const mapOverlays = (
    <>
      {showRollOverlay && !fullChatVisible && (
        <BoardRollFeed/>
      )}
      {showDiceButton && <DiceButtonOverlay selectedIds={selectedIds} />}
      {actualDm && <DamagePrompt />}
    </>
  );

  // Focus requests (DM "Next turn"): centre the token only when it's near the
  // edge or off-screen — never yank a camera that already shows it. Projecting
  // through the same tilt/rotation as the box-select keeps 45° views correct;
  // the screen centre is a fixed point of that projection, so centring solves
  // directly for the view.
  const focusNonce = useRef<number>();
  // Keep hooks above the Slides/empty-map returns so switching map kinds
  // preserves React's hook order.
  const serverTokenLayerSet=useMemo(()=>new Set(snapshot.tokenLayerIds??[]),[snapshot.tokenLayerIds]);
  const selectedIdSet=useMemo(()=>new Set(selectedIds),[selectedIds]);
  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === focusNonce.current) return;
    focusNonce.current = focusRequest.nonce;
    const token = snapshot.tokens.find((t) => t.id === focusRequest.tokenId);
    if (!token || !size.w || !size.h) return;
    const ground = mapToScreen(token.x, token.y, view, tiltDegrees);
    const p = projectGround(ground.x, ground.y, size.w, size.h, tiltDegrees, rotationDegrees);
    const inset = 0.15;
    if (p.x >= size.w * inset && p.x <= size.w * (1 - inset) && p.y >= size.h * inset && p.y <= size.h * (1 - inset)) return;
    userAdjusted.current = true;
    setView((v) => ({ ...v, x: size.w / 2 - token.x * v.scale, y: size.h / 2 - token.y * v.scale * groundYScale(tiltDegrees) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  // Google Slides maps render as an embedded iframe instead of a canvas.
  if (map?.slidesUrl && !map.imagePath) {
    return (
      <div className="stage-wrap" data-render-mode={legacy?'legacy':'standard'} data-retained-rendering={String(retained)} ref={containerRef}>
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
    return screenToMap(p.x, p.y, view, tiltDegrees);
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
      const context={mapId:map.id,layer:paintLayer,reveal:fogBrush==='reveal'},old=pendingFogContext.current;
      if(old&&(old.mapId!==context.mapId||old.layer!==context.layer||old.reveal!==context.reveal))flushFog();
      pendingFogContext.current=context;
      (paintLayer==='map'?mapFogMask:tokenFogMask).current?.preview(fresh,fogBrush==='reveal');
      pendingFogRef.current.push(...fresh);
      if (!fogFlushRef.current) fogFlushRef.current = setTimeout(flushFog, 250);
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

  const handleMouseDown = async (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    if(teleportCast&&(!('button'in e.evt)||e.evt.button===0)){const p=pointerToImage(stage);if(p)setTeleportPoint(p);return;}
    if(areaCast&&(!('button'in e.evt)||e.evt.button===0)){const p=pointerToImage(stage);if(p)placeSpellArea(p);return;}
    // Two fingers down → start a pinch-zoom (and suspend panning/drawing).
    const touches = (e.evt as TouchEvent).touches;
    if (touches && touches.length >= 2) {
      e.evt.preventDefault();
      pinchRef.current = pinchData(touches);
      setPinching(true);
      return;
    }
    if(wallActive&&map){
      if('button' in e.evt&&e.evt.button!==0)return;
      const raw=pointerToImage(stage);if(!raw)return;
      if(wallTool==='erase'){
        const wall=(map.walls??[]).reduce<import('../../../shared/mapWalls').MapWall|undefined>((best,w)=>!best||distanceToWall(raw,w)<distanceToWall(raw,best)?w:best,undefined);
        if(wall&&distanceToWall(raw,wall)<14/view.scale)useStore.getState().editMapWalls(map.id,{removeId:wall.id});
      }else if(wallTool==='erase-area'){
        setWallAnchor(raw);setWallPointer(raw);
      }else if(wallTool==='door'){
        const wall=(map.walls??[]).filter(w=>!w.door).sort((a,b)=>distanceToWall(raw,a)-distanceToWall(raw,b))[0];
        if(!wall||distanceToWall(raw,wall)>14/view.scale){notify('Start the door on an existing wall, then drag along its width.');return;}
        setDoorWallId(wall.id);setWallAnchor(raw);setWallPointer(raw);
      }else if(wallTool==='edit'){
        const additive='shiftKey'in e.evt&&(e.evt.shiftKey||e.evt.ctrlKey||e.evt.metaKey);
        if(additive){selectFeature(pickFeature(raw),true);return;}
        if(selectedWall&&Math.hypot(raw.x-rotationHandle(selectedWall).x,raw.y-rotationHandle(selectedWall).y)<14/view.scale){wallGesture.current={mode:'rotate',wall:selectedWall,start:raw};return;}
        const id=pickFeature(raw);selectFeature(id);
        const wall=id?.startsWith('wall:')?map.walls?.find(w=>w.id===id.slice(5)):undefined;
        if(wall)wallGesture.current={mode:'move',wall,start:raw};
      }else{
        const p=wallPoint(raw);setWallAnchor(p);setWallPointer(p);wallStroke.current=[p];
      }
      return;
    }
    if(placingLight&&map&&lightPlacement&&(!('button' in e.evt)||e.evt.button===0)){
      const pos=pointerToImage(stage);
      if(pos){
        useStore.getState().placeMapLight(map.id,pos.x,pos.y,lightPlacement.lightId);
        if(lightPlacement.lightId)placeLight(null);
      }
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
        const mapId=map?.id;
        const text = (await requestText({title:'Add map label',message:'Enter the text to place at the chosen map location.',acceptLabel:'Add label'}))?.trim();
        if (text&&mapId===useStore.getState().snapshot?.map?.id) addAnnotation({ kind: 'text', x: pos.x, y: pos.y, text, color: annoColor });
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
    // Perspective exposes space outside the projected canvas. It has no raster
    // hit pixel, so explicitly grab the ground layer when the Stage is hit.
    if (e.target === stage && panning && (!('button' in e.evt) || e.evt.button === 0)) layerRef.current?.startDrag();
  };

  // Release on the stage: a near-stationary empty-space press was a click →
  // deselect; a press that moved was a pan → keep the selection. Then run the
  // normal stroke-end handling.
  const handlePointerUp = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if(wallActive&&wallTool==='erase-area'&&wallAnchor&&map&&!pinchRef.current){
      const stage=e.target.getStage(),p=stage?pointerToImage(stage):null;
      if(p&&Math.abs(p.x-wallAnchor.x)>=1&&Math.abs(p.y-wallAnchor.y)>=1)useStore.getState().editMapWalls(map.id,{eraseArea:{ax:wallAnchor.x,ay:wallAnchor.y,bx:p.x,by:p.y}});
      setWallAnchor(null);setWallPointer(null);
    }
    if(wallActive&&wallTool==='door'&&wallAnchor&&doorWallId&&map&&!pinchRef.current){
      const stage=e.target.getStage(),p=stage?pointerToImage(stage):null;
      if(p)useStore.getState().editMapWalls(map.id,{door:{wallId:doorWallId,id:crypto.randomUUID(),tokenId:snapshot.tokens.find(t=>selectedIds.includes(t.id)&&snapshot.monsters.some(m=>m.id===t.refId&&m.objectKind==='door'))?.id,ax:wallAnchor.x,ay:wallAnchor.y,bx:p.x,by:p.y}});
      setWallAnchor(null);setWallPointer(null);setDoorWallId(null);
    }
    if(wallActive&&wallTool==='edit'&&wallGesture.current&&map){
      if(wallPreview)useStore.getState().editMapWalls(map.id,{update:wallPreview});
      wallGesture.current=null;setWallPreview(null);
    }
    if(wallActive&&['rectangle','draw','circle','freehand'].includes(wallTool)&&wallAnchor&&map&&!pinchRef.current){
      const stage=e.target.getStage(),raw=stage?pointerToImage(stage):null;
      if(raw){
        const p=wallTool==='freehand'?raw:wallPoint(raw),[wall]=sanitizeWalls([strokeWall(wallAnchor,p)]);
        if(wall){
          useStore.getState().editMapWalls(map.id,{add:wall});
        }else if(Math.hypot(p.x-wallAnchor.x,p.y-wallAnchor.y)>2/view.scale){notify('Invalid wall shape. Try drawing the stroke again.');
        }
      }
      setWallAnchor(null);setWallPointer(null);
    }
    const start = clickStart.current;
    clickStart.current = null;
    if (start) {
      const p = e.target.getStage()?.getPointerPosition();
      if (p && Math.hypot(p.x - start.x, p.y - start.y) <= 5) onSelectToken(null);
    }
    endStroke();
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if(areaCast&&areaActor){const s=e.target.getStage(),p=s?pointerToImage(s):null;if(p){setAreaPointer(p);
      if(!areaDirectionLocked){const o=areaCast.spec.self?areaActor:areaPoints[0];if(o)setAreaAngle(Math.atan2(p.y-o.y,p.x-o.x));}}
      return;
    }
    const touches = (e.evt as TouchEvent).touches;
    if (touches && touches.length >= 2 && pinchRef.current) {
      e.evt.preventDefault();
      const next = pinchData(touches);
      zoomAtPoint(next.dist / pinchRef.current.dist, next.cx, next.cy);
      pinchRef.current = next;
      return;
    }
    if(wallActive){const stage=e.target.getStage(),p=stage?pointerToImage(stage):null;
      if(p){
        setWallPointer(wallTool==='freehand'||wallTool==='edit'||wallTool==='erase-area'?p:wallPoint(p));
        if(wallTool==='freehand'&&wallAnchor){const last=wallStroke.current.at(-1)!;if(Math.hypot(p.x-last.x,p.y-last.y)>2/view.scale)wallStroke.current.push(p);}
        const g=wallGesture.current;
        if(g){
          if(g.mode==='move'){const q=wallSnap?wallPoint(p):p;setWallPreview(translateWall(g.wall,q.x-g.start.x,q.y-g.start.y));}
          else{const c=wallCenter(g.wall),delta=(Math.atan2(p.y-c.y,p.x-c.x)-Math.atan2(g.start.y-c.y,g.start.x-c.x))*180/Math.PI;setWallPreview({...g.wall,rotation:((g.wall.rotation??0)+delta+360)%360});}
        }
      }hideCursor();return;}
    // Live "laser pointer": broadcast my cursor (throttled ~20/s) so others see
    // what I'm pointing at — independent of any active tool.
    const cursorStage = e.target.getStage();
    if (cursorStage && map && !privateDrag.current) {
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
    if(wallActive)cancelWallStroke();
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
    const center = unprojectGround((a.clientX + b.clientX) / 2 - ox, (a.clientY + b.clientY) / 2 - oy, size.w, size.h, tiltDegrees, rotationDegrees);
    return {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
      cx: center.x,
      cy: center.y,
    };
  };

  // Upload an image file and place it as a new map tile, butted up to the right
  // edge of the current map so it naturally extends the battlemap. Scaled down
  // if huge so it isn't unwieldy. Enters arrange mode so it can be nudged.
  const addTileFromFile = async (file: File) => {
    if (!map) return;
    const fd=new FormData();fd.append('image',file);
    notify('Uploading / preparing map tile...');
    const res=await apiFetch('/api/map-media',{method:'POST',body:fd}).catch(()=>null);
    if(!res||!res.ok){const data=await res?.json().catch(()=>null);notify(data?.error??'Could not upload that map tile.');return;}
    const {imagePath:icon,videoPath,width,height}=await res.json();
    const dims={w:width,h:height};
    // Clamp a giant upload so it's not many times the existing map.
    const cap = Math.max(imgW, 2000);
    const sc = dims.w > cap ? cap / dims.w : 1;
    const w = dims.w * sc;
    const h = dims.h * sc;
    // Land it butted to the current right edge (the DM then drags it anywhere).
    // The scale is grid-based, so this just ADDS area — no rescale needed.
    addMapImage({ mapId: map.id, imagePath: icon, videoPath, x: extX1, y: extY0, w, h });
    setTilesMode(true);
  };

  // Pan by dragging empty canvas (disabled while placing or painting fog).
  const panning = !placingLight && !onPlaceAt && !fogActive && !measureActive && !pinching;
  const handleLayerDragMove = (e: KonvaEventObject<DragEvent>) => {
    if (e.target.getClassName() !== 'Layer') return;
    const position={x:e.target.x(),y:e.target.y()};
    // Legacy's precomputed mask/terrain only need cheap DOM transforms here.
    // Keep them aligned immediately; defer the canvas redraws to one RAF.
    if(legacy)visionRef.current?.camera({view:{...view,...position}});
    panFrames.push(position);
  };
  const handleLayerDragEnd = (e: KonvaEventObject<DragEvent>) => {
    // dragend bubbles; only react to the layer itself panning, not token drags.
    if (e.target.getClassName() !== 'Layer') return;
    panFrames.push({x:e.target.x(),y:e.target.y()});panFrames.flush();
    // Pan synchronizes several layers, while Konva's release paint refreshes
    // only the directly dragged layer. Retained hit maps skipped paints during
    // the drag, so refresh every synchronized layer before the next pointer
    // event. Their scene pixels are already current; only input needs repaint.
    for (const layer of [layerRef.current, legacyFootstepsLayerRef.current, groundTokenLayerRef.current, tokenLayerRef.current, sharedTokenLayerRef.current, spellAreaLayerRef.current]) {
      layer?.drawHit();
    }
    userAdjusted.current = true;
    setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
  };

  const resetView = () => {
    userAdjusted.current = false;
    setView(fit);
  };


  const paintProjection = (tilt:number,rotation:number,nextView:View) => {
    const previous=projectionState.current;
    projectionState.current={tilt,rotation};
    for(const canvas of projectionCanvases.current)canvas.update(tilt,rotation);
    for(const layer of [layerRef.current,legacyFootstepsLayerRef.current,groundTokenLayerRef.current,tokenLayerRef.current,sharedTokenLayerRef.current,spellAreaLayerRef.current]){
      if(!layer)continue;
      if(previous.tilt!==tilt){layer.position({x:nextView.x,y:nextView.y});layer.scale({x:nextView.scale,y:nextView.scale*groundYScale(tilt)});}
      const labels=layer.find('.token-upright-hud');
      for(const label of labels){label.rotation(-rotation);invalidateRetainedToken(label);}
      if(previous.tilt!==tilt || labels.length)layer.draw();
    }
    miniatureRef.current?.setProjection(tilt,rotation,nextView);
    visionRef.current?.camera({tilt,rotation,view:nextView});
    if(rotationLabel.current)rotationLabel.current.hidden=Math.abs(rotation%360)<.01;
  };
  const commitProjection=(tilt:number,rotation:number,nextView:View)=>{
    setTiltDegrees(tilt);setRotationDegrees(rotation);setView(nextView);
    safeSetItem(rotationKey,String(rotation%360));
  };
  const animateView = (nextTilt: number, nextRotation: number) => {
    if(legacy)return;
    cancelBattlefieldFrame(viewAnimation.current);userAdjusted.current=true;
    const {tilt:startTilt,rotation:startRotation}=projectionState.current,startView=view;
    const targetRotation=startRotation+((nextRotation-startRotation+180)%360+360)%360-180;
    const centerY=(size.h/2-view.y)/groundYScale(startTilt),started=performance.now();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick=(now:number)=>{
      const t=reduced?1:Math.min(1,(now-started)/450),ease=t*t*(3-2*t);
      const angle=startTilt+(nextTilt-startTilt)*ease,rotation=startRotation+(targetRotation-startRotation)*ease;
      const nextView={...startView,y:size.h/2-centerY*groundYScale(angle)};
      paintProjection(angle,rotation,nextView);
      if(t<1)viewAnimation.current=requestBattlefieldFrame(tick,'camera');else commitProjection(angle,rotation,nextView);
    };
    viewAnimation.current=requestBattlefieldFrame(tick,'camera');
  };
  const chooseTilt = (next: boolean) => {
    if(next===tilted)return;
    setTilted(next);safeSetItem(viewPreferenceKey,next?'tilted':'flat');
    animateView(next?BATTLEFIELD_TILT_DEGREES:0,projectionState.current.rotation);
  };
  const rotateStart=(event:React.PointerEvent<HTMLDivElement>)=>{
    const target=event.target;
    if(legacy||event.button!==2 || !(target instanceof Element) || !(target.closest('.konvajs-content')||target===event.currentTarget))return false;
    const stage=stageRef.current;stage?.setPointersPositions(event.nativeEvent);
    const point=stage?.getPointerPosition();
    if(point && stage?.getIntersection(point)?.findAncestor('.token',true))return false;
    event.preventDefault();event.stopPropagation();cancelBattlefieldFrame(viewAnimation.current);
    userAdjusted.current=true;setMenu(null);setHover(null);
    rotationGesture.current={x:event.clientX,start:projectionState.current.rotation,angle:projectionState.current.rotation,pointerId:event.pointerId,frame:0,view};
    event.currentTarget.setPointerCapture(event.pointerId);return true;
  };
  const rotateMove=(event:React.PointerEvent<HTMLDivElement>)=>{
    const gesture=rotationGesture.current;if(!gesture || gesture.pointerId!==event.pointerId)return false;
    event.preventDefault();event.stopPropagation();gesture.angle=gesture.start+(event.clientX-gesture.x)*.35;
    if(!gesture.frame)gesture.frame=requestBattlefieldFrame(()=>{gesture.frame=0;paintProjection(projectionState.current.tilt,gesture.angle,gesture.view);},'camera');
    return true;
  };
  const rotateEnd=(event:React.PointerEvent<HTMLDivElement>)=>{
    const gesture=rotationGesture.current;if(!gesture || gesture.pointerId!==event.pointerId)return false;
    event.preventDefault();event.stopPropagation();cancelBattlefieldFrame(gesture.frame);
    paintProjection(projectionState.current.tilt,gesture.angle,gesture.view);
    commitProjection(projectionState.current.tilt,gesture.angle,gesture.view);rotationGesture.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);return true;
  };

  const entities=tokenEntityIndex(snapshot),myClaimedCharId=snapshot.characters.find(ch=>ch.claimedBy===mySocketId)?.id;
  const renderTokens = (miniatures: boolean, shared = false) => snapshot.tokens.filter(t=>!!t.sharedSightOnly===shared).filter(t=>!doorTokenIds.has(t.id)).filter((token) =>
    !hiddenGhosts.has(token.id) && (readyMiniatures.has(token.id) && miniatureIds.has(token.id)) === miniatures,
  ).map((t) => {
    const d = resolveToken(snapshot, t);
    const creature = t.kind === 'pc' ? entities.characters.get(t.refId) : entities.monsters.get(t.refId);
    const movementSpeed = creature && 'speed' in creature ? walkingSpeedFeet(creature) : undefined;
    const hasteDash = creature && activeHasteCondition(creature)?.combatEffect?.hasteActionUsed === 'dash';
    // Players may drag only their side: PCs + friendly creatures,
    // never objects. Mirrors the server's token:move gate — without
    // this the drag succeeds locally (a ghost move on the player's
    // screen) even though the server rejects it.
    const movable =
      actualDm ||
      t.kind === 'pc' ||
      (d.disposition === 'friendly' && (!d.objectKind || !!creature && 'modelType' in creature && creature.modelType==='spiritual-weapon' && creature.conditions.some(c=>c.combatEffect?.casterId===myClaimedCharId)));
    return (
      <TokenShape
        key={t.id}
        token={t}
        serverLayer={legacy&&!!snapshot.tokenLayerRaster&&serverTokenLayerSet.has(t.id)}
        serverSprite={snapshot.tokenSprites?.[t.id]}
        cacheArtwork={snapshot.serverRendering?.enabled===true}
        presentation={presentation}
        reducedEffects={legacy}
        sharedDarkvision={!!t.sharedSightOnly&&!!snapshot.playerVision?.heavy&&map?.explorationMode!=='revealed'}
        display={d}
        gridSizePx={grid}
        pxPerFoot={pxPerFoot}
        miniatureReady={miniatures}
        miniaturePending={!miniatures && !miniaturesUnavailable && !failedMiniatures.has(t.id) && miniatureIds.has(t.id)}
        hideAffinity={!!t.sharedSightOnly || (snapshot.serverRendering?.enabled&&snapshot.legacyGeometry!==undefined?!legacyAffinity.has(t.id):!visionShowsAffinity(snapshot.playerVision,t.x,t.y))}
        viewRotation={rotationDegrees}
        miniatureDiameterFt={miniatureBaseWidthFt(t, t.kind === 'monster' ? entities.monsters.get(t.refId) : { name: d.name })}
        movementWalls={actualDm?undefined:movementWalls}
        onServerPreview={snapshot.serverRendering?.enabled&&snapshot.legacyGeometry!==undefined?requestMovementPreview:undefined}
        terrainZones={terrainZones}
        movementAllowanceFt={movementSpeed === undefined ? undefined : movementSpeed * (hasteDash ? 2 : 1)}
        draggable={
          !t.sharedSightOnly && draggableTokens && movable && (actualDm || !speedIsZero(creature ?? {})) && !fogActive && !measureActive && !saveResolve && !orbTarget
        }
        listening={!t.sharedSightOnly && !measureActive}
        selected={!t.sharedSightOnly && (orbTarget ? orbTarget.targetId === t.id : selectedIdSet.has(t.id))}
        activeTurn={!t.sharedSightOnly && t.id === activeTurnTokenId}
        initiativeRank={initiativeRank.get(t.id) ?? null}
        onSelect={handleTokenSelect}
        onActivate={handleTokenActivate}
        onMove={handleTokenMove}
        onContextMenu={handleTokenMenu}
        onHover={handleTokenHover}
        onHoverEnd={handleTokenHoverEnd}
        onDragActive={handleDragActive}
        onDragPreview={handleTokenDragPreview}
        onVisualMove={handleTokenVisualMove}
        isVisibleAt={tokenVisibleAtPosition}
      />
    );
  });

  return (
    <div className="stage-wrap" data-motion-stage={legacyMovement.playback?'playing':'2'} data-render-mode={legacy?'legacy':'standard'} data-retained-rendering={String(retained)} ref={containerRef} {...activeSelectionBox.handlers}
      onPointerDownCapture={e=>{if(!rotateStart(e))activeSelectionBox.handlers.onPointerDownCapture(e);}}
      onPointerMoveCapture={e=>{if(!rotateMove(e))activeSelectionBox.handlers.onPointerMoveCapture(e);}}
      onPointerUpCapture={e=>{if(!rotateEnd(e))activeSelectionBox.handlers.onPointerUpCapture(e);}}
      onPointerCancelCapture={e=>{if(!rotateEnd(e))activeSelectionBox.handlers.onPointerCancelCapture();}}
      onLostPointerCapture={e=>{if(!rotateEnd(e))activeSelectionBox.handlers.onLostPointerCapture();}}
      // Safari may retarget contextmenu to this wrapper while it owns pointer
      // capture. Cover that target too, preserving token context-menu bubbling.
      onContextMenuCapture={e=>{const target=e.target;if(target instanceof Element&&(target===e.currentTarget||target.closest('.konvajs-content')||target instanceof HTMLCanvasElement))e.preventDefault();}}
      onDragStartCapture={e=>{if(e.target instanceof HTMLCanvasElement)e.preventDefault();}}>
      {activeSelectionBox.box && <div className="dm-selection-box" data-testid="dm-selection-box" aria-hidden="true"
        style={{ left: Math.min(activeSelectionBox.box.start.x, activeSelectionBox.box.end.x), top: Math.min(activeSelectionBox.box.start.y, activeSelectionBox.box.end.y),
          width: Math.abs(activeSelectionBox.box.end.x - activeSelectionBox.box.start.x), height: Math.abs(activeSelectionBox.box.end.y - activeSelectionBox.box.start.y) }} />}
      {placingLight&&<div className="environment-placement-hint" role="status">{lightPlacement?.lightId?'Click map to move light':'Click repeatedly to place lights'} · <button onClick={()=>placeLight(null)}>Done</button></div>}
      {!map && <div className="stage-empty">No active map yet.</div>}
      {map && (
        <>
          {toolSlot && createPortal(<div className="map-view-controls" role="group" aria-label="Map view controls">
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
            <span className="map-rotation-controls" role="group" aria-label="Map rotation">
              <button className="btn tiny" aria-label="Rotate map left" disabled={legacy}
                title={legacy?'Legacy mode uses a fixed overhead view':'Rotate view left 15°'}
                onClick={()=>animateView(tilted?BATTLEFIELD_TILT_DEGREES:0,projectionState.current.rotation-15)}>↶</button>
              <button className="btn tiny" aria-label="Rotate map right" disabled={legacy}
                title={legacy?'Legacy mode uses a fixed overhead view':'Rotate view right 15°'}
                onClick={()=>animateView(tilted?BATTLEFIELD_TILT_DEGREES:0,projectionState.current.rotation+15)}>↷</button>
            </span>
            <CompactToolbarMenu label="View">
            <LegacyModeControl toolbar/>
            <ServerRenderingOwnerControls/>
            <div className="battlefield-view-options" role="group" aria-label="Your battlefield view">
              <span className="muted">Your view</span>
              {actualDm&&<select className="btn tiny" aria-label="Battlefield visibility" value={dmViewMode}
                title="Only changes this DM window. Player view combines the party's current sight without changing fog or character claims."
                onChange={e=>setDmViewMode(e.target.value as typeof dmViewMode)}>
                <option value="dm">DM visibility</option><option value="scene">Scene lighting</option><option value="player">Player view</option>
              </select>}
              {partyPreview&&<span className="muted" role="status">{sourceSnapshot.partyView?'Combined party sight':'Loading party sight…'}</span>}
              <button className={`btn tiny ${tilted ? 'on' : ''}`} aria-pressed={tilted}
                aria-label="Tilted battlefield view" disabled={legacy} title="45° tilt — only changes your view"
                onClick={() => chooseTilt(true)}>45°</button>
              <button className={`btn tiny ${!tilted ? 'on' : ''}`} aria-pressed={!tilted}
                aria-label="Flat battlefield view" title="Flat overhead view — only changes your view"
                onClick={() => chooseTilt(false)}>Overhead</button>
              <button ref={rotationLabel} className="btn tiny" hidden={Math.abs(rotationDegrees%360)<.01} aria-label="Reset battlefield rotation" title="Reset the map's rotation. Hold right mouse button and drag empty space to rotate freely."
                onClick={()=>animateView(tilted?BATTLEFIELD_TILT_DEGREES:0,0)}>Reset rotation</button>
            </div>
            {!legacy&&(map?.videoPath||tiles.some(t=>t.videoPath))&&<button className={`btn tiny ${animateMap?'on':''}`} aria-label="Toggle map animation" aria-pressed={animateMap} title="Animate the map in your view, or use its still image for better performance" onClick={()=>mapAnimation.setEnabled(!mapAnimation.enabled)}>Map animation: {animateMap?'On':'Off'}</button>}
            {([
              { label: 'Players', kind: 'player', enabled: use3dTokens, set: setUse3dTokens, key: tokenPreferenceKey },
              { label: 'Monsters', kind: 'monster', enabled: use3dMonsters, set: setUse3dMonsters, key: monsterPreferenceKey },
            ] as const).map(group => <div key={group.kind} className="battlefield-view-options token-appearance-options" role="group" aria-label={`${group.label} token appearance`}>
              <span className="muted">{group.label}</span>
              {[false, true].map(enabled => (
                <button disabled={legacy&&enabled} key={String(enabled)} className={`btn tiny ${group.enabled === enabled ? 'on' : ''}`}
                  aria-label={`${enabled ? '3D' : '2D'} ${group.kind} tokens`} aria-pressed={group.enabled === enabled}
                  title={group.kind === 'monster' ? 'Changes monsters, chests and traps in your view' : 'Only changes player tokens in your view'}
                  onClick={() => {
                    if (group.enabled === enabled) return;
                    // Freeze the inherited monster setting before changing the legacy PC key.
                    if (group.kind === 'player') safeSetItem(monsterPreferenceKey, use3dMonsters ? '3d' : '2d');
                    group.set(enabled);
                    setHover(null); setMenu(null);
                    safeSetItem(group.key, enabled ? '3d' : '2d');
                  }}>{enabled ? '3D' : '2D'}</button>
              ))}
            </div>)}
            </CompactToolbarMenu>
          </div>, toolSlot)}
          {/* The Measure/Scale/Fog menus live in the top toolbar (above the map)
              via a portal, but keep all their state/handlers here in MapStage. */}
          {toolSlot &&
            createPortal(
              <CompactToolbarMenu label="Map tools"><div className="map-tool-menus">
                {/* Measuring tools — available to everyone; shapes are shared. */}
                <MeasureMenu
                  tool={tool}
                  snap={snap}
                  removeMode={removeMode}
                  hasMeasurements={snapshot.measurements.length > 0}
                  isDm={actualDm}
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
                  <AnnotationMenu tool={annotate} color={annoColor} onColor={setAnnoColor}
                    onTool={next => {
                      setTool(null);
                      setRemoveMode(false);
                      setDraft(null);
                      setAnnotate(next);
                    }}/>
                  {snapshot.annotations.length > 0 && (
                    <button
                      className="btn tiny"
                      title="Clear my annotations"
                      onClick={() => map && clearAnnotations(map.id, true)}
                    >
                      Clear mine
                    </button>
                  )}
                  {actualDm && snapshot.annotations.length > 0 && (
                    <button
                      className="btn tiny"
                      title="Clear everyone's annotations"
                      onClick={() => map && clearAnnotations(map.id, false)}
                    >
                      Clear all
                    </button>
                  )}
                  {actualDm && snapshot.annotations.some((a) => a.kind === 'image') && (
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
                {actualDm && (
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
                    <WallMenu map={map} doors={doors} onDoor={openDoorControls} tool={wallTool} count={map?.walls?.length??0} snap={wallSnap} onSnap={setWallSnap} canGenerateDecal={comfyOk} onGenerateDecal={generateScenery}
                      onTool={next=>{setTool(null);setRemoveMode(false);setScaleMode(false);setMatchMode(false);setAnnotate(null);setFogBrush('off');setTilesMode(false);placeLight(null);setMenu(null);setWallTool(next);setWallAnchor(null);setWallPointer(null);hideCursor();}}
                      onFinish={cancelWallStroke}
                      onUndo={()=>{const last=map?.walls?.at(-1);if(map&&last)useStore.getState().editMapWalls(map.id,{removeId:last.id});setWallAnchor(null);}}/>
                    <FogMenu
                      onResetExploration={()=>map&&useStore.getState().resetExploration(map.id)}
                      explorationMode={map?.explorationMode??'remembered'}
                      onExplorationMode={mode=>map&&useStore.getState().setExplorationMode(map.id,mode)}
                      mapVisionEnabled={usesMapVision(map)}
                      tokenVisionEnabled={map?.tokenVisionEnabled!==false}
                      onToggleVision={layer=>map&&setVisionFog(map.id,layer,!(layer==='map'?usesMapVision(map):map.tokenVisionEnabled!==false))}
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
              </div></CompactToolbarMenu>,
              toolSlot,
            )}
          <Stage
            ref={stageRef}
            key={`${dprKey}:${legacy}`}
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
              cursor: orbTarget || onPlaceAt || fogActive || measureActive ? 'crosshair' : 'default',
            }}
          >
            <Layer
              ref={layerRef}
              x={view.x}
              y={view.y}
              scaleX={view.scale}
              scaleY={view.scale * groundScaleY}
              draggable={panning}
              onDragMove={handleLayerDragMove}
              onDragEnd={handleLayerDragEnd}
            >
              {/* Pan-anywhere backdrop: a press off the map (or over a tile)
                  grabs this and drags the layer. Same colour as the off-map area. */}
              <Rect
                x={panBg.x}
                y={panBg.y}
                width={panBg.w}
                height={panBg.h}
                fill={legacyTerrain?'rgba(0,0,0,0)':CANVAS_BG}
              />
              {/* Base image at the origin, at its own natural size. */}
              {!legacyTerrain && image && map?.imagePath && <MapArtwork url={map.imagePath} videoPath={animateMap?map.videoPath:undefined} onPlaybackError={()=>notify('Animated map could not play; its still image is being used. Try an MP4 (H.264) or WebM video.')} width={baseW} height={baseH} />}
              {/* Extra image tiles (bottom-to-top by z). DM drags/resizes them in
                  arrange mode; otherwise they're inert map background. */}
              <Group opacity={legacyTerrain?0:1}>{tiles.map((t) => (
                <DecalImage
                  key={t.id}
                  url={t.imagePath}
                  videoPath={animateMap?t.videoPath:undefined}
                  onPlaybackError={()=>notify('An animated tile could not play; its still image is being used.')}
                  x={t.x}
                  y={t.y}
                  width={t.w}
                  height={t.h}
                  draggable={actualDm && tilesMode && !measureActive && !fogActive && !scaleMode}
                  handleSize={12 / view.scale}
                  // Tiles are part of the map: keep them listening so dragging
                  // over the area they add still PANS (bubbles to the layer),
                  // even when you're not arranging them.
                  alwaysListening
                  onMove={(x, y) => moveMapImage(t.id, x, y)}
                  onResize={(w, h) => resizeMapImage(t.id, t.x, t.y, w, h)}
                />
              ))}</Group>
              {!image && tiles.length === 0 && (
                <Rect width={imgW} height={imgH} fill="#2a2f3a" />
              )}
              <Group ref={gridRef} name="battlefield-grid" listening={false}>{gridLines.map((pts, i) => (
                <Line
                  key={i}
                  points={pts}
                  stroke={gridHot ? '#ffffffcc' : '#ffffff5c'}
                  strokeWidth={gridHot ? 1.5 : 1}
                  listening={false}
                />
              ))}</Group>
              {/* Map fog: covered terrain. For players the cover is opaque and
                  EXACTLY the off-map backdrop colour (CANVAS_BG), so a covered
                  area is indistinguishable from empty space beyond the map — no
                  grid, image, or tell-tale darker rectangle leaks through. The DM
                  sees a translucent dark wash so they can still work under it. */}
              {mapFogEnabled && (
                <ManualFog key={`map-fog:${map?.id}`} ref={mapFogMask} name="manual-map-fog" id={map?.id??''} grid={grid}
                  bounds={{left:colMin,top:rowMin,right:colMax,bottom:rowMax}} revealed={mapRevealed}
                  color={isDm?'#04060a':CANVAS_BG} opacity={isDm?.5:1}/>
              )}
              {/* Token fog: a DM-only purple marker of where tokens are hidden
                  (players just don't receive those tokens). */}
              {tokenFogEnabled && isDm && (
                <ManualFog key={`token-fog:${map?.id}`} ref={tokenFogMask} name="manual-token-fog" id={map?.id??''} grid={grid}
                  bounds={{left:colMin,top:rowMin,right:colMax,bottom:rowMax}} revealed={tokenRevealed}
                  color="#7a3df0" opacity={.35}/>
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
                    draggable={actualDm && !measureActive && !decalsLocked}
                    handleSize={12 / view.scale}
                    // Players get the decorative 🛒 marker; the DM gets a clickable
                    // shop button instead (onEditShop), so don't double it up.
                    badge={!actualDm && !!a.popup}
                    hasShop={!!a.popup}
                    onRemove={removeMode ? () => removeAnnotation(a.id) : undefined}
                    onMove={(x, y) => moveAnnotation(a.id, x, y)}
                    onResize={(w, h) => resizeAnnotation(a.id, w, h)}
                    // DM: the 🛒 add/edit button shows only while editing decals
                    // (UNLOCKED) so it never clutters the map during play. When
                    // LOCKED, a body click still opens the editor; players click a
                    // shop decal to view it read-only.
                    onEditShop={
                      actualDm && !removeMode && !measureActive && !decalsLocked
                        ? () => openDecalPopup(a.id)
                        : undefined
                    }
                    onActivate={
                      removeMode || measureActive
                        ? undefined
                        : actualDm
                          ? decalsLocked
                            ? () => openDecalPopup(a.id)
                            : undefined
                          : a.popup
                            ? () => openDecalPopup(a.id)
                            : undefined
                    }
                  />
                ))}
              {!legacy&&<FootprintLayer key={map?.id}
                onMarks={updateFootprints}
                renderFallback={miniaturesUnavailable||!(miniatureTokens.length>0||preloadMiniatures.length>0||environment||spellImpacts.length>0)}
                isVisibleAt={tokenVisibleAtPosition}
                tokens={snapshot.tokens}
                pxPerFoot={pxPerFoot}
              />}
            </Layer>
            {legacy&&<Layer name="legacy-footsteps" listening={false} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
              ref={layer=>{legacyFootstepsLayerRef.current=layer;if(layer){const canvas=layer.getNativeCanvasElement();canvas.style.zIndex=legacyTerrain?'1':'0';canvas.style.pointerEvents='none';canvas.dataset.testid='legacy-footsteps';}}}>
              <FootprintLayer key={map?.id} compact tokens={snapshot.tokens} pxPerFoot={pxPerFoot} isVisibleAt={tokenVisibleAtPosition}
                movementDurationMs={legacyMovement.playback?.durationMs??(snapshot.legacyGeometry!==undefined?0:undefined)} visualPosition={presentation.position}/>
            </Layer>}
            <Layer
              ref={groundTokenLayerRef}
              name="ground-token-layer"
              x={view.x}
              y={view.y}
              scaleX={view.scale}
              scaleY={view.scale * groundScaleY}
              draggable={panning}
              onDragMove={handleLayerDragMove}
              onDragEnd={handleLayerDragEnd}
            >
              {legacy&&snapshot.tokenLayerRaster&&<KonvaImage name="server-token-layer" image={renderedImage(snapshot.tokenLayerRaster.key)} x={snapshot.tokenLayerRaster.x} y={snapshot.tokenLayerRaster.y} width={snapshot.tokenLayerRaster.width/snapshot.tokenLayerRaster.scale} height={snapshot.tokenLayerRaster.height/snapshot.tokenLayerRaster.scale} listening={false} perfectDrawEnabled={false}/>}
              {renderTokens(false)}
            </Layer>
            <Layer
              ref={tokenLayerRef}
              name="miniature-hud-layer"
              x={view.x}
              y={view.y}
              scaleX={view.scale}
              scaleY={view.scale * groundScaleY}
              draggable={panning}
              onDragMove={handleLayerDragMove}
              onDragEnd={handleLayerDragEnd}
            >
              {renderTokens(true)}
              {/* Shared measuring shapes (persisted) + the live drag preview. */}
              {teleportCast&&teleportActor&&map&&<Group listening={false}><Circle x={teleportActor.x} y={teleportActor.y} radius={30*map.gridSizePx/map.feetPerSquare} stroke="#b39bff" strokeWidth={2/view.scale} dash={[8/view.scale,6/view.scale]}/>{teleportPoint&&<Circle x={teleportPoint.x} y={teleportPoint.y} radius={teleportActor.widthFt*map.gridSizePx/map.feetPerSquare/2} fill="#ae8fff55" stroke={teleportError?'#ef6464':'#d1c0ff'} strokeWidth={2/view.scale}/>}</Group>}
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
                if(m.spellArea){const {spec,angle}=m.spellArea;
                  const caster=m.tokenId?snapshot.tokens.find(t=>t.id===m.tokenId):origin;
                  if(!caster)return null;
                  return <SpellAreaShapes raised={miniatureTokens.length>0} spellName={m.spellName} key={m.id} scale={view.scale} spec={{...spec,self:!!m.tokenId}} placement={{mapId:m.mapId,points:[origin],angle}} caster={caster} pxPerFoot={1/fpp} targets={[]} onRemove={removeMode?()=>removeMeasurement(m.id):undefined}/>;
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
              {wallActive&&<Group name="wall-edit-outlines" listening={false}>
                {(map?.walls??[]).map(original=>{const w=wallPreview?.id===original.id?wallPreview:original,selected=featureSelection.includes(`wall:${w.id}`);return <Path key={w.id} name="wall-edit-piece" wallId={w.id} featureSelected={selected} data={wallSvgPath(w)} fillRule="evenodd" stroke={selected?'#6ee7ff':w.arch?'#f64fe0':w.window?'#398cff':'#ffc76e'} fill={selected?'#6ee7ff35':w.arch?'#f64fe040':w.window?'#398cff55':w.kind||w.thickness?'#ffc76e25':undefined} strokeWidth={(selected?3:2)/view.scale}/>;})}
                {wallTool==='edit'&&(map?.environment?.lights??[]).map((light,i)=><Group key={light.id} name="light-edit-marker" lightId={light.id} featureSelected={featureSelection.includes(`light:${light.id}`)} x={light.x} y={light.y}>
                  <Circle radius={10/view.scale} fill={featureSelection.includes(`light:${light.id}`)?'#6ee7ff':'#ffbf65'} stroke="#152230" strokeWidth={2/view.scale}/>
                  <Text text={String(i+1)} x={-10/view.scale} y={-6/view.scale} width={20/view.scale} align="center" fontSize={12/view.scale} fill="#142331"/>
                </Group>)}
                {wallAnchor&&wallPointer&&(wallTool==='erase-area'
                  ?<Rect name="wall-erase-preview" x={Math.min(wallAnchor.x,wallPointer.x)} y={Math.min(wallAnchor.y,wallPointer.y)} width={Math.abs(wallPointer.x-wallAnchor.x)} height={Math.abs(wallPointer.y-wallAnchor.y)} fill="#ff667733" stroke="#ff6677" strokeWidth={2/view.scale} dash={[8/view.scale,5/view.scale]}/>
                  :wallTool==='door'
                  ?<Line points={[wallAnchor.x,wallAnchor.y,wallPointer.x,wallPointer.y]} stroke="#fff1c2" strokeWidth={3/view.scale} dash={[8/view.scale,5/view.scale]}/>
                  :<Path data={wallSvgPath(strokeWall(wallAnchor,wallPointer))} fillRule="evenodd" stroke="#fff1c2" fill="#ffe5b333" strokeWidth={2/view.scale} dash={[8/view.scale,5/view.scale]}/>)}
                {wallTool==='edit'&&selectedWall&&<Group name="wall-rotation-control">
                  <Line points={[wallCenter(selectedWall).x,wallCenter(selectedWall).y,rotationHandle(selectedWall).x,rotationHandle(selectedWall).y]} stroke="#6ee7ff" strokeWidth={1/view.scale} dash={[5/view.scale,4/view.scale]}/>
                  <Circle name="wall-rotation-handle" x={rotationHandle(selectedWall).x} y={rotationHandle(selectedWall).y} radius={8/view.scale} fill="#142833" stroke="#6ee7ff" strokeWidth={2/view.scale}/>
                </Group>}
                {wallPointer&&wallTool!=='edit'&&<Circle x={wallPointer.x} y={wallPointer.y} radius={4/view.scale} fill={wallTool==='erase'||wallTool==='erase-area'?'#ff6677':'#fff1c2'}/>}
              </Group>}
              {doors.filter(doorVisible).map(d=>{
                const doorSnapshot=actualDm?sourceSnapshot:snapshot;
                const token=doorSnapshot.tokens.find(t=>t.id===d.tokenId),object=doorSnapshot.monsters.find(m=>m.id===token?.refId);
                const locked=!!object?.conditions.some(c=>c.label.toLowerCase()==='locked'),hidden=!!token?.isHidden;
                const previewed=!!doorDragPreview?.ids.includes(d.id);
                const approached=nearbyDoors.some(door=>door.id===d.id);
                const color=previewed?'#78e6ff':hidden?'#a2a8b1':locked?'#efb05f':d.open?'#94d6b0':'#f1d49c';
                const label=hidden?'Hidden':locked?'Locked':d.open?'Open':'Door';
                // One full-width line on each outer face. The ordinary vision
                // mask hides the far face of a closed door, including in daylight.
                const pad=2/view.scale;
                let faces:number[][];
                if(d.kind==='rectangle'&&!d.rotation){
                  const x0=Math.min(d.ax,d.bx),x1=Math.max(d.ax,d.bx),y0=Math.min(d.ay,d.by),y1=Math.max(d.ay,d.by);
                  faces=x1-x0>=y1-y0?[[x0,y0-pad,x1,y0-pad],[x0,y1+pad,x1,y1+pad]]:[[x0-pad,y0,x0-pad,y1],[x1+pad,y0,x1+pad,y1]];
                }else{
                  faces=wallBoundarySegments(d).map(({a,b})=>[a.x,a.y,b.x,b.y]);
                }
                const activate=()=>{if(actualDm||nearbyDoors.some(door=>door.id===d.id))openDoorControls(d.id);else notify('Move your character’s footprint within 5 ft of this door’s approach area to open it or pick its lock.');};
                return <Group key={d.id} name="wall-door-marker" doorId={d.id} doorState={label} doorPreview={previewed} opacity={hidden ? .45 : 1} listening={!wallActive}
                  onMouseDown={e=>{e.cancelBubble=true;}} onTouchStart={e=>{e.cancelBubble=true;}} onClick={e=>{e.cancelBubble=true;activate();}} onTap={e=>{e.cancelBubble=true;activate();}}>
                  <Line name="door-approach-area" points={wallVertices(doorInteractionArea(d,pxPerFoot)).flatMap(p=>[p.x,p.y])} closed listening={false}
                    stroke={color} strokeWidth={(previewed?2:1)/view.scale} dash={[5/view.scale,4/view.scale]} opacity={previewed ? .85 : approached ? .6 : .25}
                    fill={previewed?'#78e6ff20':approached?'#f1d49c15':undefined}/>
                  {faces.map((points,i)=><Line key={i} name="wall-door-face" points={points} stroke={color} strokeWidth={(previewed?6:4)/view.scale} shadowColor={previewed?'#78e6ff':undefined} shadowBlur={previewed?8/view.scale:0} hitStrokeWidth={16/view.scale} lineCap="butt" dash={d.open||hidden?[7/view.scale,5/view.scale]:undefined}/>)}
                </Group>;
              })}
              {/* Live ghost tethers for tokens OTHERS are dragging. */}
              <DragGhostLayer
                tokens={snapshot.tokens}
                pxPerFoot={pxPerFoot}
                gridSizePx={grid}
              />
              {/* Chat bubbles over PC tokens (typing "•••" + spoken words). */}
              <SpeechBubbles
                tokens={snapshot.tokens}
                pxPerFoot={pxPerFoot}
                gridSizePx={grid}
              />
              {/* Floating ±X damage/heal numbers — topmost, click-through. */}
              {!legacy&&<HpFxLayer
                spellEffects3D={!miniaturesUnavailable}
                floaters={hpFx2d}
                tokens={snapshot.tokens}
                pxPerFoot={pxPerFoot}
              />}
              {/* Live "laser pointers" for everyone else on this map. */}
              {!legacy&&showCursors && (
                <CursorPointers currentMapId={map?.id} scale={view.scale} />
              )}
            </Layer>
            <Layer ref={sharedTokenLayerRef} name="shared-sight-layer" listening={false}
              x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale * groundScaleY}>
              {renderTokens(false, true)}{renderTokens(true, true)}
            </Layer>
            <Layer name="spell-area-overlay" listening={false}
              x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale * groundScaleY}
              // Targeting is a UI overlay, never a source of terrain visibility.
              ref={layer=>{spellAreaLayerRef.current=layer;if(layer){const c=layer.getNativeCanvasElement();c.style.zIndex='6';c.style.pointerEvents='none';c.dataset.testid='spell-area-canvas';}}}>
              {map&&<SharedSpellAreas mapId={map.id} hideId={areaCast?areaSocketId:undefined} scale={view.scale} pxPerFoot={map.gridSizePx/map.feetPerSquare}/>}
              {areaCast&&areaActor&&map&&<SpellAreaShapes spellName={areaCast.name} scale={view.scale} spec={areaCast.spec} placement={areaPreview} caster={areaActor} pxPerFoot={map.gridSizePx/map.feetPerSquare} previewState="aiming" targets={areaTargets.filter(t=>!areaExcluded.includes(t.id))}/>}
            </Layer>
            <Layer name="hp-number-layer" listening={false} ref={layer=>{
              if(!layer)return;const canvas=layer.getNativeCanvasElement();
              canvas.style.zIndex='5';canvas.style.pointerEvents='none';canvas.dataset.testid='hp-number-canvas';
            }}>
              <HpNumberLayer floaters={hpFx} tokens={snapshot.tokens} pxPerFoot={pxPerFoot} gridSizePx={grid}
                headPosition={hpHeadPosition}
                view={view} width={size.w} height={size.h} tilt={tiltDegrees} rotation={rotationDegrees}/>
            </Layer>
          </Stage>
          {!legacy&&(miniatureTokens.length > 0 || preloadMiniatures.length > 0 || environment || spellImpacts.length > 0) && <MiniatureFallback onUnavailable={handleMiniatureUnavailable}><Suspense fallback={null}>
            <MiniatureLayer preparedSpellImpacts={preparedSpellImpacts} spellColorOverlay={spellColorOverlay} spellMist={spellMist} key={map?.id} ref={miniatureRef} rollBackground={rollBackground} rollBackgroundPrepared={rollBackgroundPrepared} personalVision={renderPlayerVision&&(usesMapVision(map)||!!snapshot.playerVision?.heavy)} tokens={miniatureTokens} preloadDefinitions={preloadMiniatures} onFailed={setFailedMiniatures} onUnavailable={handleMiniatureUnavailable} view={view} isVisibleAt={tokenVisibleAtPosition}
              environmentPreview={environment} footprints={readFootprints} spellImpacts={spellImpacts} spellFog={spellFog} visualPosition={presentation.position} memoryTerrainCanvas={memoryTerrainCanvas} visionCoverFrame={visionCoverFrame}
              tiltDegrees={tiltDegrees} rotationDegrees={rotationDegrees} width={size.w} height={size.h} onReady={handleMiniatureReady}
              nameLabels={miniatureNameLabels} onRenderedNames={handleRenderedNames} onVisionLights={renderPlayerVision?handleVisionLights:undefined} onPrepareVisionLights={renderPlayerVision?lights=>visionRef.current?.prepareLights(lights):undefined} />
          </Suspense></MiniatureFallback>}
          {renderPlayerVision&&snapshot.playerVision&&(legacy?<LegacyVisionOverlay ref={visionRef} presentation={presentation} terrainRaster={legacyTerrain?snapshot.terrainRaster:undefined} motion={legacyMovement.playback} tiles={snapshot.visionTiles} raster={snapshot.visionRaster} geometry={snapshot.legacyGeometry} vision={snapshot.playerVision} view={view} width={size.w} height={size.h} mapFogOfWar={usesMapVision(map)} explored={snapshot.exploredTerrain} keepRevealed={map?.explorationMode==='revealed'}/>:<PlayerVisionOverlay serverGeometry={snapshot.legacyGeometry} spellLighting={!spellColorOverlay} ref={visionRef} presentation={presentation} vision={snapshot.playerVision} keepRevealed={map?.explorationMode==='revealed'} mapFogOfWar={usesMapVision(map)} view={view} tilt={tiltDegrees} rotation={rotationDegrees} width={size.w} height={size.h}
            terrain={{environment:map?.environment,explored:snapshot.exploredTerrain,tiles:[...(map?.imagePath&&baseW&&baseH?[{url:map.imagePath,x:0,y:0,w:baseW,h:baseH}]:[]),...tiles.map(t=>({url:t.imagePath,x:t.x,y:t.y,w:t.w,h:t.h}))],bounds:{x:extX0,y:extY0,w:imgW,h:imgH},grid:map?.gridHidden?undefined:{size:grid,x:map?.gridOffsetX??0,y:map?.gridOffsetY??0}}}/>)}
          {!wallActive&&doorDragPreview&&doorDragPreview.ids.length>0&&<div data-testid="door-preview-hint" role="status" style={{position:'absolute',bottom:92,left:'50%',transform:'translateX(-50%)',zIndex:5,padding:'9px 14px',background:'#102633ee',border:'1px solid #78e6ff',borderRadius:6,color:'#c7f5ff',pointerEvents:'none'}}>Release to interact · {doorDragPreview.ids.map(id=>`Door ${doors.findIndex(d=>d.id===id)+1}`).join(', ')}</div>}
          {!wallActive&&activeDoorControls.length>0&&!doorDragPreview&&<section data-testid="door-controls" className="nearby-door-controls" role="region" aria-label="Door controls">
            <header><strong>Door controls</strong><button className="btn tiny" aria-label="Close door controls" title="Close — click a nearby door or leave and return to reopen" onClick={dismissDoorControls}>×</button></header>
            <div className="nearby-door-list">{activeDoorControls.map(d=>{const doorSnapshot=actualDm?sourceSnapshot:snapshot,token=doorSnapshot.tokens.find(t=>t.id===d.tokenId);return <div className="nearby-door" key={d.id}>
              <strong>Door {doors.indexOf(d)+1}</strong>
              {token?<><ObjectControls snapshot={doorSnapshot} token={token} editable={actualDm} compact/>{actualDm&&<button className="btn tiny" onClick={()=>onSelectToken(token)}>Door details</button>}</>:<button className="btn" onClick={()=>operateDoor(d.id,!d.open)}>{d.open?'Close':'Open'} door</button>}
            </div>;})}</div>
          </section>}
          {wallActive&&<div data-testid="wall-drawing-hint" style={{position:'absolute',bottom:88,left:'50%',transform:'translateX(-50%)',zIndex:5,background:'#161b23ee',color:'#ffe5b3',padding:'8px 12px',border:'1px solid #aa8550',borderRadius:6,fontSize:13,display:'flex',gap:10,alignItems:'center',maxWidth:'calc(100% - 32px)',flexWrap:'wrap'}}>
            <span>{wallTool==='erase-area'?'Drag a rectangle to erase only that section. Doors are kept.':wallTool==='rectangle'?'Drag across the wall’s length and thickness':wallTool==='door'?'Drag along a wall to cut a door opening':wallTool==='draw'?'Drag a line at any angle':wallTool==='circle'?'Drag from the room center to its wall':wallTool==='freehand'?'Hold and trace the wall; release to save':wallTool==='edit'?'Click to select · Shift/Ctrl-click to add · Ctrl-drag a box · Delete to remove · Ctrl+Z to undo':'Click a wall to delete the entire piece'}</span>
            {['draw','circle','freehand'].includes(wallTool)&&<label>Thickness <input aria-label="Wall thickness in feet" type="number" min={.1} max={20} step={.25} value={wallThickness} onChange={e=>setWallThickness(Math.max(.1,Math.min(20,Number(e.target.value)||.1)))} style={{width:55}}/> ft</label>}
            {wallTool==='edit'&&selectedWall&&<>
              <label>Rotation <input aria-label="Wall rotation in degrees" type="number" min={-360} max={360} step={1} value={Math.round(selectedWall.rotation??0)} onChange={e=>{const rotation=Number(e.target.value);if(Number.isFinite(rotation)&&map)useStore.getState().editMapWalls(map.id,{update:{...selectedWall,rotation:Math.max(-360,Math.min(360,rotation))}});}} style={{width:62}}/> degrees</label>
            </>}
            {wallTool==='edit'&&featureSelection.length>0&&<button data-testid="delete-map-features" className="btn tiny" onClick={deleteFeatures}>Delete {featureSelection.length} selected</button>}
            <button className="btn tiny" onClick={()=>{setWallTool('off');setWallAnchor(null);}}>Done</button>
          </div>}
          <DecalPopup snapshot={actualDm?sourceSnapshot:snapshot} />
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
              snapshot={actualDm?sourceSnapshot:snapshot}
              token={menu.token}
              attacker={floatingAttacker(
                actualDm?sourceSnapshot:snapshot,
                selectedIds,
                menu.token,
                actualDm,
                mySocketId,
              )}
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
            />
          )}
          {mapOverlays}
          {teleportCast&&<div className="save-resolve-banner spell-area-prompt" role="region" aria-label="Misty Step destination" style={{zIndex:30}}><strong>Misty Step · 30 ft</strong><span>Click a visible, unoccupied destination. No slot is spent until you confirm the cast below.</span>{teleportError&&<span role="alert">{teleportError}</span>}<button className="btn" disabled={!teleportPoint||!!teleportError||pendingSpellCost(teleportCast)?.unavailable} onClick={()=>{if(teleportPoint&&map)useStore.getState().rollAbility({...teleportCast,destination:{mapId:map.id,...teleportPoint}});clearTeleportCast();}}>Cast Misty Step · {pendingSpellCost(teleportCast)?.label}</button><button className="btn" onClick={clearTeleportCast}>Cancel (Esc)</button></div>}
          {areaCast&&areaActor&&map&&<div className="save-resolve-banner spell-area-prompt" role="region" aria-label="Place spell area" style={{flexWrap:'wrap',maxWidth:'min(760px,calc(100% - 30px))',zIndex:30,borderColor:'#e0be6b'}}>
            <strong>{areaCast.name} · {areaCast.spec.sizeFt} ft {['sphere','cylinder','emanation'].includes(areaCast.spec.kind)?'radius':areaCast.spec.kind}</strong>
            <span>{areaCast.repeat?'Repeat use · no additional spell slot.':`${pendingSpellCost(areaCast.payload)?.label??'Spell casting'} · no slot is spent until you confirm this area.`}</span>
            <span>{areaCast.name.toLowerCase()==='pass without trace'?'Choose allies to share your moving Stealth aura.':areaCast.spec.self?'Aim, then click to lock the direction.':['line','cone'].includes(areaCast.spec.kind)?'Click a start, then aim and click again to lock the direction.':`Click to place${areaCast.spec.count?` up to ${areaCast.spec.count} areas`:''}.`} Overlapping combat footprints are affected; allies can be hit.{areaCast.spec.ongoing?' Ongoing effects are resolved with the DM.':''}</span>
            {areaRangeError&&<span role="alert">Choose an origin within {areaCast.spec.rangeFt} ft and outside Total Cover.</span>}
            <span>{areaTargets.filter(t=>!areaExcluded.includes(t.id)).length} {actualDm?'targets':'visible targets'}{areaCast.spec.maxTargets?` / choose up to ${areaCast.spec.maxTargets}`:''}</span>
            {areaCast.spec.selective&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{areaTargets.map(t=>{const e=resolveToken(actionSnapshot,t);return <label key={t.id}><input type="checkbox" checked={!areaExcluded.includes(t.id)} onChange={()=>setAreaExcluded(old=>old.includes(t.id)?old.filter(id=>id!==t.id):[...old,t.id])}/>{e.name}{t.revealTag&&t.revealTag!=='U'?` ${t.revealTag}`:''}</label>;})}</div>}
            {['cube','line','cone'].includes(areaCast.spec.kind)&&<label>Direction <input aria-label="Spell area rotation" type="range" min="-180" max="180" step="1" value={areaAngle*180/Math.PI} onChange={e=>{
              const next=+e.target.value*Math.PI/180,delta=next-areaAngle;
              if(areaCast.name.trim().toLowerCase()==='fire storm')setAreaPoints(old=>old.map(p=>{
                const anchor=old[0],dx=p.x-anchor.x,dy=p.y-anchor.y;
                return {x:anchor.x+dx*Math.cos(delta)-dy*Math.sin(delta),y:anchor.y+dx*Math.sin(delta)+dy*Math.cos(delta)};
              }));
              setAreaAngle(next);setAreaDirectionLocked(true);
            }}/></label>}
            <button className="btn tiny" disabled={!areaCast.repeat&&pendingSpellCost(areaCast.payload)?.unavailable||!areaPoints.length||!!areaRangeError||!!areaCast.spec.maxTargets&&areaTargets.filter(t=>!areaExcluded.includes(t.id)).length>areaCast.spec.maxTargets||['line','cone'].includes(areaCast.spec.kind)&&!areaDirectionLocked} onClick={()=>{
              const placement={...areaPlacement,...(areaCast.spec.selective?{selected:areaTargets.filter(t=>!areaExcluded.includes(t.id)).map(t=>t.id)}:{})};
              if(areaCast.repeat)useStore.getState().repeatSpell({...areaCast.repeat,area:placement});else useStore.getState().rollAbility({...areaCast.payload,area:placement});clearAreaCast();
            }}>Confirm area · {areaCast.repeat?'Repeat · no slot':`Cast · ${pendingSpellCost(areaCast.payload)?.label??areaCast.name}`}</button>
            <button className="btn tiny" onClick={()=>{setAreaPoints(old=>old.slice(0,-1));setAreaDirectionLocked(false);}}>Undo placement</button>
            <button className="btn tiny" onClick={clearAreaCast}>Cancel (Esc)</button>
          </div>}
          {actualDm && saveResolve && (
            <div className="save-resolve-banner">
              <span>
                {saveResolve.save
                  ? `Apply ${saveResolve.label} — click targets to roll DC ${saveResolve.dc} ${saveResolve.save} saves`
                  : `Apply ${saveResolve.label} — click targets to apply ${resolvingRoll?.apply?.healing ? 'healing' : 'damage'}`}
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
                      const { x: cx, y: cy } = screenToMap(size.w / 2, size.h / 2, view, tiltDegrees);
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
                      const { x: cx, y: cy } = screenToMap(size.w / 2, size.h / 2, view, tiltDegrees);
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

/** Feed updates remain live without rerendering the canvas tree. */
const BoardRollFeed=memo(function BoardRollFeed(){
  const logs=useStore(s=>s.snapshot?.rollLog),chat=useStore(s=>s.snapshot?.chat);
  return logs&&chat?<RollLogOverlay rollLog={logs} chat={chat}/>:null;
});
export const MapStage=memo(MapStageInner,(a,b)=>{
  if(!retainedRenderingEnabled())return false;
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  return [...keys].every(key=>key==='snapshot'?sameBoardSnapshot(a.snapshot,b.snapshot):a[key as keyof Props]===b[key as keyof Props]);
});

/** Other casters' live spell-area aims (~14 updates/s each while aiming).
 *  Subscribed here so those packets re-render only this layer, not the map. */
const SharedSpellAreas = memo(function SharedSpellAreas({mapId,hideId,scale,pxPerFoot}:{mapId:string;hideId:string|undefined;scale:number;pxPerFoot:number}) {
  const previews=useStore(s=>s.spellAreaPreviews);
  return <>{Object.values(previews).filter(p=>!p.resolving&&p.area.mapId===mapId&&p.id!==hideId).map(p=><SpellAreaShapes key={p.id} spellName={p.name} previewState="aiming" scale={scale} spec={p.spec} placement={p.area} caster={p.caster} pxPerFoot={pxPerFoot} targets={[]}/>)}</>;
});
