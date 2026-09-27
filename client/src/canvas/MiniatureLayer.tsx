import {COMBAT_ROLE_ICON} from '../../../shared/combatRole';
import type {CombatRole} from '../../../shared/types';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AlwaysStencilFunc, NotEqualStencilFunc, ReplaceStencilOp, KeepStencilOp, BackSide, Vector2, Color, AnimationMixer, ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight,
  Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, RingGeometry,
  CanvasTexture, PlaneGeometry, Scene, Texture, DepthTexture, Matrix4, WebGLRenderer, PerspectiveCamera, WebGLRenderTarget,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { MiniatureDefinition } from '../lib/miniatures';
import { facingAfterMove } from '../../../shared/tokenFacing';
import { createMiniatureNameLayer } from './miniatureNameLayer';
import type { MiniatureNameLabel } from './miniatureNameLabels';
import { prepareMiniatureBase } from './miniatureBaseMaterial';
import { createBattlefieldEnvironment, type EnvironmentPreviewSettings } from './battlefieldEnvironment';
import { createVanecLightning } from './vanecLightning';
import { useStore } from '../state/socket';
import {
  miniatureCameraTarget,
  perspectiveDistance,
  type BattlefieldView,
} from './miniatureProjection';

export type MiniatureToken = {
  id: string; x: number; y: number; diameter: number; hidden: boolean;
  facing?: number;
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
  tokens: MiniatureToken[];
  view: BattlefieldView;
  tiltDegrees: number;
  rotationDegrees?: number;
  width: number;
  height: number;
  isVisibleAt?: (id: string, x: number, y: number) => boolean;
  onReady: (tokenIds: ReadonlySet<string>) => void;
  nameLabels?: () => MiniatureNameLabel[];
  onRenderedNames?: (ids: ReadonlySet<string>) => void;
  /** Isolated environment proof; ordinary battlefields retain their renderer. */
  environmentPreview?: EnvironmentPreviewSettings;
};
export type MiniatureLayerHandle = {
  spellCast: (tokenIds: string[]) => void;
  setView: (view: BattlefieldView) => void;
  setProjection: (tilt:number, rotation:number, view:BattlefieldView) => void;
  moveToken: (id: string, x: number, y: number, finished: boolean) => void;
};
type FxManifest = {
  duration_seconds: number;
  material_channels: Record<string, string>;
  keyframes: Array<Record<string, number> & { time: number }>;
};
type Instance = {
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
  fx: FxManifest | null;
  lightning: ReturnType<typeof createVanecLightning> | null;
};
type Engine = MiniatureLayerHandle & { sync: (props: Props) => void; dispose: () => void };

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
  // Shared screen mask measures local silhouette thickness for every model,
  // including weapons merged into a body mesh. Layer 1 contains opaque bodies only.
  const outlineMask = new WebGLRenderTarget(1, 1);
  outlineMask.depthTexture = new DepthTexture(1, 1);
  const outlineProjectionInverse = {value: new Matrix4()};
  const maskMaterial = new MeshBasicMaterial({color: 0xffffff, toneMapped: false});
  const outlineResolution = {value: new Vector2(1, 1)};

  const names=createMiniatureNameLayer(scene,outlineMask.depthTexture,outlineResolution);

  const ambient = new HemisphereLight(0xe5edff, 0x726856, 2);
  scene.add(ambient);
  const key = new DirectionalLight(0xffeddb, 3);
  key.position.set(-3, 8, 5);
  scene.add(key);
  // A small neutral environment keeps metal readable without per-token lights/shadows.
  let pmrem: PMREMGenerator | null = null;
  let room: RoomEnvironment | null = null;
  let environment: WebGLRenderTarget | null = null;
  try {
    pmrem = new PMREMGenerator(renderer);
    room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04, 0.1, 100);
    scene.environment = environment.texture;
  } catch (error) {
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
  const manifests = new Map<string, Promise<FxManifest | null>>();
  const instances = new Map<string, Instance>();
  const loading = new Map<string, string>();
  const moves = new Map<string, { x: number; y: number; facing: number; fromX: number; fromY: number; until: number }>();
  const abort = new AbortController();
  let props = initial;
  let view = initial.view;
  let committedView = initial.view;
  let disposed = false;
  let failed = false;
  let frame = 0;
  let lastPaint = 0;
  let started = performance.now();
  let lastIds = '';
  let lastStatus = '';
  let hasRendered = false;
  let renderedWidth = 0;
  let renderedHeight = 0;
  let renderedPixelRatio = 0;
  let battlefield: ReturnType<typeof createBattlefieldEnvironment> | null = null;
  let lastEnvironment: EnvironmentPreviewSettings | undefined;
  let paintCount = 0, paintEpoch = performance.now();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
    const ids = failed ? [] : props.tokens.filter((token) => instances.get(token.id)?.url === token.definition.url).map((token) => token.id).sort();
    const key = ids.join('|');
    const status = failed ? 'unavailable' : ids.length ? 'ready' : 'loading';
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
    renderer.domElement.style.visibility = 'hidden';
    cancelAnimationFrame(frame);
    frame = 0;
    publish();
    dispose();
  };
  const draw = (now: number) => {
    frame = 0;
    if (disposed || failed || document.hidden) return;
    const atmosphereAnimated = !!props.environmentPreview?.enabled && props.environmentPreview.mist && !reducedMotion.matches;
    const animated = !reducedMotion.matches && [...instances.values()].some((instance) => instance.mixer || instance.fx || instance.turnRing.visible || instance.selectionRing.visible);
    const settling = [...moves.values()].some((move) => Number.isFinite(move.until));
    const casting = [...instances.entries()].filter(([, instance]) => instance.lightning?.active(now / 1000));
    host.dataset.castingTokenIds = casting.map(([id]) => id).join(',');
    if (now - lastPaint >= (props.environmentPreview ? 1000 / 60 - 1 : 1000 / 24)) {
      lastPaint = now;
      const seconds = (now - started) / 1000;
      for (const token of props.tokens) {
        const instance = instances.get(token.id);
        if (!instance) continue;
        const move = moves.get(token.id);
        if (move && move.until < now) moves.delete(token.id);
        const position = moves.get(token.id) ?? token;
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
        return {id:token.id,x:instance?.root.position.x ?? token.x,y:instance?.root.position.z ?? token.y,diameter:token.diameter,visible:!!instance?.root.visible && !token.hidden};
      }));
      battlefield?.tick(reducedMotion.matches ? 0 : seconds);
      try {
        const visible=new Set([...instances].filter(([,instance])=>instance.root.visible).map(([id])=>id));
        const renderedNames=names.sync(props.nameLabels?.()??[],visible);
        if (renderedNames.size || props.tokens.some(token => token.outline)) {
          const originalLayers = camera.layers.mask;
          camera.layers.set(1); scene.overrideMaterial = maskMaterial;
          const shadowUpdate = renderer.shadowMap.needsUpdate;
          renderer.shadowMap.needsUpdate = false;
          renderer.setRenderTarget(outlineMask); renderer.clear(); renderer.render(scene, camera);
          renderer.shadowMap.needsUpdate = shadowUpdate;
          scene.overrideMaterial = null; camera.layers.mask = originalLayers;
          renderer.setRenderTarget(null);
        }
        renderer.render(scene, camera);
        if (battlefield) {
          paintCount++;
          if(now-paintEpoch>=1500){host.dataset.renderFps=(paintCount*1000/(now-paintEpoch)).toFixed(1);paintCount=0;paintEpoch=now;}
          host.dataset.environment=props.environmentPreview?.enabled ? 'on' : 'off';
          host.dataset.shadows=String(!!props.environmentPreview?.enabled && props.environmentPreview.shadows);
          host.dataset.groundReady=String(battlefield.ready);
        }
        props.onRenderedNames?.(renderedNames);
        host.dataset.nameRendering='per-pixel';host.dataset.nameCount=String(renderedNames.size);
        publish();
      } catch { fail(); }
    }
    if (!failed && (animated || atmosphereAnimated || settling || casting.length > 0)) frame = requestAnimationFrame(draw);
  };
  const invalidate = () => {
    if (disposed || failed || document.hidden) return;
    // Pointer/camera changes paint on the next frame even when an animated
    // miniature already has a frame pending under the 24fps idle effect cap.
    lastPaint = 0;
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const removeInstance = (id: string) => {
    const instance = instances.get(id);
    if (!instance) return;
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
    instances.delete(id);
    loading.delete(id);
    moves.delete(id);
  };
  const place = (token: MiniatureToken, instance: Instance) => {
    const factor = token.diameter / token.definition.baseDiameter;
    const visible=props.isVisibleAt?.(token.id, (moves.get(token.id) ?? token).x, (moves.get(token.id) ?? token).y) ?? true;
    if(battlefield && (instance.root.visible!==visible || instance.root.scale.x!==factor))renderer.shadowMap.needsUpdate=true;
    instance.root.scale.setScalar(factor);
    const model = instance.root.children[0];
    model.position.set(...token.definition.baseCenter.map((value) => -value) as [number, number, number]);
    const position = moves.get(token.id) ?? token;
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
    if (battlefield) {
      const casts=!!props.environmentPreview?.enabled && props.environmentPreview.shadows && !token.hidden;
      model.traverse(node=>{if(node instanceof Mesh && node.name !== 'disposition-outline'){
        const opaque=(Array.isArray(node.material)?node.material:[node.material]).every(material=>!material.transparent);
        if(node.castShadow !== (casts && opaque))renderer.shadowMap.needsUpdate=true;
        node.castShadow=casts && opaque;node.receiveShadow=casts && opaque;
      }});
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
      if(!battlefield)battlefield=createBattlefieldEnvironment(scene,renderer,key,next.environmentPreview,invalidate);
      else if(lastEnvironment!==next.environmentPreview)battlefield.update(next.environmentPreview);
      lastEnvironment=next.environmentPreview;
      ambient.intensity=next.environmentPreview.enabled ? 1.35 : 2;
    } else if(battlefield){battlefield.dispose();battlefield=null;lastEnvironment=undefined;ambient.intensity=2;}
    updateCamera();
    for (const [id, url] of loading) {
      if (!next.tokens.some((token) => token.id === id && token.definition.url === url)) loading.delete(id);
    }
    for (const id of moves.keys()) {
      if (!next.tokens.some((token) => token.id === id)) moves.delete(id);
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
      if (!assets.has(definition.url)) assets.set(definition.url, loader.loadAsync(definition.url)
        .then(async gltf => {
          try { return await prepareMiniatureBase(gltf, definition, Math.min(8, renderer.capabilities.getMaxAnisotropy())); }
          catch (error) { console.warn('Miniature base texture unavailable', error); return gltf; }
        }).catch(() => null));
      if (definition.fxUrl && !manifests.has(definition.fxUrl)) {
        manifests.set(definition.fxUrl, fetch(definition.fxUrl, { signal: abort.signal })
          .then(async (response) => response.ok ? await response.json() as FxManifest : null).catch(() => null));
      }
      void assets.get(definition.url)!.then(async (gltf) => {
        if (disposed || failed || !gltf) return;
        const current = props.tokens.find((item) => item.id === token.id && item.definition.url === definition.url);
        if (!current || instances.has(token.id)) return;
        const root = new Group();
        // Animated source transforms remain intact below this base-centering group.
        const centered = new Group();
        const model = gltf.scene.clone(true);
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
          root, outlineMaterial, outlineViewport, turnRing, selectionRing, conditionRings, combatBadge, badgeMesh, badgeTexture, url: definition.url, materials,
          originalColors: materials.map(m => m instanceof MeshStandardMaterial ? m.color.clone() : null),
          originalOpacity: materials.map((material) => material.opacity),
          originalTransparent: materials.map((material) => material.transparent), mixer, fx: null,
          // Emissive/material flicker does not change the ground silhouette.
          shadowAnimated: gltf.animations.some(clip => clip.tracks.some(track => /\.(position|quaternion|scale|morphTargetInfluences)(\[|$)/.test(track.name))),
          lightning: definition.id === 'vanec' ? createVanecLightning(model) : null,
        };
        instances.set(token.id, instance);
        place(current, instance);
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
    invalidate();
  };
  const contextLost = (event: Event) => { event.preventDefault(); fail(); };
  const visibility = () => { started = performance.now(); invalidate(); };
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
    names.dispose();props.onRenderedNames?.(new Set());
    battlefield?.dispose();battlefield=null;
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
      updateCamera();cancelAnimationFrame(frame);frame=0;lastPaint=0;draw(performance.now());
      host.dataset.tiltDegrees=String(tilt);
    },
    setView(next) { if (disposed) return; view = next; updateCamera(); invalidate(); },
    moveToken(id, x, y, finished) {
      if (disposed) return;
      const token = props.tokens.find((item) => item.id === id);
      if (!token) return;
      moves.set(id, { x, y, facing: facingAfterMove(token.x, token.y, x, y, token.facing),
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
  const hasMiniatures = props.tokens.length > 0;
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
    moveToken: (id, x, y, finished) => engine.current?.moveToken(id, x, y, finished),
  }), []);
  useEffect(() => {
    if (!hasMiniatures) {
      setState({ ids: [], status: 'idle' });
      latest.current.onReady(new Set());
      return;
    }
    try {
      engine.current = createEngine(host.current!, latest.current, (ids, status) => setState({ ids, status }));
    } catch {
      host.current?.replaceChildren();
      setState({ ids: [], status: 'unavailable' });
      latest.current.onReady(new Set());
    }
    return () => { engine.current?.dispose(); engine.current = null; };
  }, [hasMiniatures]);
  useEffect(() => { engine.current?.sync(props); }, [props]);
  return <div ref={host} className="miniature-layer" aria-hidden="true"
    data-testid="miniature-layer" data-miniature-count={state.ids.length}
    data-miniature-ids={state.ids.join(',')} data-miniature-status={state.status}
    data-tilt-degrees={props.tiltDegrees} />;
});
