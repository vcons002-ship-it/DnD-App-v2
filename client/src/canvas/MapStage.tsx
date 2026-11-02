import { MapToolbarPortals } from "./MapToolbarPortals";
import { MeasureShape, MEASURE_FT, type DraftMeasure, type MeasureShapeKind, type MeasureSize, type MeasureTool } from "./MeasureShape";
import { DecalImage } from "./DecalImage";
import { PasteImageModal, useClipboardImagePaste, usePasteImageState } from "./PasteImageModal";
import { useSpellTargeting } from "./useSpellTargeting";
import { SharedSpellAreas, SpellTargetingPrompts } from "./SpellTargetingPrompts";
import { WallAndDoorHud, WallAndDoorKonvaGroup } from "./WallEditorOverlay";
export { MEASURE_FT, type MeasureShapeKind, type MeasureSize, type MeasureTool };
import {renderedImage} from '../lib/renderImages';
import {MapLoadingBar} from '../components/MapLoadingBar';
import {beginMapStartupWave,cancelLoadingTask,completeLoadingTask,startLoadingTask} from '../lib/loadingProgress';
import {explicitTokenInspection} from '../lib/tokenInspection';
import {retainedRenderingEnabled} from '../lib/retainedRendering';
import {installRetainedTokenLayer,invalidateRetainedToken} from './retainedTokenLayer';
import {sameBoardSnapshot} from '../../../shared/boardSnapshot';
import {LegacyVisionOverlay} from './LegacyVisionOverlay';
import {useLegacyMovement} from '../lib/useLegacyMovement';
import {useTokenAppearance} from '../components/TokenAppearanceControl';
import {apiFetch} from '../lib/api';
import {MapArtwork} from './MapArtwork';
import {useMapAnimation} from '../lib/useMapAnimation';
import {requestText} from '../lib/dialogs';
import {requestBattlefieldFrame,cancelBattlefieldFrame} from './battlefieldFrame';
import {createLatestFrame} from '../lib/latestFrame';
import {ManualFog,type ManualFogHandle} from './ManualFog';
import {mirrorImageCount} from '../../../shared/linkedSpells';
import {SpellAreaShapes} from './SpellAreaShapes';
import {DEATH_SKULL} from '../lib/miniatures';
import './door-controls.css';
import { activeHasteCondition, speedIsZero, walkingSpeedFeet } from '../../../shared/spellBuffs';
import {PlayerVisionOverlay,type PlayerVisionHandle} from './PlayerVisionOverlay';
import {TokenPresentation} from './tokenPresentation';
import {reduceRollBackground} from '../lib/rollBackgroundBudget';
import type {WallTool} from '../components/WallMenu';
import {doorApproachPoints,distanceToWall,sanitizeWalls,type MapWall} from '../../../shared/mapWalls';
import {doorInReach} from '../../../shared/doorInteraction';
import {wallVertices,wallCenter,translateWall,simplifyWallPath} from '../../../shared/wallGeometry';
import {fogVisionContains,visionShowsAffinity,needsVisibilityLayer,usesMapVision,usesTokenVision} from '../../../shared/playerVision';
import {presentAuras,AURA_HEX} from '../lib/conditions';
import { miniatureBaseWidthFt } from '../../../shared/monsterAppearance';
import { tokenVisibleAt } from '../../../shared/fog';
import { monsterTint, monsterVariation } from '../../../shared/monsterAppearance';
import { productionFamily } from '../../../shared/assetProduction';
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Line, Rect, Circle, Text, Image as KonvaImage } from 'react-konva';
import { rollerColor } from '../lib/rollStyle';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import type { FogLayer, Measurement, StateSnapshot, Token } from '../../../shared/types';
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
import { useComfyAvailable, comfyGenerate } from '../lib/comfy';
import { useStableCallback } from '../lib/useStableCallback';
import { getPlayerId, useStore, isRollImpactPending } from '../state/socket';
import { FloatingMenu } from '../components/FloatingMenu';
import {useEnvironmentQuality} from '../lib/useEnvironmentQuality';
import {useEnvironmentEditor} from '../lib/useEnvironmentEditor';
import {DEFAULT_MAP_ENVIRONMENT} from '../../../shared/mapEnvironment';
import type {EnvironmentPreviewSettings} from './battlefieldEnvironment';
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

const CANVAS_BG = "#0e0f12";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
  const legacyMovement=useLegacyMovement(sourceViewSnapshot,true);
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
  },[spellColorOverlay]);const handlePrepareVisionLights=useCallback((lights:import('../../../shared/playerVision').VisionLight[])=>{visionRef.current?.prepareLights(lights);},[]);
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
  const [size, setSize] = useState(() => ({ w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight - 48) }));
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
  const {use3dTokens,use3dMonsters}=useTokenAppearance();
  useEffect(()=>{useStore.getState().socket?.emit('client:rendering',legacy,{pc:legacy||!use3dTokens||miniaturesUnavailable,monster:legacy||!use3dMonsters||miniaturesUnavailable});},[legacy,use3dTokens,use3dMonsters,miniaturesUnavailable,previewSocketId]);
  const groundScaleY = groundYScale(tiltDegrees);
  const [menu, setMenu] = useState<{ token: Token; x: number; y: number } | null>(
    null,
  );
  const [hover, setHover] = useState<{ token: Token; x: number; y: number } | null>(
    null,
  );
  useEffect(()=>{setHover(null);setMenu(null);},[use3dTokens,use3dMonsters]);
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

  const image = useImage(map?.imagePath ?? null, { category: 'map', weight: 4, showDelayMs: 0 });
  useEffect(() => { beginMapStartupWave(map?.id ?? null); }, [map?.id]);
  useEffect(() => {
    if (partyPreview && !sourceSnapshot.partyView) startLoadingTask({ id: 'sync:party-view', category: 'sync', indeterminate: true, label: 'Syncing Party Sight…', showDelayMs: 60 });
    else completeLoadingTask('sync:party-view');
    return () => cancelLoadingTask('sync:party-view');
  }, [partyPreview, sourceSnapshot.partyView]);

  // Remount the Stage when devicePixelRatio changes (e.g. snapping the window
  // to a monitor with different Windows scaling) — Konva sizes its canvas
  // buffer at creation, so without this the map renders blurry/misaligned.
  const [dprKey, setDprKey] = useState(0);
  useLayoutEffect(() => { const r = containerRef.current?.getBoundingClientRect(); if (r && r.width > 0 && r.height > 0) { const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height)); setSize((c) => (c.w === w && c.h === h ? c : { w, h })); } }, [map?.id, map?.slidesUrl, map?.imagePath]);

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
  const spellTargeting = useSpellTargeting(actionSnapshot, map);
  const { teleportCast, teleportPoint, setTeleportPoint, teleportActor, teleportError, areaSocketId, areaCast, areaPoints, setAreaPointer, setAreaAngle, areaDirectionLocked, areaExcluded, areaActor, placeSpellArea, areaPreview, areaTargets } = spellTargeting;
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
  const { pasteImg, setPasteImg, pasteOrig, openPasteDialog } = usePasteImageState();
  useClipboardImagePaste(actualDm, openPasteDialog, notify);
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
  const [toolSlot, setToolSlot] = useState<HTMLElement | null>(() => document.getElementById('map-tool-slot'));
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
  const mapImageReady = !map?.imagePath || (baseW > 0 && baseH > 0);

  // Reset to fit when the map changes; otherwise refit on resize until the
  // user zooms/pans, after which we preserve their view.
  useEffect(() => {
    userAdjusted.current = false;
    setView(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.id, mapImageReady]);
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
  const trackedMiniaturesRef=useRef<Set<string>>(new Set());
  useEffect(()=>{
    const tracked=trackedMiniaturesRef.current;
    for(const id of [...tracked]){
      if(miniaturesUnavailable||failedMiniatures.has(id)||!miniatureIds.has(id)){tracked.delete(id);cancelLoadingTask(`miniature:${id}`);}
      else if(readyMiniatures.has(id)){tracked.delete(id);completeLoadingTask(`miniature:${id}`);}
    }
    if(!miniaturesUnavailable){
      for(const id of miniatureIds){
        if(!readyMiniatures.has(id)&&!failedMiniatures.has(id)){
          tracked.add(id);
          startLoadingTask({id:`miniature:${id}`,category:'miniature',weight:4,progress:0.08,stageCeiling:0.42});
        }
      }
    }
  },[miniatureIds,readyMiniatures,failedMiniatures,miniaturesUnavailable]);
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
  const preparedSpellImpacts=useMemo(()=>legacy?[]:preparedHpFx.flatMap(mapSpellEvent),[legacy,preparedHpFx,snapshot,miniatureTokens,pxPerFoot,isDm]);
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

  const viewRef = useRef(view); viewRef.current = view;
  const drawnViewRef = useRef({ x: view.x, y: view.y, scale: view.scale, sy: groundScaleY });
  const paintView = useStableCallback((nextView: View) => {
    viewRef.current = nextView;
    const prev = drawnViewRef.current;
    if (prev.x !== nextView.x || prev.y !== nextView.y || prev.scale !== nextView.scale || prev.sy !== groundScaleY) {
      drawnViewRef.current = { x: nextView.x, y: nextView.y, scale: nextView.scale, sy: groundScaleY };
      for (const layer of [layerRef.current, groundTokenLayerRef.current, tokenLayerRef.current, sharedTokenLayerRef.current, spellAreaLayerRef.current]) {
        if (!layer) continue;
        layer.position({ x: nextView.x, y: nextView.y });
        layer.scale({ x: nextView.scale, y: nextView.scale * groundScaleY });
        layer.draw();
      }
      if (legacyFootstepsLayerRef.current) {
        legacyFootstepsLayerRef.current.position({ x: nextView.x, y: nextView.y });
        legacyFootstepsLayerRef.current.scale({ x: nextView.scale, y: nextView.scale });
        legacyFootstepsLayerRef.current.draw();
      }
    }
    visionRef.current?.camera({ view: nextView });
    miniatureRef.current?.setView(nextView, true);
  });
  useLayoutEffect(() => {
    const prev = drawnViewRef.current;
    if (prev.x === view.x && prev.y === view.y && prev.scale === view.scale && prev.sy === groundScaleY) return;
    drawnViewRef.current = { x: view.x, y: view.y, scale: view.scale, sy: groundScaleY };
    for (const layer of [layerRef.current, groundTokenLayerRef.current, tokenLayerRef.current, sharedTokenLayerRef.current, spellAreaLayerRef.current]) {
      if (!layer) continue;
      layer.position({ x: view.x, y: view.y });
      layer.scale({ x: view.scale, y: view.scale * groundScaleY });
      layer.draw();
    }
    if (legacyFootstepsLayerRef.current) {
      legacyFootstepsLayerRef.current.position({ x: view.x, y: view.y });
      legacyFootstepsLayerRef.current.scale({ x: view.scale, y: view.scale });
      legacyFootstepsLayerRef.current.draw();
    }
  }, [view, groundScaleY]);
  const paintPan = useStableCallback((position:Pt) => {
    viewRef.current = { ...view, ...position };
    drawnViewRef.current = { x: position.x, y: position.y, scale: view.scale, sy: groundScaleY };
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
    if (groundTokens) groundTokens.style.zIndex = legacy?'1':'0';
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
    if (!focusRequest || focusRequest.nonce === focusNonce.current || !mapImageReady) return;
    focusNonce.current = focusRequest.nonce;
    const token = snapshot.tokens.find((t) => t.id === focusRequest.tokenId);
    if (!token || !size.w || !size.h) return;
    const ground = mapToScreen(token.x, token.y, view, tiltDegrees);
    const p = projectGround(ground.x, ground.y, size.w, size.h, tiltDegrees, rotationDegrees);
    const inset = 0.15;
    if (p.x >= size.w * inset && p.x <= size.w * (1 - inset) && p.y >= size.h * inset && p.y <= size.h * (1 - inset)) return; userAdjusted.current = true;

    setView((v) => ({ ...v, x: size.w / 2 - token.x * v.scale, y: size.h / 2 - token.y * v.scale * groundYScale(tiltDegrees) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce, mapImageReady]);

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
    const cur = viewRef.current, maxS = Math.max(fit.scale * 20, 6), nextS = clamp(cur.scale * factor, fit.scale * 0.25, maxS);
    const nextView = { scale: nextS, x: px - ((px - cur.x) / cur.scale) * nextS, y: py - ((py - cur.y) / cur.scale) * nextS };
    userAdjusted.current = true; paintView(nextView); setView(nextView); if (nextView) return;
    setView((v) => {
      // Max zoom: generous relative to fit, but ALSO a floor over native (1:1)
      // pixels so you can get right in close even on a big high-res map (where
      // fit.scale is tiny) — for the "feel of scale" of a vast space.
      const maxScale = Math.max(fit.scale * 20, 6);
      const newScale = clamp(v.scale * factor, fit.scale * 0.25, maxScale);
      const mx = (px - v.x) / v.scale;
      const my = (py - v.y) / v.scale; userAdjusted.current = true;
  
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
    notify('Uploading / preparing map tile...');startLoadingTask({id:'upload:map-tile',category:'artwork',indeterminate:true,label:'Uploading Map Tile…',showDelayMs:0});
    const res=await apiFetch('/api/map-media',{method:'POST',body:fd}).catch(()=>null);
    if(!res||!res.ok){cancelLoadingTask('upload:map-tile');const data=await res?.json().catch(()=>null);notify(data?.error??'Could not upload that map tile.');return;}completeLoadingTask('upload:map-tile');
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
    } if (Math.hypot(e.target.x() - view.x, e.target.y() - view.y) > 0.5) { userAdjusted.current = true;
    }

    setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
  };

  const resetView = () => {
    paintView(fit);
    userAdjusted.current = false;
    setView(fit);
  };


  const paintProjection = (tilt:number,rotation:number,nextView:View) => {
    const previous=projectionState.current;
    if(previous.tilt!==tilt){viewRef.current=nextView;drawnViewRef.current={x:nextView.x,y:nextView.y,scale:nextView.scale,sy:groundYScale(tilt)};}
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
        onServerPreview={sourceViewSnapshot.serverRendering?.enabled&&sourceViewSnapshot.legacyGeometry!==undefined?requestMovementPreview:undefined}
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
      <MapLoadingBar />
      {activeSelectionBox.box && <div className="dm-selection-box" data-testid="dm-selection-box" aria-hidden="true"
        style={{ left: Math.min(activeSelectionBox.box.start.x, activeSelectionBox.box.end.x), top: Math.min(activeSelectionBox.box.start.y, activeSelectionBox.box.end.y),
          width: Math.abs(activeSelectionBox.box.end.x - activeSelectionBox.box.start.x), height: Math.abs(activeSelectionBox.box.end.y - activeSelectionBox.box.start.y) }} />}
      {placingLight&&<div className="environment-placement-hint" role="status">{lightPlacement?.lightId?'Click map to move light':'Click repeatedly to place lights'} · <button onClick={()=>placeLight(null)}>Done</button></div>}
      {!map && <div className="stage-empty">No active map yet.</div>}
      {map && (
        <>
          <MapToolbarPortals toolSlot={toolSlot} zoomBy={zoomBy} view={view} resetView={resetView} legacy={legacy} animateView={animateView} tilted={tilted} projectionState={projectionState} actualDm={actualDm} dmViewMode={dmViewMode} setDmViewMode={setDmViewMode} partyPreview={partyPreview} sourceSnapshot={sourceSnapshot} chooseTilt={chooseTilt} rotationLabel={rotationLabel} rotationDegrees={rotationDegrees} map={map} tiles={tiles} animateMap={animateMap} mapAnimation={mapAnimation} doors={doors} openDoorControls={openDoorControls} wallTool={wallTool} wallSnap={wallSnap} setWallSnap={setWallSnap} comfyOk={comfyOk} generateScenery={generateScenery} tilesMode={tilesMode} setTilesMode={setTilesMode} addTileFromFile={addTileFromFile} reorderMapImage={reorderMapImage} removeMapImage={removeMapImage} setTool={setTool} setRemoveMode={setRemoveMode} setScaleMode={setScaleMode} setMatchMode={setMatchMode} setAnnotate={setAnnotate} setFogBrush={setFogBrush} placeLight={placeLight} setMenu={setMenu} setWallTool={setWallTool} setWallAnchor={setWallAnchor} setWallPointer={setWallPointer} hideCursor={hideCursor} cancelWallStroke={cancelWallStroke} tool={tool} snap={snap} setSnap={setSnap} removeMode={removeMode} snapshot={snapshot} pendingRef={pendingRef} setDraft={setDraft} clearMeasurements={clearMeasurements} annotate={annotate} annoColor={annoColor} setAnnoColor={setAnnoColor} clearAnnotations={clearAnnotations} decalsLocked={decalsLocked} toggleDecalsLocked={toggleDecalsLocked} derivedFtPerSquare={derivedFtPerSquare} widthFt={widthFt} setWidthFt={setWidthFt} gridPx={gridPx} scaleMode={scaleMode} matchMode={matchMode} commitScaleFeet={commitScaleFeet} setMapGrid={setMapGrid} setScaleLine={setScaleLine} setScalePrompt={setScalePrompt} setVisionFog={setVisionFog} mapFogEnabled={mapFogEnabled} tokenFogEnabled={tokenFogEnabled} paintLayer={paintLayer} setPaintLayer={setPaintLayer} fogBrush={fogBrush} brushSize={brushSize} setBrushSize={setBrushSize} toggleLayer={toggleLayer} coverFog={coverFog} revealAll={revealAll} />
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
              ref={layer=>{legacyFootstepsLayerRef.current=layer;if(layer){const canvas=layer.getNativeCanvasElement();canvas.style.zIndex=legacy?'1':'0';canvas.style.pointerEvents='none';canvas.dataset.testid='legacy-footsteps';}}}>
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
              <WallAndDoorKonvaGroup wallActive={wallActive} wallTool={wallTool} map={map} wallPreview={wallPreview} featureSelection={featureSelection} viewScale={view.scale} wallAnchor={wallAnchor} wallPointer={wallPointer} strokeWall={strokeWall} selectedWall={selectedWall} rotationHandle={rotationHandle} doors={doors} doorVisible={doorVisible} actualDm={actualDm} sourceSnapshot={sourceSnapshot} snapshot={snapshot} doorDragPreview={doorDragPreview} nearbyDoors={nearbyDoors} pxPerFoot={pxPerFoot} renderPlayerVision={renderPlayerVision} openDoorControls={openDoorControls} notify={notify} />
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
              nameLabels={miniatureNameLabels} onRenderedNames={handleRenderedNames} onVisionLights={renderPlayerVision?handleVisionLights:undefined} onPrepareVisionLights={renderPlayerVision?handlePrepareVisionLights:undefined} />
          </Suspense></MiniatureFallback>}
          {renderPlayerVision&&snapshot.playerVision&&(legacy?<LegacyVisionOverlay terrain={{tiles:[...(map?.imagePath&&baseW&&baseH?[{url:map.imagePath,x:0,y:0,w:baseW,h:baseH}]:[]),...tiles.map(t=>({url:t.imagePath,x:t.x,y:t.y,w:t.w,h:t.h}))],grid:map?.gridHidden?undefined:{size:grid,x:map?.gridOffsetX??0,y:map?.gridOffsetY??0}}} ref={visionRef} presentation={presentation} terrainRaster={legacyTerrain?snapshot.terrainRaster:undefined} motion={legacyMovement.playback} tiles={snapshot.visionTiles} raster={snapshot.visionRaster} geometry={snapshot.legacyGeometry} vision={snapshot.playerVision} view={view} width={size.w} height={size.h} mapFogOfWar={usesMapVision(map)} explored={snapshot.exploredTerrain} keepRevealed={map?.explorationMode==='revealed'}/>:<PlayerVisionOverlay serverGeometry={snapshot.legacyGeometry??(sourceViewSnapshot.legacyMotion?.membershipOnly?sourceViewSnapshot.legacyGeometry:undefined)} spellLighting={!spellColorOverlay} ref={visionRef} presentation={presentation} vision={snapshot.playerVision} keepRevealed={map?.explorationMode==='revealed'} mapFogOfWar={usesMapVision(map)} view={view} tilt={tiltDegrees} rotation={rotationDegrees} width={size.w} height={size.h}
            terrain={{environment:map?.environment,explored:snapshot.exploredTerrain,tiles:[...(map?.imagePath&&baseW&&baseH?[{url:map.imagePath,x:0,y:0,w:baseW,h:baseH}]:[]),...tiles.map(t=>({url:t.imagePath,x:t.x,y:t.y,w:t.w,h:t.h}))],bounds:{x:extX0,y:extY0,w:imgW,h:imgH},grid:map?.gridHidden?undefined:{size:grid,x:map?.gridOffsetX??0,y:map?.gridOffsetY??0}}}/>)}
          <WallAndDoorHud wallActive={wallActive} wallTool={wallTool} setWallTool={setWallTool} setWallAnchor={setWallAnchor} wallThickness={wallThickness} setWallThickness={setWallThickness} selectedWall={selectedWall} featureSelection={featureSelection} deleteFeatures={deleteFeatures} map={map} doorDragPreview={doorDragPreview} doors={doors} activeDoorControls={activeDoorControls} dismissDoorControls={dismissDoorControls} actualDm={actualDm} sourceSnapshot={sourceSnapshot} snapshot={snapshot} onSelectToken={onSelectToken} operateDoor={operateDoor} />
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
          <SpellTargetingPrompts targeting={spellTargeting} actionSnapshot={actionSnapshot} map={map} actualDm={actualDm} />
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
          {pasteImg && <PasteImageModal pasteImg={pasteImg} pasteOrig={pasteOrig} setPasteImg={setPasteImg} mapId={map?.id} size={size} view={view} tiltDegrees={tiltDegrees} grid={grid} pasteObject={pasteObject} addAnnotation={addAnnotation} notify={notify} />}
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

