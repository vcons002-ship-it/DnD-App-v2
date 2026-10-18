import {requestBattlefieldFrame,cancelBattlefieldFrame} from './battlefieldFrame';
import {centeredMiniatureOutlineBounds,createMiniatureSilhouetteOutline,isMiniatureWeaponPart,type OutlineRect} from './miniatureSilhouetteOutline';
import {miniatureLodForPixels,miniatureLodPair,miniatureLodShouldPrepare,type MiniatureLod} from '../../../shared/miniatureLod';
import {warmMiniatureGpuBuffers} from './miniatureGpuWarmup';
import {createMiniatureLodTransitions} from './miniatureLodTransitions';
import {createMiniatureLodVisibility} from './miniatureLodVisibility';
import {createMiniatureBatches} from './miniatureBatches';
import {createMiniatureTransform,retainMiniatureLocalTransforms} from './miniatureTransforms';
import {createMiniatureMovePreviewGeometry} from './miniatureMovePreview';
import {createMirrorImages} from './mirrorImages';
import {createMiniatureFootprints} from './miniatureFootprints';
import type {FootprintMark} from './FootprintTrails';
import {createSpiritualWeapon} from './spiritualWeapon';
import {DEATH_SKULL,SPIRITUAL_WEAPON,miniatureForLod,miniatureForPreload} from '../lib/miniatures';
import {NEUTRAL_MINIATURE_LIGHTING} from './miniatureLightingDefaults';
import {COMBAT_ROLE_ICON} from '../../../shared/combatRole';
import type {CombatRole} from '../../../shared/types';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Vector2, Color, AnimationMixer, ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight,
  Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, RingGeometry,
  Box3, Sprite, SpriteMaterial, CanvasTexture, PlaneGeometry, Scene, Texture, DepthTexture, Matrix4, Vector3, WebGLRenderer, PerspectiveCamera, WebGLRenderTarget,
  DataTexture, NearestFilter, RGBAFormat,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { MiniatureDefinition } from '../lib/miniatures';
import { facingAfterMove } from '../../../shared/tokenFacing';
import { createMiniatureNameLayer } from './miniatureNameLayer';
import {createMiniatureMaskCache} from './miniatureMaskCache';
import { createMiniatureVisibilityMaterial, createMiniatureVisionLift } from './miniatureVisionLift';
import {createMiniatureVisionComposite,type SpellFlash,type VisionCoverFrame} from './miniatureVisionComposite';
import {spellLightReach} from './battlefieldLighting';
import type { MiniatureNameLabel } from './miniatureNameLabels';
import { prepareMiniatureBase } from './miniatureBaseMaterial';
import { createBattlefieldEnvironment, type EnvironmentPreviewSettings } from './battlefieldEnvironment';
import {createPreviewGpuTiming} from './previewGpuTiming';
import {measureMistBody,mistBodyInMap,type MistBody} from './miniatureMistBody';
import { createVanecLightning } from './vanecLightning';
import {createMiniatureTorchLighting,measureLanternAnchor} from './miniatureTorchLighting';
import {createMiniatureShaderWarmup} from './miniatureShaderWarmup';
import {createSpellImpactEffects,SPELL_IMPACT_LAYER,type SpellImpact} from './spellImpactEffects';
import {spellMistEnabled} from './spellMist';
import {createSpellColorOverlay} from './spellColorOverlay';
import {createLocalLightShadows} from './localLightShadows';
import {useEnvironmentQuality,recordGraphicsFrame} from '../lib/useEnvironmentQuality';
import {graphicsBudget} from '../../../shared/graphicsQuality';
import {rollBackgroundBudget} from '../lib/rollBackgroundBudget';
import { useStore } from '../state/socket';
import {createRaisedMapStudy} from './raisedMapStudy';
import {createArchArtLayer} from './archArtLayer';
import {createArchArtStudy} from './archArtStudy';
import {CARRIED_LANTERN_LIGHT_HEIGHT_FT} from '../../../shared/lightFalloff';
import {
  miniatureCameraTarget,
  perspectiveDistance,
  type BattlefieldView,
} from './miniatureProjection';

export type MiniatureToken = {
  sharedSightOnly?: boolean;
  invisible?: boolean;
  id: string; x: number; y: number; diameter: number; hidden: boolean;
  facing?: number;
  carriedLantern?: boolean;
  tint?: string;
  outline?: string;
  shade?: [number, number, number];
  activeTurn?: boolean;
  selected?: boolean;
  conditionColors?: string[];
  hunterMarked?: boolean;
  mirrorImages?:number;
  combatRole?: CombatRole | null;
  definition: MiniatureDefinition;
};
const EMPTY_WALLS:import('../../../shared/mapWalls').MapWall[]=[];
const NO_FLASHES:SpellFlash[]=[];
const FLASH_CIRCLE=Array.from({length:48},(_,i)=>({x:Math.cos(i*Math.PI/24),y:Math.sin(i*Math.PI/24)}));
type Props = {
  rollBackground?: boolean;
  rollBackgroundPrepared?: boolean;
  spellColorOverlay?: boolean;
  /** Cosmetic A/B comparison; never changes game state. */
  spellMist?: boolean;
  graphics?: ReturnType<typeof graphicsBudget>;
  footprints?: ()=>FootprintMark[];
  spellImpacts?: SpellImpact[];
  preparedSpellImpacts?: SpellImpact[];
  /** A player's map fog: spell art is clipped to revealed cells. Bounds in map pixels. */
  spellFog?: {grid:number;revealed:readonly string[];x0:number;y0:number;x1:number;y1:number};
  onPrepareVisionLights?: (lights:import('../../../shared/playerVision').VisionLight[])=>void;
  memoryTerrainCanvas?: ()=>HTMLCanvasElement|null;
  visionCoverFrame?: ()=>VisionCoverFrame|undefined;
  personalVision?: boolean;
  onVisionLights?: (lights:import('../../../shared/playerVision').VisionLight[])=>void;
  tokens: MiniatureToken[];
  preloadDefinitions?: MiniatureDefinition[];
  onFailed?: (tokenIds: ReadonlySet<string>) => void;
  onUnavailable?: () => void;
  view: BattlefieldView;
  tiltDegrees: number;
  rotationDegrees?: number;
  width: number;
  height: number;
  isVisibleAt?: (id: string, x: number, y: number) => boolean;
  visualPosition?: (id:string)=>{x:number;y:number}|undefined;
  onReady: (tokenIds: ReadonlySet<string>) => void;
  nameLabels?: () => MiniatureNameLabel[];
  onRenderedNames?: (ids: ReadonlySet<string>) => void;
  /** Shared renderer settings for figure illumination. */
  environmentPreview?: EnvironmentPreviewSettings;
};
export type MiniatureLayerHandle = {
  headPosition: (id:string)=>{x:number;y:number}|undefined;
  setFootprints: (marks:FootprintMark[])=>void;
  spellCast: (tokenIds: string[]) => void;
  setView: (view: BattlefieldView) => void;
  setProjection: (tilt:number, rotation:number, view:BattlefieldView) => void;
  moveToken: (id: string, x: number, y: number, finished: boolean, facing?: number) => void;
  previewMove: (id: string, point: {x:number;y:number;facing:number} | null) => void;
};
type FxManifest = {
  duration_seconds: number;
  material_channels: Record<string, string>;
  keyframes: Array<Record<string, number> & { time: number }>;
};
type Instance = {
  modelId:string;
  mirrors:ReturnType<typeof createMirrorImages>;
  baseDiameter:number;
  outlineBounds:Box3;
  lanternAnchor:Vector3;
  torchLighting:ReturnType<typeof createMiniatureTorchLighting>;
  measureBody: () => MistBody;
  root: Group;
  movePreviewGeometry?:ReturnType<typeof createMiniatureMovePreviewGeometry>;
  movePreviewKey?:string;
  updateTransform:()=>boolean;
  turnRing: Mesh<RingGeometry, MeshBasicMaterial>;
  selectionRing: Mesh<RingGeometry, MeshBasicMaterial>;
  conditionRings: Mesh<RingGeometry, MeshBasicMaterial>[];
  hunterMark: Sprite;
  combatBadge: Group;
  badgeMesh: Mesh<PlaneGeometry,MeshBasicMaterial>;
  badgeTexture: CanvasTexture;
  badgeRole?: CombatRole | null;
  url: string;
  materials: Material[];
  originalColors: Array<Color | null>;
  originalOpacity: number[];
  originalTransparent: boolean[];
  mixer: AnimationMixer | null;
  shadowAnimated: boolean;
  mistBody?: MistBody;
  fx: FxManifest | null;
  lightning: ReturnType<typeof createVanecLightning> | null;
};
type Engine = MiniatureLayerHandle & { sync: (props: Props) => void; dispose: () => void };

// Lift illumination above humanoid figures; the fixture remains on the hip.
const CARRIED_LIGHT_HEIGHT_FT=CARRIED_LANTERN_LIGHT_HEIGHT_FT;

function disposeAsset(gltf: GLTF) {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  gltf.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => {
    texture.dispose();
    // GLTFLoader uses ImageBitmap where available; release that CPU copy too.
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
  });
}

function applyFx(instance: Instance, seconds: number) {
  const fx = instance.fx;
  if (!fx || fx.keyframes.length < 2 || fx.duration_seconds <= 0) return;
  const time = seconds % fx.duration_seconds;
  const index = fx.keyframes.findIndex((key) => key.time > time);
  const a = fx.keyframes[Math.max(0, index - 1)];
  const b = fx.keyframes[index < 0 ? fx.keyframes.length - 1 : index];
  const fraction = b.time > a.time ? (time - a.time) / (b.time - a.time) : 0;
  for (const material of instance.materials) {
    const channel = fx.material_channels[material.name];
    if (channel && material instanceof MeshStandardMaterial && Number.isFinite(a[channel]) && Number.isFinite(b[channel])) {
      material.emissiveIntensity = a[channel] + (b[channel] - a[channel]) * fraction;
    }
  }
}

/** One renderer for all visible miniatures. Konva remains the sole input owner. */
function createEngine(host: HTMLDivElement, initial: Props, report: (ids: string[], status: string) => void): Engine {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, stencil: true, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  // All transforms are prepared once after environment/token animation. Color,
  // body-mask and shared-sight passes then reuse those exact world matrices.
  scene.matrixAutoUpdate=false;scene.matrixWorldAutoUpdate=false;
  const footprints=createMiniatureFootprints(scene);
  const spellImpacts=createSpellImpactEffects(scene);
  const spellColor=createSpellColorOverlay(host.parentElement!);
  const localShadows=createLocalLightShadows(renderer,()=>invalidate());
  // Shared screen mask measures local silhouette thickness for every model,
  // including weapons merged into a body mesh. Layer 1 contains opaque bodies only.
  const outlineMask = new WebGLRenderTarget(1, 1);
  const bodyMaskCache=createMiniatureMaskCache();
  const bodySlots=new Map<string,number>();
  outlineMask.depthTexture = new DepthTexture(1, 1);
  const outlineProjectionInverse = {value: new Matrix4()};
  const maskMaterial = createMiniatureVisibilityMaterial();
  const outlineResolution = {value: new Vector2(1, 1)};
  const silhouette=createMiniatureSilhouetteOutline(outlineMask.texture,outlineMask.depthTexture,outlineProjectionInverse);

  const names=createMiniatureNameLayer(scene,outlineMask.depthTexture,outlineResolution);
  const legacyVision=new URLSearchParams(location.search).get('legacyVisionLift')==='1'||!initial.visionCoverFrame;
  let visionLift=legacyVision?createMiniatureVisionLift(renderer,host,outlineMask.texture):null;
  const visionComposite=legacyVision?null:createMiniatureVisionComposite(renderer,host,outlineMask.texture);
  // Copy only the party-awareness pass above the personal vision cover. Reuse
  // this renderer and its loaded assets; never copy terrain, lights or effects.
  const sharedCanvas=document.createElement('canvas');
  sharedCanvas.dataset.testid='shared-sight-miniatures';
  sharedCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;filter:grayscale(1);opacity:.78';
  host.parentElement?.appendChild(sharedCanvas);
  const sharedContext=sharedCanvas.getContext('2d')!;
  const sharedDepth=new MeshBasicMaterial({colorWrite:false});
  let sharedFrameKey='';
  const labelVersions=new WeakMap<HTMLCanvasElement,number>();let nextLabelVersion=0;

  const ambient = new HemisphereLight(0xe5edff, 0x726856, NEUTRAL_MINIATURE_LIGHTING.ambient);
  scene.add(ambient);
  const key = new DirectionalLight(0xffeddb, NEUTRAL_MINIATURE_LIGHTING.key);
  key.position.set(-3, 8, 5);
  scene.add(key);
  ambient.layers.enable(4);key.layers.enable(4);
  ambient.layers.enable(SPELL_IMPACT_LAYER);key.layers.enable(SPELL_IMPACT_LAYER);
  // A small neutral environment keeps metal readable without per-token lights/shadows.
  let pmrem: PMREMGenerator | null = null;
  let room: RoomEnvironment | null = null;
  let environment: WebGLRenderTarget | null = null;
  try {
    pmrem = new PMREMGenerator(renderer);
    room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04, 0.1, 100);
    scene.environment = environment.texture;
    scene.environmentIntensity = NEUTRAL_MINIATURE_LIGHTING.reflection;
  } catch (error) {
    spellImpacts.dispose();spellColor.dispose();localShadows.dispose();
    sharedCanvas.remove();sharedDepth.dispose();names.dispose();visionLift?.dispose();visionComposite?.dispose();
    silhouette.dispose();outlineMask.dispose(); maskMaterial.dispose();
    environment?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    throw error;
  } finally { room?.dispose(); pmrem?.dispose(); }
  let camera: OrthographicCamera | PerspectiveCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000000);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const assets = new Map<string, Promise<GLTF | null>>();
  const failedAssets = new Set<string>();
  let lastFailedIds: string | undefined;
  const manifests = new Map<string, Promise<FxManifest | null>>();
  const instances = new Map<string, Instance>();
  const movePreviewGeometries=new Map<string,{geometry:ReturnType<typeof createMiniatureMovePreviewGeometry>;users:number}>();
  const opacityFades=new Map<string,{start:number;from:number;to:number;value:number}>();
  const shaderWarmup=createMiniatureShaderWarmup(renderer,createMiniatureTorchLighting(localShadows.uniforms));
  const loading = new Map<string, string>();
  const moves = new Map<string, { x: number; y: number; facing: number; fromX: number; fromY: number; until: number }>();
  // One local planning silhouette, baked while loading. It has no effects,
  // shadows, labels, hit region or network representation and costs one draw.
  let preview: {id:string;root:Group} | null = null;
  const previewMaterial = new MeshBasicMaterial({color: '#83aab6', transparent:true, opacity:.3,depthWrite:false,toneMapped:false});
  const clearPreview = () => {
    if(preview)scene.remove(preview.root);
    preview=null;delete host.dataset.previewTokenId;delete host.dataset.previewDrawCalls;
  };
  const abort = new AbortController();
  let props = initial,sourceProps=initial;
  // Revealed map-fog cells as a texture for clipping spell art (players only).
  let lastSpellFog:Props['spellFog']|null=null,spellFogTexture:DataTexture|null=null;
  // Every snapshot brings a fresh revealed-cell array, so compare contents and
  // only build while spell art is drawing.
  const sameSpellFog=(a:Props['spellFog']|null,b:Props['spellFog'])=>a===b||!!a&&!!b&&a.grid===b.grid&&a.x0===b.x0&&a.y0===b.y0&&a.x1===b.x1&&a.y1===b.y1&&
    a.revealed.length===b.revealed.length&&a.revealed.every((key,i)=>key===b.revealed[i]);
  const syncSpellFog=()=>{
    const fog=props.spellFog;if(sameSpellFog(lastSpellFog,fog)){lastSpellFog=fog;return;}lastSpellFog=fog;
    spellFogTexture?.dispose();spellFogTexture=null;
    if(!fog||!(fog.grid>0)){spellImpacts.setFogClip(null);return;}
    const originX=Math.floor(fog.x0/fog.grid),originY=Math.floor(fog.y0/fog.grid);
    const cols=Math.max(1,Math.min(4096,Math.ceil(fog.x1/fog.grid)-originX)),rows=Math.max(1,Math.min(4096,Math.ceil(fog.y1/fog.grid)-originY));
    const data=new Uint8Array(cols*rows*4);
    for(const key of fog.revealed){
      const [cx,cy]=key.split(',').map(Number),i=cx-originX,j=cy-originY;
      if(Number.isInteger(i)&&Number.isInteger(j)&&i>=0&&j>=0&&i<cols&&j<rows)data[(j*cols+i)*4]=255;
    }
    spellFogTexture=new DataTexture(data,cols,rows,RGBAFormat);
    spellFogTexture.magFilter=spellFogTexture.minFilter=NearestFilter;spellFogTexture.needsUpdate=true;
    spellImpacts.setFogClip({texture:spellFogTexture,originX,originY,cols,rows,grid:fog.grid});
  };
  const lodLevels=new Map<string,MiniatureLod>();
  const lodVisibility=createMiniatureLodVisibility();
  const lodTransitions=createMiniatureLodTransitions();
  const wantedModels=new Map<string,MiniatureDefinition>();
  const preparedInstances=new Map<string,Instance>();
  let lodDecisionKey='';
  let lodTimer:ReturnType<typeof setTimeout>|undefined;
  let tokenById=new Map(initial.tokens.map(t=>[t.id,t]));
  const batches=createMiniatureBatches(scene);
  const batchingEnabled=new URLSearchParams(location.search).get('batching')!=='off';
  const measurements=new Map<string,{anchor:Vector3;body?:MistBody}>();
  const playerAssetUrls=new Set<string>();
  const backgroundAssetUrls=new Set<string>();
  const warmedAssets=new Set<string>();
  const preloadQueue=new Map<string,MiniatureDefinition>();
  let preloadTimer:ReturnType<typeof setTimeout>|undefined;
  let preloadRunning=false;
  function evictRetiredPlayerAssets(){
    const keep=new Set([...(props.preloadDefinitions??[]).map(d=>miniatureForPreload(d,props.graphics?.modelQuality??'high').url),...props.tokens.map(t=>t.definition.url),...[...instances.values(),...preparedInstances.values()].map(i=>i.url),...loading.values(),...[...wantedModels.values()].map(d=>d.url)]);
    for(const url of new Set([...playerAssetUrls,...backgroundAssetUrls])){
      if(keep.has(url)||!assets.has(url))continue;
      const promise=assets.get(url)!;assets.delete(url);measurements.delete(url);warmedAssets.delete(url);backgroundAssetUrls.delete(url);
      void promise.then(asset=>{if(asset)disposeAsset(asset);});
    }
    host.dataset.cachedModelAssets=String(assets.size);
  }
  let view = initial.view;
  let committedView = initial.view;
  let committedTilt = initial.tiltDegrees,committedRotation=initial.rotationDegrees??0;
  let disposed = false;
  let failed = false;
  let frame = 0;
  let lastPaint = 0;
  const started = performance.now();
  let lastIds = '';
  let lastStatus = '';
  let hasRendered = false;
  let renderedWidth = 0;
  let renderedHeight = 0;
  let renderedPixelRatio = 0;
  let battlefield: ReturnType<typeof createBattlefieldEnvironment> | null = null;
  let lastEnvironment: EnvironmentPreviewSettings | undefined;
  let paintCount = 0, paintEpoch = performance.now();
  let totalPaintCount = 0, totalFrameCount = 0, countedFrame = -Infinity;
  const timing=initial.environmentPreview&&new URLSearchParams(location.search).has('benchmark')?createPreviewGpuTiming(renderer.getContext()):null;
  const visionTiming=timing?createPreviewGpuTiming(renderer.getContext()):null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paintedReducedMotion: boolean | undefined;

  const updateCamera = () => {
    const scale = Math.max(0.0001, view.scale);
    const center = miniatureCameraTarget(props.width, props.height, view, props.tiltDegrees);
    const perspective = props.tiltDegrees > 0;
    if (perspective && !(camera instanceof PerspectiveCamera)) camera = new PerspectiveCamera();
    if (!perspective && !(camera instanceof OrthographicCamera)) camera = new OrthographicCamera();
    const focal = perspectiveDistance(props.width, props.height, props.tiltDegrees);
    if (camera instanceof PerspectiveCamera) {
      camera.fov = 2 * Math.atan(props.height / (2 * focal)) * 180 / Math.PI;
      camera.aspect = props.width / Math.max(1, props.height);
    } else {
      camera.left = -props.width / (2 * scale); camera.right = -camera.left;
      camera.top = props.height / (2 * scale); camera.bottom = -camera.top;
    }
    const distance = perspective ? focal / scale : Math.max(props.width, props.height) / scale + 10000;
    const depthSpan = Math.max(props.width, props.height) / scale * 2
      + Math.max(1, ...props.tokens.map((token) => token.diameter)) * 4;
    camera.near = Math.max(0.1, distance - depthSpan);
    camera.far = distance + depthSpan;
    const tilt = props.tiltDegrees * Math.PI / 180;
    const yaw=(props.rotationDegrees ?? 0)*Math.PI/180;
    camera.position.set(center.x+distance*Math.sin(tilt)*Math.sin(yaw), distance * Math.cos(tilt), center.z + distance * Math.sin(tilt)*Math.cos(yaw));
    // At exactly overhead the default Y-up is parallel to the viewing axis.
    // An explicit screen-up keeps flat mode oriented identically to the map.
    camera.up.set(-Math.cos(tilt)*Math.sin(yaw), Math.sin(tilt), -Math.cos(tilt)*Math.cos(yaw));
    camera.lookAt(center.x, 0, center.z);
    camera.updateProjectionMatrix();
    outlineProjectionInverse.value.copy(camera.projectionMatrixInverse);
    host.dataset.cameraRotation=String(props.rotationDegrees??0);host.dataset.cameraTilt=String(props.tiltDegrees);
  };
  const publish = () => {
    host.dataset.preparedModelUrls=JSON.stringify([...preparedInstances.values()].map(i=>i.url));
    host.dataset.preparedModelsInScene=String([...preparedInstances.values()].filter(i=>i.root.parent===scene).length);
    host.dataset.activeModelUrls=JSON.stringify([...instances.values()].map(i=>i.url));
    host.dataset.deathSkullCount=String(props.tokens.filter(t=>t.definition.id===DEATH_SKULL.id&&instances.get(t.id)?.url===DEATH_SKULL.url).length);
    const failedIds = props.tokens.filter(t => failedAssets.has(t.definition.url)&&!instances.has(t.id)).map(t => t.id).sort();
    if (failedIds.join("|") !== lastFailedIds) {
      lastFailedIds = failedIds.join("|");
      props.onFailed?.(new Set(failedIds));
    }
    const ids = failed ? [] : props.tokens.filter((token) => instances.has(token.id)).map((token) => token.id).sort();
    const key = ids.join('|');
    const status = failed ? 'unavailable' : ids.length || (!props.tokens.length && battlefield?.ready) ? 'ready' : 'loading';
    if (key !== lastIds || status !== lastStatus || !hasRendered) {
      lastIds = key;
      lastStatus = status;
      hasRendered = true;
      props.onReady(new Set(ids));
      report(ids, status);
    }
  };
  const fail = () => {
    if (disposed) return;
    failed = true;
    props.onUnavailable?.();
    renderer.domElement.style.visibility = 'hidden';
    cancelBattlefieldFrame(frame);
    frame = 0;
    publish();
    dispose();
  };
  const draw = (_frameTime: number) => {
    // RAF's frame-start timestamp can precede an immediate camera redraw in the
    // same frame. One live clock keeps movement, fog history and FX monotonic.
    const now = performance.now();
    frame = 0;
    if (disposed || failed || document.hidden) return;
    const environment=props.environmentPreview;
    const atmosphereAnimated = !!environment?.enabled && !reducedMotion.matches &&
      ((environment.particles&&environment.particles!=='none'&&(environment.particleIntensity??.5)>0) || (environment.groundWetness??0)>0 || environment.lightning || environment.mist || (!!environment.weather && environment.weather!=='none' && (environment.weatherIntensity??.5)>0) || !!environment.lights?.some(light=>light.flicker) || !!environment.carriedLanterns?.length || props.tokens.some(t=>t.carriedLantern));
    const animated = !reducedMotion.matches && [...instances.values()].some((instance) => instance.mixer || instance.fx || instance.turnRing.visible || instance.selectionRing.visible);
    const settling = [...moves.values()].some((move) => Number.isFinite(move.until));
    const casting = [...instances.entries()].filter(([, instance]) => instance.lightning?.active(now / 1000));
    host.dataset.castingTokenIds = casting.map(([id]) => id).join(',');
    // Paint the preference change even inside the frame cap: this may be the
    // last frame once animation stops, so no flash or moving effect may linger.
    const fps=props.rollBackground?12:props.environmentPreview||spellImpacts.active?60:24;
    if (paintedReducedMotion !== reducedMotion.matches || now - lastPaint >= 1000/fps-1) {
      paintedReducedMotion = reducedMotion.matches;
      lastPaint = now;
      const seconds = (now - started) / 1000;
      host.dataset.mirrorImageCount=String(props.tokens.reduce((n,t)=>n+(instances.has(t.id)?t.mirrorImages??0:0),0));
      for(const [id,move] of moves)if(move.until<now)moves.delete(id);
      for (const token of props.tokens) {
        const instance = instances.get(token.id);
        if (!instance) continue;
        const move = moves.get(token.id);
        if (move && move.until < now) moves.delete(token.id);
        const position = {...(moves.get(token.id) ?? token),...props.visualPosition?.(token.id)};
        const wasVisible = instance.root.visible;
        instance.root.visible = props.isVisibleAt?.(token.id, position.x, position.y) ?? true;
        if (battlefield && (wasVisible !== instance.root.visible || instance.root.position.x !== position.x || instance.root.position.z !== position.y || instance.root.rotation.y !== (position.facing ?? 0) || (animated && instance.shadowAnimated))) renderer.shadowMap.needsUpdate = true;
        instance.root.position.set(position.x, 0, position.y);
        instance.root.rotation.y = position.facing ?? 0;
        instance.updateTransform();
    instance.combatBadge.rotation.y=(props.rotationDegrees??0)*Math.PI/180-instance.root.rotation.y;
        const pulse = reducedMotion.matches ? 0 : (Math.sin(seconds / 0.28) + 1) / 2;
        const selectionPulse = reducedMotion.matches ? 0 : (Math.sin(seconds * Math.PI * 2 / 1.6) + 1) / 2;
        instance.selectionRing.scale.setScalar(token.definition.baseDiameter * (1 + selectionPulse * .045));
        instance.selectionRing.material.opacity = (reducedMotion.matches ? 1 : .65 + selectionPulse * .35) * (token.hidden ? .45 : 1);
        instance.turnRing.scale.setScalar(token.definition.baseDiameter * (1 + pulse * 0.06));
        instance.turnRing.material.opacity = (0.65 + pulse * 0.35) * (token.hidden ? 0.45 : 1);
        if (animated) { instance.mixer?.setTime(seconds); applyFx(instance, seconds); }
        instance.lightning?.update(seconds, now / 1000, reducedMotion.matches, token.hidden);
      }
      for(const [id,fade] of opacityFades){
        const instance=instances.get(id);if(!instance){opacityFades.delete(id);continue;}
        const t=reducedMotion.matches?1:Math.min(1,(now-fade.start)/850),ease=t*t*(3-2*t);fade.value=fade.from+(fade.to-fade.from)*ease;
        instance.materials.forEach((m,i)=>{if(t<1&&!m.transparent){m.transparent=true;m.needsUpdate=true;}m.opacity=instance.originalOpacity[i]*fade.value;});
      }
      const staged=props.preparedSpellImpacts??[];
      if(staged.length||spellImpacts.active)syncSpellFog();
      const preparedLights=spellImpacts.prepare(staged,now,props.environmentPreview?.pixelsPerFoot??12.8,reducedMotion.matches,id=>{
        const impact=staged.find(e=>e.tokenId===id);if(!impact)return;
        const instance=instances.get(id),x=impact.fixed?impact.x:instance?.root.position.x??impact.x,y=impact.fixed?impact.y:instance?.root.position.z??impact.y;
        return {x,y,height:instance?.mistBody?instance.mistBody.height*instance.root.scale.x:undefined,visible:props.isVisibleAt?.(id,x,y)??true};
      });
      if(preparedLights.length){
        if(!props.spellColorOverlay){battlefield?.lighting.prepareTransient(preparedLights,renderer);props.onPrepareVisionLights?.(preparedLights);}
      }else if(!staged.length&&!spellImpacts.active){battlefield?.lighting.prepareTransient([]);props.onPrepareVisionLights?.([]);}
      if(spellImpacts.preparation.pending)spellImpacts.warm(renderer,camera);
      host.dataset.spellPreparedCount=String(spellImpacts.preparation.pending);
      host.dataset.spellGeometryBuilt=String(spellImpacts.preparation.built);
      host.dataset.spellPreparedPromoted=String(spellImpacts.preparation.promoted);
      host.dataset.spellGpuWarmCount=String(spellImpacts.preparation.gpuWarmCount);
      const impactLights=spellImpacts.tick(now,props.environmentPreview?.pixelsPerFoot??12.8,reducedMotion.matches,id=>{
        const impact=props.spellImpacts?.find(e=>e.tokenId===id);if(!impact)return;
        const instance=instances.get(id),point=impact.fixed?impact:props.visualPosition?.(id)??impact;
        return {...point,visible:props.isVisibleAt?.(id,point.x,point.y)??true,
          height:instance?.mistBody?instance.mistBody.height*instance.root.scale.x:undefined};
      });
      host.dataset.spellImpactCount=String(spellImpacts.kinds.length);
      host.dataset.spellTransientCount=String(spellImpacts.transientCount);
      host.dataset.spellImpactKinds=spellImpacts.kinds.join(',');
      host.dataset.spellLightStrength=String(impactLights.reduce((sum,l)=>sum+l.strength,0));
      host.dataset.spellLightPositions=JSON.stringify(impactLights.map(l=>[l.x,l.height,l.y]));
      // Full illumination remains the default; the overlay is a diagnostic comparison.
      battlefield?.lighting.setTransient(props.spellColorOverlay?[]:impactLights);
      spellColor.draw(props.spellColorOverlay?impactLights:[],view,props.tiltDegrees,props.rotationDegrees??0,props.width,props.height);
      battlefield?.setTokens(props.tokens.map(token => {
        const instance=instances.get(token.id);
        const x=instance?.root.position.x??token.x,y=instance?.root.position.z??token.y;
        const body=instance?.mistBody?mistBodyInMap(instance.mistBody,x,y,instance.root.rotation.y,instance.root.scale.x):undefined;
        return {id:token.id,x,y,diameter:token.diameter,body,visible:!!instance?.root.visible && !token.hidden && !token.sharedSightOnly};
      }));
      if(battlefield){
        const disturbMist=props.spellMist!==false&&spellMistEnabled(props.graphics?.resolved,!!props.environmentPreview?.mist,props.environmentPreview?.mistInteraction!==false,reducedMotion.matches);
        battlefield.setSpellMist(disturbMist?spellImpacts.mistImpulses(now,seconds,props.environmentPreview?.pixelsPerFoot??12.8):[],disturbMist);
        const ppf=props.environmentPreview?.pixelsPerFoot??12.8;
        const carriers=new Map((props.environmentPreview?.carriedLanterns??[]).map(t=>[t.id,t]));
        for(const token of props.tokens)if(token.carriedLantern&&!token.hidden)carriers.set(token.id,{...token,facing:token.facing??0});
        battlefield.lighting.setCarried([...carriers.values()].flatMap(token=>{
          const instance=instances.get(token.id),move=moves.get(token.id);
          const x=instance?.root.position.x??move?.x??token.x,y=instance?.root.position.z??move?.y??token.y;
          if(!(props.isVisibleAt?.(token.id,x,y)??true))return [];
          if(instance){
            const belt=instance.root.localToWorld(instance.lanternAnchor.clone()),facing=instance.root.rotation.y;
            return [{id:token.id,x,y,fixtureX:belt.x-Math.cos(facing)*ppf*.34+Math.sin(facing)*ppf*.08,fixtureY:belt.z+Math.sin(facing)*ppf*.34+Math.cos(facing)*ppf*.08,height:ppf*CARRIED_LIGHT_HEIGHT_FT,fixtureHeight:belt.y-ppf*.52,facing}];
          }
          const facing=move?.facing??token.facing,dx=-token.diameter*.30,dz=token.diameter*.10;
          return [{id:token.id,x,y,fixtureX:x+dx*Math.cos(facing)+dz*Math.sin(facing),fixtureY:y-dx*Math.sin(facing)+dz*Math.cos(facing),height:ppf*CARRIED_LIGHT_HEIGHT_FT,fixtureHeight:ppf*2.8,facing}];
        }));
        battlefield.tick(reducedMotion.matches?0:seconds);
        props.onVisionLights?.(battlefield.lighting.lights);
      }
      try {
        const sightFrame=props.visionCoverFrame?.();
        visionComposite?.gradeBodies(sightFrame,[...instances].filter(([,i])=>i.root.visible).map(([id,i])=>({slot:bodySlots.get(id)??0,x:i.root.position.x,y:i.root.position.z})),battlefield?.lighting.fieldUniforms,impactLights,props.environmentPreview?.walls);
        scene.updateMatrixWorld();
        spellImpacts.faceCamera(camera);
        timing?.begin();
        localShadows.render(renderer,scene,camera,battlefield?.lighting.lights.filter(l=>!l.transient)??[],[...instances].map(([id,i])=>({id,root:i.root,diameter:i.baseDiameter*i.root.scale.x,x:i.root.position.x,y:i.root.position.z,visible:i.root.visible&&!tokenById.get(id)?.sharedSightOnly,animated:animated&&i.shadowAnimated})),props.environmentPreview?.walls??EMPTY_WALLS,!!environment?.enabled&&environment.shadows,environment?.shadowLength??1.3,props.graphics,true);
        const lightMode=props.graphics?.miniatureLightMode??'directional';
        host.dataset.miniatureLightMode=lightMode;
        for(const instance of instances.values())instance.torchLighting.update(battlefield?.lighting.lights??impactLights,instance.root,camera,!!props.environmentPreview?.darkvisionTerrain,props.environmentPreview?.walls,lightMode,battlefield?.lighting.fieldUniforms);
        const batching=batches.update([...instances].map(([id,i])=>({root:i.root,lighting:i.torchLighting,
          eligible:!['druk','varis','vanec',DEATH_SKULL.id,SPIRITUAL_WEAPON.id].includes(tokenById.get(id)?.definition.id??'')&&!i.mixer&&!i.fx&&!i.lightning&&!tokenById.get(id)?.sharedSightOnly&&!tokenById.get(id)?.hidden&&!tokenById.get(id)?.invisible&&!tokenById.get(id)?.mirrorImages})),batchingEnabled,true,(props.graphics?.resolved??'high')==='high');
        host.dataset.batchLighting=(props.graphics?.resolved??'high')==='high'?'instance-rows':'shared-uniforms';
        // New batch meshes were added after the scene transform preparation.
        for(const child of scene.children)if(child.name==='batched-miniatures')child.updateMatrixWorld();
        host.dataset.miniatureBatches=String(batching.batches);host.dataset.batchedMeshInstances=String(batching.instances);
        battlefield?.lighting.renderField(renderer);
        battlefield?.prepareMist(renderer);
        const visible=new Set([...instances].filter(([,instance])=>instance.root.visible).map(([id])=>id));
        const sharedIds=new Set(props.tokens.filter(t=>t.sharedSightOnly).map(t=>t.id));
        const labels=props.nameLabels?.()??[];
        const renderedNames=names.sync(labels,visible,sharedIds);
        if ((archArtStudy || archArtLayer.hasArt || props.personalVision || battlefield || renderedNames.size || props.tokens.some(token => token.outline)) &&
          bodyMaskCache.needsRender(outlineMask,scene,camera,true)) {
          const originalLayers = camera.layers.mask;
          camera.layers.set(1); scene.overrideMaterial = maskMaterial;
          const shadowUpdate = renderer.shadowMap.needsUpdate;
          renderer.shadowMap.needsUpdate = false;
          renderer.setRenderTarget(outlineMask); renderer.clear(); renderer.render(scene, camera);
          if(props.tokens.some(t=>t.mirrorImages)) {
            // Lift raised duplicate pixels through terrain fog just like the
            // real figure. Alpha-aware sprites never become rectangle masks.
            const autoClear=renderer.autoClear;
            scene.overrideMaterial=null;camera.layers.set(6);renderer.autoClear=false;
            for(const [id,instance] of instances)instance.mirrors.setVisibilityPass(true,bodySlots.get(id));
            try {renderer.render(scene,camera);} finally {
              for(const instance of instances.values())instance.mirrors.setVisibilityPass(false);
              renderer.autoClear=autoClear;
            }
          }
          renderer.shadowMap.needsUpdate = shadowUpdate;
          scene.overrideMaterial = null; camera.layers.mask = originalLayers;
          renderer.setRenderTarget(null);
        }
        host.dataset.bodyMaskUpdates=String(bodyMaskCache.updates);
        // Shared figures cannot cast shadows or light the viewer's actual map.
        // A depth-only pass of personal figures preserves overlap ordering.
        const sw=renderer.domElement.width,sh=renderer.domElement.height;
        if(sharedCanvas.width!==sw||sharedCanvas.height!==sh){sharedCanvas.width=sw;sharedCanvas.height=sh;}
        sharedCanvas.dataset.tokenIds=[...sharedIds].filter(id=>visible.has(id)).join(',');
        sharedCanvas.style.filter=useStore.getState().snapshot?.map?.explorationMode==='revealed'?'none':'grayscale(1)';
        sharedCanvas.style.opacity=useStore.getState().snapshot?.map?.explorationMode==='revealed'?'1':'.78';
        sharedCanvas.style.display=sharedCanvas.dataset.tokenIds?'block':'none';
        // Static awareness need not redraw for weather or torch flicker. Camera,
        // pose, name, appearance and foreground occlusion changes invalidate it.
        const sharedKey=sharedIds.size?JSON.stringify([sw,sh,camera.projectionMatrix.elements,camera.matrixWorld.elements,
          useStore.getState().snapshot?.map?.explorationMode,environment?.heavyDarkness,ambient.intensity,key.intensity,scene.environmentIntensity,ambient.color.toArray(),key.color.toArray(),
          props.tokens.map(t=>{const i=instances.get(t.id);return [t.id,t.sharedSightOnly,t.tint,t.shade,t.mirrorImages,i?.root.visible,i?.root.position.toArray(),i?.root.rotation.y,i?.root.scale.x];}),
          labels.map(l=>{if(!labelVersions.has(l.canvas))labelVersions.set(l.canvas,++nextLabelVersion);return [l.id,labelVersions.get(l.canvas),l.points,l.opacity];})]):'';
        if(sharedKey!==sharedFrameKey||[...instances.values()].some(i=>i.mixer)){
          sharedFrameKey=sharedKey;sharedContext.clearRect(0,0,sw,sh);
          if(sharedIds.size){
            const layers=camera.layers.mask,autoClear=renderer.autoClear;
            const ambientIntensity=ambient.intensity,keyIntensity=key.intensity,reflection=scene.environmentIntensity;
            const shadowUpdate=renderer.shadowMap.needsUpdate;
            renderer.shadowMap.needsUpdate=false;
            camera.layers.set(5);scene.overrideMaterial=sharedDepth;
            renderer.render(scene,camera);
            scene.overrideMaterial=null;camera.layers.set(4);renderer.autoClear=false;
            // Shared sight uses the map's unlit darkvision appearance. Daylight
            // lighting here made party sightings much brighter than personal sight.
            if(!environment?.heavyDarkness||useStore.getState().snapshot?.map?.explorationMode==='revealed'){
              ambient.intensity=NEUTRAL_MINIATURE_LIGHTING.ambient;key.intensity=NEUTRAL_MINIATURE_LIGHTING.key;
              scene.environmentIntensity=NEUTRAL_MINIATURE_LIGHTING.reflection;
            }
            for(const id of sharedIds){const i=instances.get(id);if(i)i.torchLighting.update([],i.root,camera,!!environment?.darkvisionTerrain&&useStore.getState().snapshot?.map?.explorationMode!=='revealed',[]);}
            renderer.render(scene,camera);
            sharedContext.drawImage(renderer.domElement,0,0);
            camera.layers.mask=layers;renderer.autoClear=autoClear;
            ambient.intensity=ambientIntensity;key.intensity=keyIntensity;scene.environmentIntensity=reflection;
            renderer.shadowMap.needsUpdate=shadowUpdate;
          }
        }
        for(const id of sharedIds){const i=instances.get(id);if(i)i.root.visible=false;}
        battlefield?.renderMemory(renderer,camera,props.memoryTerrainCanvas?.()??null);
        raisedStudy?.update(useStore.getState().snapshot?.playerVision,props.visualPosition);
        // Keep the existing path until the remembered-art texture is ready;
        // this also covers daylight boards without an environment renderer.
        const useComposite=!!visionComposite&&!!sightFrame&&(!sightFrame.explored.length||sightFrame.memory?.dataset.ready==='true');
        const deferSpells=!!props.personalVision&&(!useComposite||!!sightFrame?.enabled||!!sightFrame?.grade&&!sightFrame.grade.daylight);
        if(deferSpells)camera.layers.disable(SPELL_IMPACT_LAYER);else camera.layers.enable(SPELL_IMPACT_LAYER);
        renderer.render(scene, camera);
        camera.layers.enable(SPELL_IMPACT_LAYER);
        host.dataset.colorDrawCalls=String(renderer.info.render.calls);
        host.dataset.colorTriangles=String(renderer.info.render.triangles);
        host.dataset.loadedModelUrls=JSON.stringify([...instances.values()].map(i=>i.url).sort());
        recordGraphicsFrame(now,!!(animated||atmosphereAnimated||settling||casting.length||spellImpacts.active),loading.size>0);
        const outlineRects:OutlineRect[]=[];
        for(const [id,instance] of instances){
          const token=tokenById.get(id);if(!instance.root.visible||!token?.outline||token.invisible||token.sharedSightOnly)continue;
          const b=instance.outlineBounds;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
          for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
            const p=new Vector3(x,y,z).applyMatrix4(instance.root.matrixWorld).project(camera);
            const sx=(p.x+1)*props.width/2,sy=(p.y+1)*props.height/2;
            minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);
          }
          const x=Math.max(0,Math.floor(minX)-4),y=Math.max(0,Math.floor(minY)-4);
          outlineRects.push({x,y,width:Math.min(props.width,Math.ceil(maxX)+4)-x,height:Math.min(props.height,Math.ceil(maxY)+4)-y});
        }
        host.dataset.outlineMethod='silhouette';host.dataset.outlineShells='0';
        battlefield?.renderMist(renderer,camera);
        archArtLayer.draw(useStore.getState().snapshot?.map?.id,view,props.width,props.height,props.tiltDegrees,props.rotationDegrees??0,
          [...instances.values()].map(i=>({x:i.root.position.x,y:i.root.position.z,visible:i.root.visible})),battlefield?.lighting,!!props.environmentPreview?.heavyDarkness);
        archArtStudy?.draw(useStore.getState().snapshot?.map?.id,view,props.width,props.height,props.tiltDegrees,props.rotationDegrees??0,
          [...instances.values()].map(i=>({x:i.root.position.x,y:i.root.position.z,visible:i.root.visible})),battlefield?.lighting,!!props.environmentPreview?.heavyDarkness);
        if(props.personalVision&&!useComposite)visionLift??=createMiniatureVisionLift(renderer,host,outlineMask.texture);
        timing?.end();visionTiming?.begin();
        // Fog covers ground, never the silhouette of an already visible figure.
        // Its outside rim is not part of the opaque body mask; draw it after fog
        // rather than letting a wall boundary erase heads/shoulders' outlines.
        const foreground=()=>{silhouette.render(renderer,outlineRects);spellImpacts.renderForeground(renderer,camera);};
        visionLift?.render(!!props.personalVision&&!useComposite,foreground);
        // Flashing spells light terrain in sight. Outside magical darkness all
        // of it is visible already, so only heavy darkness needs the reach.
        const flashes=useComposite&&sightFrame?.enabled&&sightFrame.grade?.heavy?impactLights.filter(l=>l.revealsTerrain).map(l=>({source:l,
          polygon:battlefield?.lighting.wallPolygon(l.id)??FLASH_CIRCLE.map(v=>({x:l.x+v.x*spellLightReach(l),y:l.y+v.y*spellLightReach(l)}))})):NO_FLASHES;
        visionComposite?.render(!!props.personalVision&&useComposite,sightFrame,camera,flashes);
        if(!props.personalVision||useComposite){
          silhouette.render(renderer,outlineRects);
          if(deferSpells&&useComposite){
            // Drawn above terrain fog, so clip to the live sight cover here.
            spellImpacts.setCoverClip(sightFrame?.enabled&&visionComposite?visionComposite.cover:null);
            spellImpacts.renderForeground(renderer,camera);
            spellImpacts.setCoverClip(null);
          }
        }
        host.dataset.spellFogPass=deferSpells?(useComposite?'foreground':'legacy-lift'):'scene';
        visionTiming?.end();
        for(const id of sharedIds){const i=instances.get(id);if(i)i.root.visible=visible.has(id);}
        host.dataset.lastRenderedPixelRatio=String(renderer.getPixelRatio());
        host.dataset.renderCount=String(++totalPaintCount);
        // Count distinct browser frames, not extra scene draws within a frame.
        if (_frameTime !== countedFrame) {
          countedFrame = _frameTime; paintCount++;
          host.dataset.frameCount=String(++totalFrameCount);
        }
        if(now-paintEpoch>=1500){host.dataset.renderFps=(paintCount*1000/(now-paintEpoch)).toFixed(1);paintCount=0;paintEpoch=now;}
        if (battlefield) {
          host.dataset.environment=props.environmentPreview?.enabled ? 'on' : 'off';
          host.dataset.shadows=String(!!props.environmentPreview?.enabled && props.environmentPreview.shadows);
          host.dataset.directionalShadow=String(key.castShadow);
          for(const [name,value] of Object.entries(localShadows.state))host.dataset[name]=String(value);
          host.dataset.groundReady=String(battlefield.ready);
          const environment=props.environmentPreview!;
          host.dataset.environmentBounds=JSON.stringify([environment.mapX??0,environment.mapY??0,environment.mapWidth,environment.mapHeight]);
          const mistState=battlefield.mistState;
          for(const [name,value] of Object.entries(battlefield.atmosphereState))host.dataset[name]=String(value);
          host.dataset.mistVisible=String(mistState.visible);
          host.dataset.mistCoverage=mistState.coverage;
          host.dataset.mistHeight=String(mistState.height);
          host.dataset.mistLayers=String(mistState.layers);
          host.dataset.mistShadows=String(mistState.shadows);
          host.dataset.mistForm='volume';
          host.dataset.mistStyle='wisps';
          host.dataset.mistQuality=mistState.quality;
          host.dataset.mistScale=String(mistState.scale);
          host.dataset.mistSteps=String(mistState.steps);
          host.dataset.mistResolution=`${mistState.bufferWidth}x${mistState.bufferHeight}`;
          host.dataset.mistDensityCache=String(mistState.densityCache);
          host.dataset.mistCacheUpdates=String(mistState.cacheUpdates);
          host.dataset.mistCacheResolution=mistState.cacheResolution;
          host.dataset.mistCacheSlices=String(mistState.cacheSlices);
          host.dataset.mistCacheHz=String(mistState.cacheHz);
          host.dataset.mistWakes=String(mistState.wakes);
          host.dataset.mistSpellImpulses=String(mistState.spellImpulses);
          host.dataset.mistSpellEnabled=String(mistState.spellEnabled);
          host.dataset.mistSpellSamples=String(mistState.spellSamples);
          host.dataset.mistSpellUpdateMs=String(mistState.spellUpdateMs);
          host.dataset.mistTime=String(mistState.time);
          host.dataset.mistOldestWakeAge=String(mistState.oldestWakeAge);
          host.dataset.mistBodies=JSON.stringify([...instances].flatMap(([id,instance])=>instance.mistBody?[{id,source:instance.mistBody.source,
            height:instance.mistBody.height*instance.root.scale.x,width:instance.mistBody.radiusX*2*instance.root.scale.x,depth:instance.mistBody.radiusZ*2*instance.root.scale.x}]:[]));
          host.dataset.mistObstacles=String(mistState.obstacles);
          host.dataset.mistInteraction=String(mistState.enabled);
          if(timing){host.dataset.gpuMs=String(timing.median===null?'unavailable':timing.median+(visionTiming?.median??0));host.dataset.gpuSamples=String(timing.count);
            host.dataset.gpuSceneMs=String(timing.median??'unavailable');host.dataset.gpuVisionMs=String(visionTiming?.median??'unavailable');}
        }
        props.onRenderedNames?.(renderedNames);
        host.dataset.nameRendering='per-pixel';host.dataset.nameCount=String(renderedNames.size);
        publish();
      } catch(error) { console.error('Miniature WebGL rendering failed',error); fail(); }
    }
    if (!failed && (localShadows.pending || archArtStudy?.animating || archArtLayer.animating || animated || atmosphereAnimated || settling || casting.length > 0 || spellImpacts.active || [...opacityFades.values()].some(f=>now-f.start<850))) queueDraw();
  };
  const queueDraw = () => {
    if (frame || disposed || failed) return;
    frame = requestBattlefieldFrame(draw);
  };
  const invalidate = () => {
    if (disposed || failed || document.hidden) return;
    // Pointer/camera changes paint on the next frame even when an animated
    // miniature already has a frame pending under the 24fps idle effect cap.
    lastPaint = 0;
    queueDraw();
  };
  const disposeInstance = (instance:Instance) => {
    batches.restore();
    instance.mirrors.dispose();
    const silhouette=instance.movePreviewKey?movePreviewGeometries.get(instance.movePreviewKey):undefined;
    if(silhouette&&--silhouette.users===0){silhouette.geometry.dispose();movePreviewGeometries.delete(instance.movePreviewKey!);}
    host.dataset.previewGeometryAssets=String(movePreviewGeometries.size);
    instance.mixer?.stopAllAction();
    if (instance.mixer) instance.mixer.uncacheRoot(instance.mixer.getRoot());
    scene.remove(instance.root);
    if (battlefield) renderer.shadowMap.needsUpdate = true;
    instance.materials.forEach((material) => material.dispose());
    instance.lightning?.dispose();
    instance.badgeMesh.geometry.dispose();instance.badgeMesh.material.dispose();instance.badgeTexture.dispose();
    instance.hunterMark.material.map?.dispose();instance.hunterMark.material.dispose();
    instance.conditionRings.forEach(ring=>{ring.geometry.dispose();ring.material.dispose();});
    instance.selectionRing.geometry.dispose();
    instance.selectionRing.material.dispose();
    instance.turnRing.geometry.dispose();
    instance.turnRing.material.dispose();
  };
  const removeInstance = (id: string) => {
    if(preview?.id===id)clearPreview();
    const instance = instances.get(id);
    if (!instance) return;
    disposeInstance(instance);
    instances.delete(id);
    bodySlots.delete(id);
    loading.delete(id);
    moves.delete(id);
  };
  const place = (token: MiniatureToken, instance: Instance) => {
    const factor = token.diameter / token.definition.baseDiameter;
    const position = {...(moves.get(token.id) ?? token),...props.visualPosition?.(token.id)};
    const visible=props.isVisibleAt?.(token.id,position.x,position.y) ?? true;
    if(battlefield && (instance.root.visible!==visible || instance.root.scale.x!==factor))renderer.shadowMap.needsUpdate=true;
    instance.root.scale.setScalar(factor);
    const model = instance.root.children[0];
    model.traverse(node=>{
      if(!(node instanceof Mesh)||node.name==='disposition-outline')return;
      node.layers.disable(4);node.layers.disable(5);
      node.layers.enable(token.sharedSightOnly?4:5);
      if(!bodySlots.has(token.id)){
        const used=new Set(bodySlots.values());let slot=1;while(slot<255&&used.has(slot))slot++;
        bodySlots.set(token.id,slot<255?slot:0);
      }
      node.userData.bodySlot=bodySlots.get(token.id);
    });
    model.position.set(...token.definition.baseCenter.map((value) => -value) as [number, number, number]);
    model.updateMatrix();
    if(battlefield && (instance.root.position.x!==position.x || instance.root.position.z!==position.y || instance.root.rotation.y!==(position.facing??0)))renderer.shadowMap.needsUpdate=true;
    instance.hunterMark.visible=!!token.hunterMarked && !token.sharedSightOnly;
    instance.root.visible = visible;
    instance.root.position.set(position.x, 0, position.y);
    instance.root.rotation.y = position.facing ?? 0;
    instance.updateTransform();
    instance.mirrors.update(token.mirrorImages??0,camera,!!token.sharedSightOnly,token.hidden);
        instance.combatBadge.rotation.y=(props.rotationDegrees??0)*Math.PI/180-instance.root.rotation.y;
    instance.combatBadge.visible=!!token.combatRole;
    instance.combatBadge.scale.setScalar(token.definition.baseDiameter);
    instance.badgeMesh.material.opacity=token.hidden ? .45 : 1;
    if(token.combatRole&&instance.badgeRole!==token.combatRole){
      const c=(instance.badgeTexture.image as HTMLCanvasElement).getContext('2d')!;
      c.clearRect(0,0,128,128);c.beginPath();c.arc(64,64,59,0,Math.PI*2);
      c.fillStyle='#0b0d12';c.fill();c.strokeStyle='#fff';c.lineWidth=6;c.stroke();
      c.font='76px "Segoe UI Emoji",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff';
      c.fillText(COMBAT_ROLE_ICON[token.combatRole],64,66);
      instance.badgeTexture.needsUpdate=true;instance.badgeRole=token.combatRole;
    }
    instance.conditionRings.forEach((ring,i)=>{
      const color=token.conditionColors?.[i];ring.visible=!!color;
      if(color)ring.material.color.set(color);
      ring.scale.setScalar(token.definition.baseDiameter);
      ring.material.opacity=token.hidden ? .45 : 1;
    });
    instance.turnRing.visible = !!token.activeTurn;
    instance.selectionRing.visible = !!token.selected;
    instance.selectionRing.scale.setScalar(token.definition.baseDiameter);
    instance.selectionRing.material.opacity = token.hidden ? 0.45 : 1;
    const outlineId=silhouette.slot(token.invisible||token.sharedSightOnly?undefined:token.outline,token.hidden?.45:1);
    const weaponOutlineId=outlineId?silhouette.slot(token.outline,(token.hidden?.45:1)*.25):0;
    model.traverse(node=>{if(node instanceof Mesh)node.userData.outlineId=node.userData.outlineWeapon?weaponOutlineId:outlineId;});
    instance.materials.forEach((material, index) => {
      if (material instanceof MeshStandardMaterial && instance.originalColors[index]) {
        material.color.copy(instance.originalColors[index]!);
        if (token.tint && !material.userData.pewterBase) material.color.multiply(new Color(token.tint));
        if (token.shade && !material.userData.pewterBase) material.color.multiply(new Color(...token.shade));
      }
      const transparent = !!(token.hidden || token.invisible || instance.originalTransparent[index]);
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      const targetOpacity=token.invisible?.28:token.hidden?.45:1;
      const previous=opacityFades.get(token.id);
      if(!previous)opacityFades.set(token.id,{start:performance.now(),from:targetOpacity,to:targetOpacity,value:targetOpacity});
      else if(previous.to!==targetOpacity)opacityFades.set(token.id,{start:performance.now(),from:previous.value,to:targetOpacity,value:previous.value});
      material.opacity = instance.originalOpacity[index]*opacityFades.get(token.id)!.value;
    });
    instance.mirrors.update(token.mirrorImages??0,camera,!!token.sharedSightOnly,token.hidden);
    {
      if(battlefield&&!instance.mistBody)instance.mistBody=instance.measureBody();
      const casts=!!props.environmentPreview?.enabled && props.environmentPreview.shadows && !token.hidden && !token.sharedSightOnly;
      model.traverse(node=>{if(node instanceof Mesh && node.name !== 'disposition-outline'){
        const opaque=(Array.isArray(node.material)?node.material:[node.material]).every(material=>!material.transparent);
        if(node.castShadow !== (casts && opaque))renderer.shadowMap.needsUpdate=true;
        node.castShadow=casts && opaque;node.receiveShadow=casts && opaque;
      }});
    }
  };
  // Warm parsed models and their textures without creating hidden token instances.
  const loadDefinition = (definition: MiniatureDefinition) => {
      if(['druk','varis','vanec'].includes(definition.id))playerAssetUrls.add(definition.url);
      if(definition.url===SPIRITUAL_WEAPON.url){
        if(!assets.has(definition.url)){
          const model=createSpiritualWeapon();
          assets.set(definition.url,Promise.resolve({scene:model,scenes:[model],animations:[],cameras:[],asset:{version:'2.0'},userData:{}} as unknown as GLTF));
        }
        return;
      }
      if (!assets.has(definition.url)) assets.set(definition.url, loader.loadAsync(definition.url).catch(error=>{if(!definition.fallbackUrl)throw error;console.warn('Lighter miniature unavailable; loading original',definition.id);return loader.loadAsync(definition.fallbackUrl);})
        .then(async gltf => {
          try { return await prepareMiniatureBase(gltf, definition, Math.min(8, renderer.capabilities.getMaxAnisotropy())); }
          catch (error) { console.warn('Miniature base texture unavailable', error); return gltf; }
        }).catch(() => { failedAssets.add(definition.url); if (!disposed) invalidate(); return null; }));
      if (definition.fxUrl && !manifests.has(definition.fxUrl)) {
        manifests.set(definition.fxUrl, fetch(definition.fxUrl, { signal: abort.signal })
          .then(async (response) => response.ok ? await response.json() as FxManifest : null).catch(() => null));
      }
  };
  const publishPreloads=()=>{
    const urls=(props.preloadDefinitions??[]).map(d=>miniatureForPreload(d,props.graphics?.modelQuality??'high').url);
    host.dataset.preloadModelCount=String(new Set(urls).size);
    host.dataset.preloadReadyCount=String(new Set(urls.filter(url=>warmedAssets.has(url))).size);
    host.dataset.preloadedModelUrls=JSON.stringify(urls.filter(url=>warmedAssets.has(url)));
  };
  const queuePreloads=(definitions:readonly MiniatureDefinition[])=>{
    const wanted=new Set(definitions.map(d=>d.url));
    for(const url of preloadQueue.keys())if(!wanted.has(url))preloadQueue.delete(url);
    for(const definition of definitions)if(!warmedAssets.has(definition.url)&&!failedAssets.has(definition.url))preloadQueue.set(definition.url,definition);
    publishPreloads();
    const advance=async()=>{
      preloadTimer=undefined;
      if(disposed||failed||preloadRunning)return;
      // Visible figures get first use of the network and decoder. Background
      // work is serial so a crowded map doesn't flood a phone with GLB decodes.
      if(loading.size){preloadTimer=setTimeout(()=>void advance(),100);return;}
      const definition=preloadQueue.values().next().value as MiniatureDefinition|undefined;
      if(!definition)return;
      preloadQueue.delete(definition.url);preloadRunning=true;backgroundAssetUrls.add(definition.url);
      try{
        loadDefinition(definition);
        const asset=await assets.get(definition.url);
        if(asset&&!disposed&&assets.has(definition.url)){
          // Download/parse alone still leaves the first texture upload for the
          // reveal frame. Upload now without adding any figure to the scene.
          const textures=new Set<Texture>();
          asset.scene.traverse(node=>{if(node instanceof Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material]){
            for(const value of Object.values(material))if(value instanceof Texture)textures.add(value);
          }});
          for(const texture of textures)renderer.initTexture(texture);
          warmedAssets.add(definition.url);
        }
      }catch(error){if(!disposed)console.warn('Miniature background preparation failed',error);}
      finally{
        preloadRunning=false;
        if(!disposed){publishPreloads();evictRetiredPlayerAssets();preloadTimer=setTimeout(()=>void advance(),75);}
      }
    };
    if(!preloadRunning&&!preloadTimer&&preloadQueue.size)preloadTimer=setTimeout(()=>void advance(),150);
  };
  const raisedStudy=import.meta.env.VITE_COURTYARD_STUDY==='1'&&new URLSearchParams(location.search).get('raisedWalls')==='1'
    ?createRaisedMapStudy(scene,host,invalidate):null;
  const archArtLayer=createArchArtLayer(renderer,outlineMask.texture,host,invalidate);
  const archArtStudy=import.meta.env.VITE_ARCH_ART_STUDY==='1'&&new URLSearchParams(location.search).get('archArt')==='1'
    ?createArchArtStudy(renderer,outlineMask.texture,host,invalidate):null;
  const activatePrepared=(token:MiniatureToken)=>{
    const instance=preparedInstances.get(token.id);
    if(!instance||instance.url!==token.definition.url)return;
    preparedInstances.delete(token.id);batches.restore();
    const old=instances.get(token.id);
    if(old){
      if(preview?.id===token.id)clearPreview();
      scene.remove(old.root);
      const quality=props.graphics?.modelQuality??'high';
      const pair=miniatureLodPair(quality);
      const allowed=[pair.far,pair.near].map(level=>miniatureForLod(token.definition,level,quality).url);
      const far=miniatureForPreload(token.definition,quality).url;
      if(old.modelId===instance.modelId&&allowed.includes(old.url)&&(old.url===far||old.url===wantedModels.get(token.id)?.url))preparedInstances.set(token.id,old);
      else disposeInstance(old);
    }
    instances.set(token.id,instance);place(token,instance);scene.add(instance.root);
    host.dataset.lodSwapCount=String(Number(host.dataset.lodSwapCount??0)+1);
    if(battlefield)renderer.shadowMap.needsUpdate=true;
    invalidate();
  };
  const planLod=(next:Props)=>{
    updateCamera();lodVisibility.update(camera);
    const onScreenIds:string[]=[],wanted=new Map<string,MiniatureDefinition>(),levels=new Map<string,MiniatureLod>();
    let pending=false;lodTransitions.retain(next.tokens.map(t=>t.id));
    const tokens=next.tokens.map(token=>{
      const c=new Vector3(token.x,0,token.y).project(camera);
      const diameter=Math.max(...[new Vector3(token.x+token.diameter/2,0,token.y),new Vector3(token.x,0,token.y+token.diameter/2)].map(p=>{p.project(camera);return Math.hypot((p.x-c.x)*next.width,(p.y-c.y)*next.height)}));
      const instance=instances.get(token.id);
      const onScreen=!!instance&&(next.isVisibleAt?.(token.id,instance.root.position.x,instance.root.position.z)??instance.root.visible)
        &&lodVisibility.contains(instance.outlineBounds,instance.root.matrixWorld);
      if(onScreen)onScreenIds.push(token.id);
      const quality=next.graphics?.modelQuality??'high';
      const pair=miniatureLodPair(quality),near=miniatureForLod(token.definition,pair.near,quality);
      const desired=miniatureLodForPixels(diameter,quality,lodLevels.get(token.id),onScreen);
      const decision=lodTransitions.resolve(token.id,desired,instance?.url===near.url?pair.near:pair.far,onScreen,performance.now());
      const level=decision.level;pending||=decision.pending;
      levels.set(token.id,level);
      const definition=miniatureForLod(token.definition,level,quality);
      // Keep the same two ready bodies while this figure remains on-screen.
      // Reversing a zoom reuses their buffers/materials instead of decoding and
      // rebuilding them again. Leaving the viewport releases the dense tier.
      const reuse=onScreen&&(wantedModels.get(token.id)?.url===near.url||preparedInstances.get(token.id)?.url===near.url||instance?.url===near.url);
      wanted.set(token.id,miniatureLodShouldPrepare(diameter,quality,onScreen)||reuse?near:definition);
      return {...token,definition};
    });
    return {tokens,wanted,levels,onScreenIds,pending,key:JSON.stringify([tokens.map(t=>[t.id,t.definition.url,wanted.get(t.id)!.url]),onScreenIds])};
  };
  const sync = (next: Props) => {
    if (disposed || failed) return;
    batches.restore();
    sourceProps=next;
    const liveTilt=props.tiltDegrees,liveRotation=props.rotationDegrees;
    props = {...next,tiltDegrees:next.tiltDegrees===committedTilt?liveTilt:next.tiltDegrees,
      rotationDegrees:(next.rotationDegrees??0)===committedRotation?liveRotation:next.rotationDegrees};
    committedTilt=next.tiltDegrees;committedRotation=next.rotationDegrees??0;
    tokenById=new Map(next.tokens.map(t=>[t.id,t]));
    const archSnapshot=useStore.getState().snapshot;archArtLayer.sync(archSnapshot?.map,archSnapshot?.mapImages);
    const marks=next.footprints?.()??[];footprints.sync(marks);host.dataset.footprintCount=String(marks.length);
    raisedStudy?.sync(useStore.getState().snapshot?.map?.id);
    spellImpacts.sync(next.spellImpacts??[],performance.now());
    // Unrelated snapshots during an imperative Konva pan must not restore the
    // last committed camera position before dragend commits the new view.
    if (next.view !== committedView) { view = next.view; committedView = next.view; }
    const pixelRatio = rollBackgroundBudget(Math.min(window.devicePixelRatio || 1, next.graphics?.pixelRatioCap??2),!!next.rollBackground,!!next.rollBackgroundPrepared).pixelRatio;
    host.dataset.rollBackground=next.rollBackground?'reduced':'full';
    host.dataset.backgroundFpsCap=next.rollBackground?'12':'60';
    host.dataset.graphicsQuality=next.graphics?.resolved??'high';
    host.dataset.modelQuality=next.graphics?.modelQuality==='high'?'original':next.graphics?.modelQuality==='balanced'?'balanced':'light';
    host.dataset.modelUrls=JSON.stringify(next.tokens.map(t=>t.definition.url));
    host.dataset.renderPixelRatio=String(pixelRatio);
    host.dataset.backgroundPrepared=String(!!next.rollBackgroundPrepared);
    if (next.width !== renderedWidth || next.height !== renderedHeight || pixelRatio !== renderedPixelRatio) {
      renderedWidth = next.width; renderedHeight = next.height; renderedPixelRatio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(Math.max(1, next.width), Math.max(1, next.height), false);
      renderer.getDrawingBufferSize(outlineResolution.value);
      outlineMask.setSize(outlineResolution.value.x, outlineResolution.value.y);
    }
    if(next.environmentPreview){
      if(!battlefield)battlefield=createBattlefieldEnvironment(scene,renderer,key,next.environmentPreview,{texture:outlineMask.depthTexture!,resolution:outlineResolution.value},localShadows.uniforms,invalidate,ambient);
      else if(lastEnvironment!==next.environmentPreview)battlefield.update(next.environmentPreview);
      lastEnvironment=next.environmentPreview;
    } else if(battlefield){battlefield.dispose();battlefield=null;lastEnvironment=undefined;ambient.intensity=2;
      host.dataset.environment='off';host.dataset.mistVisible='false';host.dataset.shadows='false';host.dataset.mistWakes='0';
      host.dataset.weather='none';host.dataset.weatherCount='0';host.dataset.lighting='off';host.dataset.lightCount='0';
      host.dataset.carriedLanternCount='0';host.dataset.visibleTorchCount='0';host.dataset.carriedLanternPositions='[]';
    }
    const plan=planLod(props);lodDecisionKey=plan.key;
    wantedModels.clear();for(const[id,definition]of plan.wanted)wantedModels.set(id,definition);
    props={...props,tokens:plan.tokens};
    for(const[id,level]of plan.levels)lodLevels.set(id,level);
    next=props;tokenById=new Map(next.tokens.map(t=>[t.id,t]));
    host.dataset.modelLods=JSON.stringify(Object.fromEntries(lodLevels));
    host.dataset.lodOnScreenIds=JSON.stringify(plan.onScreenIds);
    host.dataset.modelUrls=JSON.stringify(next.tokens.map(t=>t.definition.url));
    shaderWarmup.update(camera,scene,`${renderer.shadowMap.enabled}:${key.castShadow}:${!!scene.environment}`);
    for (const [id, url] of loading) {
      if (!next.tokens.some((token) => token.id === id && (token.definition.url === url||wantedModels.get(id)?.url===url))) loading.delete(id);
    }
    for(const[id,instance]of preparedInstances){
      const token=tokenById.get(id),far=token&&miniatureForPreload(token.definition,next.graphics?.modelQuality??'high').url;
      if(!token||token.definition.id!==instance.modelId||![token.definition.url,wantedModels.get(id)?.url,far].includes(instance.url)){
        preparedInstances.delete(id);disposeInstance(instance);
      }
    }
    for (const id of moves.keys()) {
      if (!next.tokens.some((token) => token.id === id) && !next.environmentPreview?.carriedLanterns?.some(t=>t.id===id)) moves.delete(id);
    }
    for(const id of lodLevels.keys())if(!tokenById.has(id))lodLevels.delete(id);
    for (const [id, instance] of instances) {
      const token = tokenById.get(id);
      if (!token || token.definition.id!==instance.modelId) removeInstance(id);
    }
    for (const token of next.tokens) {
      const move = moves.get(token.id);
      // Keep the release position until the authoritative snapshot acknowledges
      // or corrects it. A rejected move returns to its source after a short grace.
      if (move && Number.isFinite(move.until) && (token.x !== move.fromX || token.y !== move.fromY)) moves.delete(token.id);
      activatePrepared(token);
      const existing = instances.get(token.id);
      if (existing) place(token, existing);
      const definition=wantedModels.get(token.id)??token.definition;
      if(existing?.url===definition.url||preparedInstances.get(token.id)?.url===definition.url)continue;
      if (failed || failedAssets.has(definition.url) || loading.get(token.id) === definition.url) continue;
      loading.set(token.id, definition.url);
      loadDefinition(definition);
      void assets.get(definition.url)!.then(async (gltf) => {
        if (disposed || failed || !gltf) {if(loading.get(token.id)===definition.url)loading.delete(token.id);return;}
        const current=tokenById.get(token.id);
        const wanted=()=>tokenById.get(token.id)?.definition.url===definition.url||wantedModels.get(token.id)?.url===definition.url;
        if (!current || !wanted() || instances.get(token.id)?.url===definition.url) return;
        const root = new Group();
        const updateTransform=createMiniatureTransform(root);
        // Animated source transforms remain intact below this base-centering group.
        const centered = new Group();
        const model = gltf.scene.clone(true);
        if(!gltf.animations.length)retainMiniatureLocalTransforms(model);
        centered.matrixAutoUpdate=false;
        let measured=measurements.get(definition.url);
        if(!measured){measured={anchor:measureLanternAnchor(model,definition)};measurements.set(definition.url,measured);}
        const lanternAnchor=measured.anchor.clone(),torchLighting=createMiniatureTorchLighting(localShadows.uniforms);
        const measureBody=()=>measured!.body??(measured!.body=measureMistBody(gltf.scene,definition));
        centered.add(model); root.add(centered);
        // A ground-plane marker in the same depth buffer as the miniature:
        // body, base and weapons occlude its rear arc. It follows live drags
        // through the root group and never participates in pointer input.
        const turnRing = new Mesh(new RingGeometry(0.58, 0.65, 96), new MeshBasicMaterial({
          color: '#ffd21a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
        }));
        turnRing.rotation.x = -Math.PI / 2;
        turnRing.position.y = 0.001;
        turnRing.renderOrder = -1;
        root.add(turnRing);
        const selectionRing = new Mesh(new RingGeometry(0.505, 0.55, 96), new MeshBasicMaterial({
          color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false,
        }));
        selectionRing.name = 'token-selection-ring';
        selectionRing.rotation.x = -Math.PI / 2;
        selectionRing.position.y = 0.002;
        selectionRing.renderOrder = -1;
        root.add(selectionRing);
        // Condition markers share the miniatures' depth buffer, so every
        // foreground body/base occludes them, including neighboring figures.
        const conditionRings=Array.from({length:3},(_,i)=>{
          const radius=.57+i*.075;
          const ring=new Mesh(new RingGeometry(radius-.025,radius+.025,96),new MeshBasicMaterial({transparent:true,depthTest:true,depthWrite:false,toneMapped:false}));
          ring.name='token-condition-ring';ring.rotation.x=-Math.PI/2;
          ring.position.y=.003;ring.renderOrder=-1;root.add(ring);return ring;
        });
        // A camera-facing amber sigil above the measured head, distinct from buff rings.
        const markCanvas=document.createElement('canvas');markCanvas.width=markCanvas.height=128;
        const markContext=markCanvas.getContext('2d')!;
        markContext.strokeStyle='#ffe7a1';markContext.lineWidth=5;markContext.shadowColor='#ffa62b';markContext.shadowBlur=12;
        markContext.beginPath();markContext.moveTo(64,14);markContext.lineTo(104,55);markContext.lineTo(64,98);markContext.lineTo(24,55);markContext.closePath();markContext.fillStyle='#211407';markContext.fill();markContext.stroke();
        markContext.beginPath();markContext.ellipse(64,55,23,12,0,0,Math.PI*2);markContext.stroke();
        markContext.fillStyle='#fff5d2';markContext.beginPath();markContext.arc(64,55,6,0,Math.PI*2);markContext.fill();
        markContext.beginPath();markContext.moveTo(53,106);markContext.lineTo(64,117);markContext.lineTo(75,106);markContext.stroke();
        const hunterMark=new Sprite(new SpriteMaterial({map:new CanvasTexture(markCanvas),transparent:true,depthTest:true,depthWrite:false,toneMapped:false}));
        const headY=new Box3().setFromObject(model).max.y-definition.baseCenter[1];
        hunterMark.name='hunters-mark-sigil';hunterMark.scale.setScalar(definition.baseDiameter*.6);
        hunterMark.position.set(0,headY+definition.baseDiameter*.42,0);hunterMark.visible=false;root.add(hunterMark);
        const badgeCanvas=document.createElement('canvas');badgeCanvas.width=badgeCanvas.height=128;
        const badgeTexture=new CanvasTexture(badgeCanvas);
        const badgeMesh=new Mesh(new PlaneGeometry(.44,.44),new MeshBasicMaterial({map:badgeTexture,transparent:true,depthTest:true,depthWrite:false,toneMapped:false}));
        badgeMesh.rotation.x=-Math.PI/2;badgeMesh.position.set(-.5,.004,.5);badgeMesh.renderOrder=-1;
        badgeMesh.name='token-combat-role-ground';
        const combatBadge=new Group();combatBadge.add(badgeMesh);root.add(combatBadge);
        const cloned = new Map<Material, Material>();
        model.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          const copy = (material: Material) => {
            if (!cloned.has(material)) {
              const copy = material.clone();
              copy.userData.batchSource=material.uuid;
              // Generated color-only atlases omit metallicFactor; glTF defaults
              // that omission to 1 (solid metal), even for skin and cloth. Give
              // those atlases a diffuse response to local light. Preserve every
              // explicitly authored metal factor and metallic/roughness map.
              const sourceIndex=gltf.parser?.associations.get(material)?.materials;
              const pbr=sourceIndex===undefined?undefined:gltf.parser.json.materials?.[sourceIndex]?.pbrMetallicRoughness;
              if(copy instanceof MeshStandardMaterial && pbr && pbr.metallicFactor===undefined && !pbr.metallicRoughnessTexture)copy.metalness=0;
              torchLighting.attach(copy);
              cloned.set(material, copy);
            }
            return cloned.get(material)!;
          };
          node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
        });
        model.traverse(node=>{if(node instanceof Mesh){node.userData.outlineWeapon=isMiniatureWeaponPart(node.name);if((Array.isArray(node.material)?node.material:[node.material]).every(m=>!m.transparent))node.layers.enable(1);}});
        const mixer = gltf.animations.length ? new AnimationMixer(model) : null;
        gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
        const materials = [...cloned.values()];
        const outlineBounds=centeredMiniatureOutlineBounds(model,definition.baseCenter);
        const instance: Instance = {
          modelId:definition.id,
          mirrors:createMirrorImages(centered,root,renderer,()=>scene.environment,definition.baseDiameter),
          baseDiameter:definition.baseDiameter,outlineBounds,lanternAnchor,torchLighting,
          root, updateTransform, turnRing, selectionRing, conditionRings, hunterMark, combatBadge, badgeMesh, badgeTexture, url: definition.url, materials,
          originalColors: materials.map(m => m instanceof MeshStandardMaterial ? m.color.clone() : null),
          originalOpacity: materials.map((material) => material.opacity),
          originalTransparent: materials.map((material) => material.transparent), mixer, fx: null,
          // Emissive/material flicker does not change the ground silhouette.
          shadowAnimated: gltf.animations.some(clip => clip.tracks.some(track => /\.(position|quaternion|scale|morphTargetInfluences)(\[|$)/.test(track.name))),
          measureBody,
          mistBody:props.environmentPreview?measureBody():undefined,
          lightning: definition.id === 'vanec' ? createVanecLightning(model) : null,
        };
        place(current, instance);
        // The same coarse planning silhouette serves both detail tiers. Never
        // bake millions of dense triangle corners during a camera zoom.
        instance.movePreviewKey=JSON.stringify([miniatureForPreload(definition,props.graphics?.modelQuality??'high').url,definition.baseCenter]);
        let silhouette=movePreviewGeometries.get(instance.movePreviewKey);
        if(!silhouette){silhouette={geometry:createMiniatureMovePreviewGeometry(centered),users:0};movePreviewGeometries.set(instance.movePreviewKey,silhouette);}
        silhouette.users++;instance.movePreviewGeometry=silhouette.geometry;
        host.dataset.previewGeometryAssets=String(movePreviewGeometries.size);
        // First-use shader linking was blocking the movement frame for hundreds
        // of milliseconds. Compile against the real lighting before drawing the
        // new body; KHR_parallel_shader_compile lets existing figures keep moving.
        try { await renderer.compileAsync(root,camera,scene); }
        catch(error) {console.warn('Miniature shader preparation failed',error);}
        try{if(instances.has(token.id))await warmMiniatureGpuBuffers(renderer,root,camera,scene,()=>disposed||failed||!wanted());}
        catch(error){console.warn('Miniature buffer preparation failed',error);}
        const latest=tokenById.get(token.id);
        if(disposed||failed||!latest||!wanted()||instances.get(token.id)?.url===definition.url) {disposeInstance(instance);return;}
        loading.delete(token.id);
        const oldPrepared=preparedInstances.get(token.id);
        if(oldPrepared)disposeInstance(oldPrepared);
        preparedInstances.set(token.id,instance);
        activatePrepared(latest);
        evictRetiredPlayerAssets();
        if(battlefield)renderer.shadowMap.needsUpdate=true;
        invalidate();
        scheduleLod();
        const fx = definition.fxUrl ? await manifests.get(definition.fxUrl) : null;
        if (!disposed && (instances.get(token.id) === instance||preparedInstances.get(token.id)===instance) && fx && Array.isArray(fx.keyframes) && fx.material_channels) {
          instance.fx = fx;
          applyFx(instance, 0);
          invalidate();
        }
      });
    }
    queuePreloads((next.preloadDefinitions??[]).map(d=>miniatureForPreload(d,next.graphics?.modelQuality??'high')));
    evictRetiredPlayerAssets();
    invalidate();
    if(plan.pending)scheduleLod();
  };
  const contextLost = (event: Event) => { event.preventDefault(); fail(); };
  const visibility = () => { invalidate(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    batches.dispose();
    if(lodTimer)clearTimeout(lodTimer);
    if(preloadTimer)clearTimeout(preloadTimer);
    preloadQueue.clear();
    abort.abort();
    cancelBattlefieldFrame(frame);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    document.removeEventListener('visibilitychange', visibility);
    reducedMotion.removeEventListener('change', invalidate);
    [...instances.keys()].forEach(removeInstance);
    preparedInstances.forEach(disposeInstance);preparedInstances.clear();wantedModels.clear();
    assets.forEach((promise) => { void promise.then((asset) => { if (asset) disposeAsset(asset); }); });
    assets.clear(); manifests.clear(); loading.clear(); moves.clear();
    shaderWarmup.dispose();
    raisedStudy?.dispose();
    archArtStudy?.dispose();
    archArtLayer.dispose();
    spellImpacts.dispose();spellColor.dispose();spellFogTexture?.dispose();
    footprints.dispose();
    clearPreview();previewMaterial.dispose();
    names.dispose();props.onRenderedNames?.(new Set());
    sharedCanvas.remove();sharedDepth.dispose();visionLift?.dispose();visionComposite?.dispose();
    battlefield?.dispose();battlefield=null;
    localShadows.dispose();
    timing?.dispose();
    visionTiming?.dispose();
    silhouette.dispose();outlineMask.dispose(); maskMaterial.dispose();
    environment?.dispose();
    scene.environment = null;
    renderer.dispose();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibility);
  reducedMotion.addEventListener('change', invalidate);
  // Throttle rather than debounce: a continuous wheel/pinch gesture must not
  // postpone preparation until the user has already finished zooming. Full
  // scene sync is only needed when the display/preparation decision changes.
  const scheduleLod=()=>{if(lodTimer)return;lodTimer=setTimeout(()=>{
    lodTimer=undefined;if(disposed||failed)return;
    const plan=planLod(sourceProps);
    if(plan.key!==lodDecisionKey)sync(sourceProps);
    if(plan.pending)scheduleLod();
  },80);};
  sync(initial);
  return {
    sync,
    headPosition(id){
      const instance=instances.get(id);
      if(disposed||!instance?.root.visible)return undefined;
      // The existing mark anchor is measured above the model, including its base scale.
      const point=instance.root.localToWorld(instance.hunterMark.position.clone()).project(camera);
      return {x:(point.x+1)*props.width/2,y:(1-point.y)*props.height/2};
    },
    setFootprints(marks){if(disposed)return;footprints.sync(marks);host.dataset.footprintCount=String(marks.length);invalidate();},
    spellCast(tokenIds) {
      if (disposed || document.hidden) return;
      for (const id of tokenIds) instances.get(id)?.lightning?.cast(performance.now() / 1000);
      invalidate();
    },
    setProjection(tilt, rotation, nextView) {
      if(disposed || failed)return;
      props={...props,tiltDegrees:tilt,rotationDegrees:rotation};view=nextView;
      // The shared frame applies all camera/vision transforms before its one
      // scene paint, including an effects render queued before this gesture.
      updateCamera();invalidate();
      host.dataset.tiltDegrees=String(tilt);scheduleLod();
    },
    setView(next) { if (disposed||failed) return; view = next; scheduleLod();updateCamera();invalidate(); },
    previewMove(id, point) {
      if(disposed)return;
      if(!point){if(preview?.id===id)clearPreview();invalidate();return;}
      const instance=instances.get(id);
      if(!instance?.movePreviewGeometry)return;
      if(preview?.id!==id){
        clearPreview();
        const root=new Group();
        root.add(new Mesh(instance.movePreviewGeometry,previewMaterial));
        preview={id,root};scene.add(root);host.dataset.previewTokenId=id;
        host.dataset.previewDrawCalls='1';
      }
      preview!.root.scale.copy(instance.root.scale);
      preview!.root.position.set(point.x,0,point.y);
      preview!.root.rotation.y=point.facing;
      preview!.root.visible=props.isVisibleAt?.(id,point.x,point.y)??true;
      invalidate();
    },
    moveToken(id, x, y, finished, facing) {
      if (disposed) return;
      const token = tokenById.get(id)??props.environmentPreview?.carriedLanterns?.find(t=>t.id===id);
      if (!token) return;
      if(finished)scheduleLod();
      if(finished && facing!==undefined && x===token.x && y===token.y){
        moves.delete(id);invalidate();return;
      }
      moves.set(id, { x, y, facing: facing ?? facingAfterMove(token.x, token.y, x, y, token.facing),
        fromX: token.x, fromY: token.y, until: finished ? performance.now() + 1500 : Infinity });
      invalidate();
    },
    dispose,
  };
}

export const MiniatureLayer = forwardRef<MiniatureLayerHandle, Props>(function MiniatureLayer(incoming, ref) {
  const {budget}=useEnvironmentQuality();
  const props={...incoming,graphics:incoming.graphics??budget};
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [state, setState] = useState({ ids: [] as string[], status: 'loading' });
  const needsScene = props.tokens.length > 0 || !!props.preloadDefinitions?.length || !!props.environmentPreview || !!props.spellImpacts?.length;
  const socket = useStore(state => state.socket);
  useEffect(() => {
    const cast = ({ tokenIds }: { tokenIds: string[] }) => engine.current?.spellCast(tokenIds);
    socket?.on('fx:spellCast', cast);
    return () => { socket?.off('fx:spellCast', cast); };
  }, [socket]);
  useImperativeHandle(ref, () => ({
    headPosition: (id) => engine.current?.headPosition(id),
    setFootprints: (marks) => engine.current?.setFootprints(marks),
    spellCast: (tokenIds) => engine.current?.spellCast(tokenIds),
    setView: (view) => engine.current?.setView(view),
    setProjection: (tilt,rotation,view) => engine.current?.setProjection(tilt,rotation,view),
    moveToken: (id, x, y, finished, facing) => engine.current?.moveToken(id, x, y, finished, facing),
    previewMove: (id,point) => engine.current?.previewMove(id,point),
  }), []);
  useEffect(() => {
    if (!needsScene) {
      setState({ ids: [], status: 'idle' });
      latest.current.onReady(new Set());
      return;
    }
    try {
      engine.current = createEngine(host.current!, latest.current, (ids, status) => setState({ ids, status }));
    } catch {
      host.current?.replaceChildren();
      setState({ ids: [], status: 'unavailable' });
      latest.current.onUnavailable?.();
      latest.current.onReady(new Set());
    }
    return () => { engine.current?.dispose(); engine.current = null; };
  }, [needsScene]);
  useEffect(() => { engine.current?.sync(props); }, [props]);
  return <div ref={host} className="miniature-layer" aria-hidden="true"
    data-testid="miniature-layer" data-miniature-count={state.ids.length}
    data-invisible-miniature-count={state.ids.filter(id=>props.tokens.find(t=>t.id===id)?.invisible).length}
    data-personal-miniature-count={state.ids.filter(id=>!props.tokens.find(t=>t.id===id)?.sharedSightOnly).length}
    data-miniature-ids={state.ids.join(',')} data-miniature-status={state.status}
    data-tilt-degrees={props.tiltDegrees} />;
});
