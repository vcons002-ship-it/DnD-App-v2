import {NEUTRAL_MINIATURE_LIGHTING} from './miniatureLightingDefaults';
import {COMBAT_ROLE_ICON} from '../../../shared/combatRole';
import type {CombatRole} from '../../../shared/types';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AlwaysStencilFunc, NotEqualStencilFunc, ReplaceStencilOp, KeepStencilOp, BackSide, Vector2, Color, AnimationMixer, ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight,
  Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, RingGeometry,
  CanvasTexture, PlaneGeometry, Scene, Texture, DepthTexture, Matrix4, Vector3, WebGLRenderer, PerspectiveCamera, WebGLRenderTarget,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { MiniatureDefinition } from '../lib/miniatures';
import { facingAfterMove } from '../../../shared/tokenFacing';
import { createMiniatureNameLayer } from './miniatureNameLayer';
import { createMiniatureVisibilityMaterial, createMiniatureVisionLift } from './miniatureVisionLift';
import type { MiniatureNameLabel } from './miniatureNameLabels';
import { prepareMiniatureBase } from './miniatureBaseMaterial';
import { createBattlefieldEnvironment, type EnvironmentPreviewSettings } from './battlefieldEnvironment';
import {createPreviewGpuTiming} from './previewGpuTiming';
import {measureMistBody,mistBodyInMap,type MistBody} from './miniatureMistBody';
import { createVanecLightning } from './vanecLightning';
import {createMiniatureTorchLighting,measureLanternAnchor} from './miniatureTorchLighting';
import {createMiniatureShaderWarmup} from './miniatureShaderWarmup';
import {createLocalLightShadows} from './localLightShadows';
import { useStore } from '../state/socket';
import {
  miniatureCameraTarget,
  perspectiveDistance,
  type BattlefieldView,
} from './miniatureProjection';

export type MiniatureToken = {
  sharedSightOnly?: boolean;
  id: string; x: number; y: number; diameter: number; hidden: boolean;
  facing?: number;
  carriedLantern?: boolean;
  tint?: string;
  outline?: string;
  shade?: [number, number, number];
  activeTurn?: boolean;
  selected?: boolean;
  conditionColors?: string[];
  combatRole?: CombatRole | null;
  definition: MiniatureDefinition;
};
type Props = {
  memoryTerrainCanvas?: ()=>HTMLCanvasElement|null;
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
  /** Shared renderer settings; the app uses a transparent ground overlay. */
  environmentPreview?: EnvironmentPreviewSettings;
};
export type MiniatureLayerHandle = {
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
  baseDiameter:number;
  lanternAnchor:Vector3;
  torchLighting:ReturnType<typeof createMiniatureTorchLighting>;
  measureBody: () => MistBody;
  root: Group;
  outlineMaterial: MeshBasicMaterial;
  outlineViewport: { value: Vector2 };
  turnRing: Mesh<RingGeometry, MeshBasicMaterial>;
  selectionRing: Mesh<RingGeometry, MeshBasicMaterial>;
  conditionRings: Mesh<RingGeometry, MeshBasicMaterial>[];
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
const CARRIED_LIGHT_HEIGHT_FT=9;

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
  const localShadows=createLocalLightShadows(renderer);
  // Shared screen mask measures local silhouette thickness for every model,
  // including weapons merged into a body mesh. Layer 1 contains opaque bodies only.
  const outlineMask = new WebGLRenderTarget(1, 1);
  outlineMask.depthTexture = new DepthTexture(1, 1);
  const outlineProjectionInverse = {value: new Matrix4()};
  const maskMaterial = createMiniatureVisibilityMaterial();
  const outlineResolution = {value: new Vector2(1, 1)};

  const names=createMiniatureNameLayer(scene,outlineMask.depthTexture,outlineResolution);
  const visionLift=createMiniatureVisionLift(renderer,host,outlineMask.texture);
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
    sharedCanvas.remove();sharedDepth.dispose();names.dispose();visionLift.dispose();
    outlineMask.dispose(); maskMaterial.dispose();
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
  const shaderWarmup=createMiniatureShaderWarmup(renderer,createMiniatureTorchLighting(localShadows.uniforms));
  const loading = new Map<string, string>();
  const moves = new Map<string, { x: number; y: number; facing: number; fromX: number; fromY: number; until: number }>();
  // One local planning figure; geometry is shared with the loaded model. It has
  // no effects, shadows, labels, hit region or network representation.
  let preview: {id:string;root:Group} | null = null;
  const previewMaterial = new MeshStandardMaterial({color: '#83aab6', transparent:true, opacity:.3,
    roughness:.9, metalness:0, depthWrite:false});
  const clearPreview = () => {
    if(preview)scene.remove(preview.root);
    preview=null;delete host.dataset.previewTokenId;
  };
  const abort = new AbortController();
  let props = initial;
  let view = initial.view;
  let committedView = initial.view;
  let disposed = false;
  let failed = false;
  let frame = 0;
  let frameQueued = false;
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
  let totalPaintCount = 0;
  const timing=initial.environmentPreview&&new URLSearchParams(location.search).has('benchmark')?createPreviewGpuTiming(renderer.getContext()):null;
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
  };
  const publish = () => {
    const failedIds = props.tokens.filter(t => failedAssets.has(t.definition.url)).map(t => t.id).sort();
    if (failedIds.join("|") !== lastFailedIds) {
      lastFailedIds = failedIds.join("|");
      props.onFailed?.(new Set(failedIds));
    }
    const ids = failed ? [] : props.tokens.filter((token) => instances.get(token.id)?.url === token.definition.url).map((token) => token.id).sort();
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
    cancelAnimationFrame(frame);
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
    const atmosphereAnimated = !!environment?.enabled && environment.mistQuality!=='off' && !reducedMotion.matches &&
      ((environment.particles&&environment.particles!=='none'&&(environment.particleIntensity??.5)>0) || (environment.groundWetness??0)>0 || environment.lightning || environment.mist || (!!environment.weather && environment.weather!=='none' && (environment.weatherIntensity??.5)>0) || !!environment.lights?.some(light=>light.flicker) || !!environment.carriedLanterns?.length || props.tokens.some(t=>t.carriedLantern));
    const animated = !reducedMotion.matches && [...instances.values()].some((instance) => instance.mixer || instance.fx || instance.turnRing.visible || instance.selectionRing.visible);
    const settling = [...moves.values()].some((move) => Number.isFinite(move.until));
    const casting = [...instances.entries()].filter(([, instance]) => instance.lightning?.active(now / 1000));
    host.dataset.castingTokenIds = casting.map(([id]) => id).join(',');
    // Paint the preference change even inside the frame cap: this may be the
    // last frame once animation stops, so no flash or moving effect may linger.
    if (paintedReducedMotion !== reducedMotion.matches || now - lastPaint >= (props.environmentPreview ? 1000 / 60 - 1 : 1000 / 24)) {
      paintedReducedMotion = reducedMotion.matches;
      lastPaint = now;
      const seconds = (now - started) / 1000;
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
      battlefield?.setTokens(props.tokens.map(token => {
        const instance=instances.get(token.id);
        const x=instance?.root.position.x??token.x,y=instance?.root.position.z??token.y;
        const body=instance?.mistBody?mistBodyInMap(instance.mistBody,x,y,instance.root.rotation.y,instance.root.scale.x):undefined;
        return {id:token.id,x,y,diameter:token.diameter,body,visible:!!instance?.root.visible && !token.hidden && !token.sharedSightOnly};
      }));
      if(battlefield){
        const ppf=props.environmentPreview?.pixelsPerFoot??12.8;
        const carriers=new Map((props.environmentPreview?.carriedLanterns??[]).map(t=>[t.id,t]));
        for(const token of props.tokens)if(token.carriedLantern&&!token.hidden)carriers.set(token.id,{...token,facing:token.facing??0});
        battlefield.lighting.setCarried([...carriers.values()].flatMap(token=>{
          const instance=instances.get(token.id),move=moves.get(token.id);
          const x=instance?.root.position.x??move?.x??token.x,y=instance?.root.position.z??move?.y??token.y;
          if(!(props.isVisibleAt?.(token.id,x,y)??true))return [];
          if(instance){
            const belt=instance.root.localToWorld(instance.lanternAnchor.clone()),facing=instance.root.rotation.y;
            return [{id:token.id,x:belt.x-Math.cos(facing)*ppf*.34+Math.sin(facing)*ppf*.08,y:belt.z+Math.sin(facing)*ppf*.34+Math.cos(facing)*ppf*.08,height:ppf*CARRIED_LIGHT_HEIGHT_FT,fixtureHeight:belt.y-ppf*.52,facing}];
          }
          const facing=move?.facing??token.facing,dx=-token.diameter*.30,dz=token.diameter*.10;
          return [{id:token.id,x:x+dx*Math.cos(facing)+dz*Math.sin(facing),y:y-dx*Math.sin(facing)+dz*Math.cos(facing),height:ppf*CARRIED_LIGHT_HEIGHT_FT,fixtureHeight:ppf*2.8,facing}];
        }));
        battlefield.tick(reducedMotion.matches?0:seconds);
        props.onVisionLights?.(battlefield.lighting.lights);
      }
      try {
        timing?.begin();
        localShadows.render(renderer,scene,camera,battlefield?.lighting.lights??[],[...instances].map(([id,i])=>({id,root:i.root,diameter:i.baseDiameter*i.root.scale.x,x:i.root.position.x,y:i.root.position.z,visible:i.root.visible&&!props.tokens.find(t=>t.id===id)?.sharedSightOnly,animated:animated&&i.shadowAnimated})),props.environmentPreview?.walls??[],!!environment?.enabled&&environment.shadows,environment?.shadowLength??1.3);
        for(const instance of instances.values())instance.torchLighting.update(battlefield?.lighting.lights??[],instance.root,camera,!!props.environmentPreview?.darkvisionTerrain,props.environmentPreview?.walls);
        battlefield?.lighting.renderField(renderer);
        const visible=new Set([...instances].filter(([,instance])=>instance.root.visible).map(([id])=>id));
        const sharedIds=new Set(props.tokens.filter(t=>t.sharedSightOnly).map(t=>t.id));
        const labels=props.nameLabels?.()??[];
        const renderedNames=names.sync(labels,visible,sharedIds);
        if (props.personalVision || battlefield || renderedNames.size || props.tokens.some(token => token.outline)) {
          const originalLayers = camera.layers.mask;
          camera.layers.set(1); scene.overrideMaterial = maskMaterial;
          const shadowUpdate = renderer.shadowMap.needsUpdate;
          renderer.shadowMap.needsUpdate = false;
          renderer.setRenderTarget(outlineMask); renderer.clear(); renderer.render(scene, camera);
          renderer.shadowMap.needsUpdate = shadowUpdate;
          scene.overrideMaterial = null; camera.layers.mask = originalLayers;
          renderer.setRenderTarget(null);
        }
        // Shared figures cannot cast shadows or light the viewer's actual map.
        // A depth-only pass of personal figures preserves overlap ordering.
        const sw=renderer.domElement.width,sh=renderer.domElement.height;
        if(sharedCanvas.width!==sw||sharedCanvas.height!==sh){sharedCanvas.width=sw;sharedCanvas.height=sh;}
        sharedCanvas.dataset.tokenIds=[...sharedIds].filter(id=>visible.has(id)).join(',');
        sharedCanvas.style.display=sharedCanvas.dataset.tokenIds?'block':'none';
        // Static awareness need not redraw for weather or torch flicker. Camera,
        // pose, name, appearance and foreground occlusion changes invalidate it.
        const sharedKey=JSON.stringify([sw,sh,camera.projectionMatrix.elements,camera.matrixWorld.elements,
          environment?.heavyDarkness,ambient.intensity,key.intensity,scene.environmentIntensity,ambient.color.toArray(),key.color.toArray(),
          props.tokens.map(t=>{const i=instances.get(t.id);return [t.id,t.sharedSightOnly,t.tint,t.shade,i?.root.visible,i?.root.position.toArray(),i?.root.rotation.y,i?.root.scale.x];}),
          labels.map(l=>{if(!labelVersions.has(l.canvas))labelVersions.set(l.canvas,++nextLabelVersion);return [l.id,labelVersions.get(l.canvas),l.points,l.opacity];})]);
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
            if(!environment?.heavyDarkness){
              ambient.intensity=NEUTRAL_MINIATURE_LIGHTING.ambient;key.intensity=NEUTRAL_MINIATURE_LIGHTING.key;
              scene.environmentIntensity=NEUTRAL_MINIATURE_LIGHTING.reflection;
            }
            for(const id of sharedIds){const i=instances.get(id);if(i)i.torchLighting.update([],i.root,camera,!!environment?.darkvisionTerrain,[]);}
            renderer.render(scene,camera);
            sharedContext.drawImage(renderer.domElement,0,0);
            camera.layers.mask=layers;renderer.autoClear=autoClear;
            ambient.intensity=ambientIntensity;key.intensity=keyIntensity;scene.environmentIntensity=reflection;
            renderer.shadowMap.needsUpdate=shadowUpdate;
          }
        }
        for(const id of sharedIds){const i=instances.get(id);if(i)i.root.visible=false;}
        battlefield?.renderMemory(renderer,camera,props.memoryTerrainCanvas?.()??null);
        renderer.render(scene, camera);
        battlefield?.renderMist(renderer,camera);
        visionLift.render(!!props.personalVision);
        for(const id of sharedIds){const i=instances.get(id);if(i)i.root.visible=visible.has(id);}
        timing?.end();
        if (battlefield) {
          paintCount++;
          host.dataset.renderCount=String(++totalPaintCount);
          if(now-paintEpoch>=1500){host.dataset.renderFps=(paintCount*1000/(now-paintEpoch)).toFixed(1);paintCount=0;paintEpoch=now;}
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
          host.dataset.mistWakes=String(mistState.wakes);
          host.dataset.mistTime=String(mistState.time);
          host.dataset.mistOldestWakeAge=String(mistState.oldestWakeAge);
          host.dataset.mistBodies=JSON.stringify([...instances].flatMap(([id,instance])=>instance.mistBody?[{id,source:instance.mistBody.source,
            height:instance.mistBody.height*instance.root.scale.x,width:instance.mistBody.radiusX*2*instance.root.scale.x,depth:instance.mistBody.radiusZ*2*instance.root.scale.x}]:[]));
          host.dataset.mistObstacles=String(mistState.obstacles);
          host.dataset.mistInteraction=String(mistState.enabled);
          if(timing){host.dataset.gpuMs=String(timing.median??'unavailable');host.dataset.gpuSamples=String(timing.count);}
        }
        props.onRenderedNames?.(renderedNames);
        host.dataset.nameRendering='per-pixel';host.dataset.nameCount=String(renderedNames.size);
        publish();
      } catch(error) { console.error('Miniature WebGL rendering failed',error); fail(); }
    }
    if (!failed && (animated || atmosphereAnimated || settling || casting.length > 0)) queueDraw();
  };
  const queueDraw = () => {
    if (frame || frameQueued || disposed || failed) return;
    frameQueued = true;
    // Let an enclosing camera-animation callback queue its next update first.
    // That update can then cancel this fallback and paint the final camera and
    // token positions once, instead of painting the old view and then the new.
    queueMicrotask(() => {
      frameQueued = false;
      if (!frame && !disposed && !failed) frame = requestAnimationFrame(draw);
    });
  };
  const invalidate = () => {
    if (disposed || failed || document.hidden) return;
    // Pointer/camera changes paint on the next frame even when an animated
    // miniature already has a frame pending under the 24fps idle effect cap.
    lastPaint = 0;
    queueDraw();
  };
  const disposeInstance = (instance:Instance) => {
    instance.mixer?.stopAllAction();
    if (instance.mixer) instance.mixer.uncacheRoot(instance.mixer.getRoot());
    scene.remove(instance.root);
    if (battlefield) renderer.shadowMap.needsUpdate = true;
    instance.materials.forEach((material) => material.dispose());
    instance.lightning?.dispose();
    instance.outlineMaterial.dispose();
    instance.badgeMesh.geometry.dispose();instance.badgeMesh.material.dispose();instance.badgeTexture.dispose();
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
    });
    model.position.set(...token.definition.baseCenter.map((value) => -value) as [number, number, number]);
    if(battlefield && (instance.root.position.x!==position.x || instance.root.position.z!==position.y || instance.root.rotation.y!==(position.facing??0)))renderer.shadowMap.needsUpdate=true;
    instance.root.visible = visible;
    instance.root.position.set(position.x, 0, position.y);
    instance.root.rotation.y = position.facing ?? 0;
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
    instance.outlineMaterial.visible = !!token.outline;
    instance.outlineMaterial.color.set(token.outline ?? "#000000");
    instance.outlineMaterial.opacity = token.hidden ? 0.45 : 1;
    instance.outlineViewport.value.set(Math.max(1, props.width), Math.max(1, props.height));
    instance.materials.forEach((material, index) => {
      if (material instanceof MeshStandardMaterial && instance.originalColors[index]) {
        material.color.copy(instance.originalColors[index]!);
        if (token.tint && !material.userData.pewterBase) material.color.multiply(new Color(token.tint));
        if (token.shade && !material.userData.pewterBase) material.color.multiply(new Color(...token.shade));
      }
      const transparent = token.hidden || instance.originalTransparent[index];
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = instance.originalOpacity[index] * (token.hidden ? 0.45 : 1);
    });
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
      if (!assets.has(definition.url)) assets.set(definition.url, loader.loadAsync(definition.url)
        .then(async gltf => {
          try { return await prepareMiniatureBase(gltf, definition, Math.min(8, renderer.capabilities.getMaxAnisotropy())); }
          catch (error) { console.warn('Miniature base texture unavailable', error); return gltf; }
        }).catch(() => { failedAssets.add(definition.url); if (!disposed) invalidate(); return null; }));
      if (definition.fxUrl && !manifests.has(definition.fxUrl)) {
        manifests.set(definition.fxUrl, fetch(definition.fxUrl, { signal: abort.signal })
          .then(async (response) => response.ok ? await response.json() as FxManifest : null).catch(() => null));
      }
  };
  const sync = (next: Props) => {
    if (disposed || failed) return;
    props = next;
    // Unrelated snapshots during an imperative Konva pan must not restore the
    // last committed camera position before dragend commits the new view.
    if (next.view !== committedView) { view = next.view; committedView = next.view; }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
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
    updateCamera();
    shaderWarmup.update(camera,scene,`${renderer.shadowMap.enabled}:${key.castShadow}:${!!scene.environment}`);
    for (const [id, url] of loading) {
      if (!next.tokens.some((token) => token.id === id && token.definition.url === url)) loading.delete(id);
    }
    for (const id of moves.keys()) {
      if (!next.tokens.some((token) => token.id === id) && !next.environmentPreview?.carriedLanterns?.some(t=>t.id===id)) moves.delete(id);
    }
    for (const [id, instance] of instances) {
      const token = next.tokens.find((item) => item.id === id);
      if (!token || token.definition.url !== instance.url) removeInstance(id);
    }
    for (const token of next.tokens) {
      const move = moves.get(token.id);
      // Keep the release position until the authoritative snapshot acknowledges
      // or corrects it. A rejected move returns to its source after a short grace.
      if (move && Number.isFinite(move.until) && (token.x !== move.fromX || token.y !== move.fromY)) moves.delete(token.id);
      const existing = instances.get(token.id);
      if (existing) { place(token, existing); continue; }
      if (failed || loading.get(token.id) === token.definition.url) continue;
      loading.set(token.id, token.definition.url);
      const definition = token.definition;
      loadDefinition(definition);
      void assets.get(definition.url)!.then(async (gltf) => {
        if (disposed || failed || !gltf) return;
        const current = props.tokens.find((item) => item.id === token.id && item.definition.url === definition.url);
        if (!current || instances.has(token.id)) return;
        const root = new Group();
        // Animated source transforms remain intact below this base-centering group.
        const centered = new Group();
        const model = gltf.scene.clone(true);
        const lanternAnchor=measureLanternAnchor(model,definition),torchLighting=createMiniatureTorchLighting(localShadows.uniforms);
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
              // Generated color-only atlases omit metallicFactor; glTF defaults
              // that omission to 1 (solid metal), even for skin and cloth. Give
              // those atlases a diffuse response to local light. Preserve every
              // explicitly authored metal factor and metallic/roughness map.
              const sourceIndex=gltf.parser.associations.get(material)?.materials;
              const pbr=sourceIndex===undefined?undefined:gltf.parser.json.materials?.[sourceIndex]?.pbrMetallicRoughness;
              if(copy instanceof MeshStandardMaterial && pbr && pbr.metallicFactor===undefined && !pbr.metallicRoughnessTexture)copy.metalness=0;
              torchLighting.attach(copy);
              // Mark the complete visible figure, not individual mesh boundaries.
              // All bodies mask outlines so overlapping tokens also stay clean.
              copy.stencilWrite = true;
              copy.stencilRef = 1;
              copy.stencilFunc = AlwaysStencilFunc;
              copy.stencilZPass = ReplaceStencilOp;
              cloned.set(material, copy);
            }
            return cloned.get(material)!;
          };
          node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
        });
        // Screen-space back-face shells share geometry and follow source transforms.
        const outlineViewport = { value: new Vector2(props.width, props.height) };
        const outlineMaterial = new MeshBasicMaterial({
          side: BackSide, depthWrite: false, transparent: true, toneMapped: false,
          stencilWrite: true, stencilRef: 1, stencilFunc: NotEqualStencilFunc,
          stencilFail: KeepStencilOp, stencilZFail: KeepStencilOp, stencilZPass: KeepStencilOp,
        });
        outlineMaterial.onBeforeCompile = shader => {
          shader.uniforms.outlineViewport = outlineViewport;
          shader.uniforms.outlineMask = {value: outlineMask.texture};
          shader.uniforms.outlineResolution = outlineResolution;
          shader.uniforms.outlineDepth = {value: outlineMask.depthTexture};
          shader.uniforms.outlineProjectionInverse = outlineProjectionInverse;
          shader.fragmentShader = 'uniform sampler2D outlineDepth; uniform mat4 outlineProjectionInverse; uniform sampler2D outlineMask; uniform vec2 outlineResolution; uniform vec2 outlineViewport; varying vec2 outlineInward;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            // Require coverage a few CSS pixels inside the edge. Thin blades fade
            // out instead of acquiring a thicker colored silhouette than the blade.
            vec2 maskUV = gl_FragCoord.xy / outlineResolution;
            vec2 inward = outlineInward / max(length(outlineInward), 0.00001) / outlineViewport;
            float nearCoverage = texture2D(outlineMask, maskUV + inward * 1.5).a;
            float deepCoverage = texture2D(outlineMask, maskUV + inward * 3.5).a;
            // Reject a base or another surface behind a thin weapon: coverage must
            // also be close to the outline surface in view-space depth.
            vec4 here = outlineProjectionInverse * vec4(maskUV * 2.0 - 1.0, gl_FragCoord.z * 2.0 - 1.0, 1.0);
            vec2 deepUV = maskUV + inward * 3.5;
            vec4 behind = outlineProjectionInverse * vec4(deepUV * 2.0 - 1.0, texture2D(outlineDepth, deepUV).r * 2.0 - 1.0, 1.0);
            float tolerance = 10.0 * abs(outlineProjectionInverse[1][1] / here.w) / outlineViewport.y;
            deepCoverage *= 1.0 - smoothstep(tolerance, tolerance * 2.0, max(0.0, here.z / here.w - behind.z / behind.w));
            diffuseColor.a *= smoothstep(0.25, 0.85, nearCoverage * deepCoverage);
            #include <opaque_fragment>
          `);
          shader.vertexShader = 'uniform vec2 outlineViewport; varying vec2 outlineInward;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
            #include <project_vertex>
            vec3 outlineNormal = normalMatrix * normal;
            vec2 outlineDirection = (projectionMatrix * vec4(outlineNormal, 0.0)).xy;
            float outlineLength = length(outlineDirection);
            outlineInward = -outlineDirection;
            // Orthographic projection and model scaling can make this very small.
            // Only reject a truly degenerate direction, not a valid overhead edge.
            if (outlineLength > 0.0000000001) {
              gl_Position.xy += outlineDirection / outlineLength * 2.0 / outlineViewport * gl_Position.w;
            }
          `);
        };
        const outlinedMeshes: Mesh[] = [];
        model.traverse(node => {
          if (node instanceof Mesh && node.geometry.hasAttribute('normal') &&
              (Array.isArray(node.material) ? node.material : [node.material]).every(m => !m.transparent)) {
            node.layers.enable(1);
            outlinedMeshes.push(node);
          }
        });
        for (const mesh of outlinedMeshes) {
          const shell = new Mesh(mesh.geometry, outlineMaterial);
          shell.name = 'disposition-outline';
          shell.raycast = () => {};
          mesh.add(shell);
        }
        const mixer = gltf.animations.length ? new AnimationMixer(model) : null;
        gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
        const materials = [...cloned.values()];
        const instance: Instance = {
          baseDiameter:definition.baseDiameter,lanternAnchor,torchLighting,
          root, outlineMaterial, outlineViewport, turnRing, selectionRing, conditionRings, combatBadge, badgeMesh, badgeTexture, url: definition.url, materials,
          originalColors: materials.map(m => m instanceof MeshStandardMaterial ? m.color.clone() : null),
          originalOpacity: materials.map((material) => material.opacity),
          originalTransparent: materials.map((material) => material.transparent), mixer, fx: null,
          // Emissive/material flicker does not change the ground silhouette.
          shadowAnimated: gltf.animations.some(clip => clip.tracks.some(track => /\.(position|quaternion|scale|morphTargetInfluences)(\[|$)/.test(track.name))),
          measureBody:()=>measureMistBody(gltf.scene,definition),
          mistBody:props.environmentPreview?measureMistBody(gltf.scene,definition):undefined,
          lightning: definition.id === 'vanec' ? createVanecLightning(model) : null,
        };
        place(current, instance);
        // First-use shader linking was blocking the movement frame for hundreds
        // of milliseconds. Compile against the real lighting before drawing the
        // new body; KHR_parallel_shader_compile lets existing figures keep moving.
        try { await renderer.compileAsync(root,camera,scene); }
        catch(error) {console.warn('Miniature shader preparation failed',error);}
        const latest=props.tokens.find(t=>t.id===token.id&&t.definition.url===definition.url);
        if(disposed||failed||!latest||instances.has(token.id)) {disposeInstance(instance);return;}
        instances.set(token.id, instance);
        place(latest, instance);
        scene.add(root);
        if(battlefield)renderer.shadowMap.needsUpdate=true;
        invalidate();
        const fx = definition.fxUrl ? await manifests.get(definition.fxUrl) : null;
        if (!disposed && instances.get(token.id) === instance && fx && Array.isArray(fx.keyframes) && fx.material_channels) {
          instance.fx = fx;
          applyFx(instance, 0);
          invalidate();
        }
      });
    }
    for (const definition of next.preloadDefinitions ?? []) loadDefinition(definition);
    invalidate();
  };
  const contextLost = (event: Event) => { event.preventDefault(); fail(); };
  const visibility = () => { invalidate(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    cancelAnimationFrame(frame);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    document.removeEventListener('visibilitychange', visibility);
    reducedMotion.removeEventListener('change', invalidate);
    [...instances.keys()].forEach(removeInstance);
    assets.forEach((promise) => { void promise.then((asset) => { if (asset) disposeAsset(asset); }); });
    assets.clear(); manifests.clear(); loading.clear(); moves.clear();
    shaderWarmup.dispose();
    clearPreview();previewMaterial.dispose();
    names.dispose();props.onRenderedNames?.(new Set());
    sharedCanvas.remove();sharedDepth.dispose();visionLift.dispose();
    battlefield?.dispose();battlefield=null;
    localShadows.dispose();
    timing?.dispose();
    outlineMask.dispose(); maskMaterial.dispose();
    environment?.dispose();
    scene.environment = null;
    renderer.dispose();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visibility);
  reducedMotion.addEventListener('change', invalidate);
  sync(initial);
  return {
    sync,
    spellCast(tokenIds) {
      if (disposed || document.hidden) return;
      for (const id of tokenIds) instances.get(id)?.lightning?.cast(performance.now() / 1000);
      invalidate();
    },
    setProjection(tilt, rotation, nextView) {
      if(disposed || failed)return;
      props={...props,tiltDegrees:tilt,rotationDegrees:rotation};view=nextView;
      // Keep the miniature projection synchronous with the map. queueDraw puts
      // the automatic animation fallback after the next camera update, so the
      // update replaces that fallback rather than duplicating the scene render.
      updateCamera();cancelAnimationFrame(frame);frame=0;lastPaint=0;draw(performance.now());
      host.dataset.tiltDegrees=String(tilt);
    },
    setView(next) { if (disposed) return; view = next; updateCamera(); invalidate(); },
    previewMove(id, point) {
      if(disposed)return;
      if(!point){if(preview?.id===id)clearPreview();invalidate();return;}
      const instance=instances.get(id);
      if(!instance)return;
      if(preview?.id!==id){
        clearPreview();
        const root=new Group();
        root.add(instance.root.children[0].clone(true));
        root.traverse(node=>{
          node.layers.set(0);
          if(node instanceof Mesh){
            if(node.name==='disposition-outline')node.visible=false;
            node.material=previewMaterial;
            node.castShadow=false;node.receiveShadow=false;
          }
        });
        preview={id,root};scene.add(root);host.dataset.previewTokenId=id;
      }
      preview!.root.scale.copy(instance.root.scale);
      preview!.root.position.set(point.x,0,point.y);
      preview!.root.rotation.y=point.facing;
      preview!.root.visible=props.isVisibleAt?.(id,point.x,point.y)??true;
      invalidate();
    },
    moveToken(id, x, y, finished, facing) {
      if (disposed) return;
      const token = props.tokens.find((item) => item.id === id)??props.environmentPreview?.carriedLanterns?.find(t=>t.id===id);
      if (!token) return;
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

export const MiniatureLayer = forwardRef<MiniatureLayerHandle, Props>(function MiniatureLayer(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [state, setState] = useState({ ids: [] as string[], status: 'loading' });
  const needsScene = props.tokens.length > 0 || !!props.preloadDefinitions?.length || !!props.environmentPreview;
  const socket = useStore(state => state.socket);
  useEffect(() => {
    const cast = ({ tokenIds }: { tokenIds: string[] }) => engine.current?.spellCast(tokenIds);
    socket?.on('fx:spellCast', cast);
    return () => { socket?.off('fx:spellCast', cast); };
  }, [socket]);
  useImperativeHandle(ref, () => ({
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
    data-personal-miniature-count={state.ids.filter(id=>!props.tokens.find(t=>t.id===id)?.sharedSightOnly).length}
    data-miniature-ids={state.ids.join(',')} data-miniature-status={state.status}
    data-tilt-degrees={props.tiltDegrees} />;
});
