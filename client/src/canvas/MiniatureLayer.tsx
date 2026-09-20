import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AnimationMixer, ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight,
  Material, Mesh, MeshStandardMaterial, OrthographicCamera, PMREMGenerator,
  Scene, Texture, WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { MiniatureDefinition } from '../lib/miniatures';
import { facingAfterMove } from '../../../shared/tokenFacing';
import { prepareMiniatureBase } from './miniatureBaseMaterial';
import {
  miniatureCameraTarget,
  type BattlefieldView,
} from './miniatureProjection';

export type MiniatureToken = {
  id: string; x: number; y: number; diameter: number; hidden: boolean;
  facing?: number;
  definition: MiniatureDefinition;
};
type Props = {
  tokens: MiniatureToken[];
  view: BattlefieldView;
  tiltDegrees: number;
  width: number;
  height: number;
  onReady: (tokenIds: ReadonlySet<string>) => void;
};
export type MiniatureLayerHandle = {
  setView: (view: BattlefieldView) => void;
  moveToken: (id: string, x: number, y: number, finished: boolean) => void;
};
type FxManifest = {
  duration_seconds: number;
  material_channels: Record<string, string>;
  keyframes: Array<Record<string, number> & { time: number }>;
};
type Instance = {
  root: Group;
  url: string;
  materials: Material[];
  originalOpacity: number[];
  originalTransparent: boolean[];
  mixer: AnimationMixer | null;
  fx: FxManifest | null;
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
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  scene.add(new HemisphereLight(0xe5edff, 0x726856, 2));
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
    environment?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    throw error;
  } finally { room?.dispose(); pmrem?.dispose(); }
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000000);
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
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const updateCamera = () => {
    const scale = Math.max(0.0001, view.scale);
    const center = miniatureCameraTarget(props.width, props.height, view, props.tiltDegrees);
    camera.left = -props.width / (2 * scale);
    camera.right = -camera.left;
    camera.top = props.height / (2 * scale);
    camera.bottom = -camera.top;
    const distance = Math.max(props.width, props.height) / scale + 10000;
    const depthSpan = Math.max(props.width, props.height) / scale * 2
      + Math.max(1, ...props.tokens.map((token) => token.diameter)) * 4;
    camera.near = Math.max(0.1, distance - depthSpan);
    camera.far = distance + depthSpan;
    const tilt = props.tiltDegrees * Math.PI / 180;
    camera.position.set(center.x, distance * Math.cos(tilt), center.z + distance * Math.sin(tilt));
    // At exactly overhead the default Y-up is parallel to the viewing axis.
    // An explicit screen-up keeps flat mode oriented identically to the map.
    camera.up.set(0, Math.sin(tilt), -Math.cos(tilt));
    camera.lookAt(center.x, 0, center.z);
    camera.updateProjectionMatrix();
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
    const animated = !reducedMotion.matches && [...instances.values()].some((instance) => instance.mixer || instance.fx);
    const settling = [...moves.values()].some((move) => Number.isFinite(move.until));
    if (now - lastPaint >= 1000 / 24) {
      lastPaint = now;
      const seconds = (now - started) / 1000;
      for (const token of props.tokens) {
        const instance = instances.get(token.id);
        if (!instance) continue;
        const move = moves.get(token.id);
        if (move && move.until < now) moves.delete(token.id);
        const position = moves.get(token.id) ?? token;
        instance.root.position.set(position.x, 0, position.y);
        instance.root.rotation.y = position.facing ?? 0;
        if (animated) { instance.mixer?.setTime(seconds); applyFx(instance, seconds); }
      }
      try { renderer.render(scene, camera); publish(); } catch { fail(); }
    }
    if (!failed && (animated || settling)) frame = requestAnimationFrame(draw);
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
    instance.materials.forEach((material) => material.dispose());
    instances.delete(id);
    loading.delete(id);
    moves.delete(id);
  };
  const place = (token: MiniatureToken, instance: Instance) => {
    const factor = token.diameter / token.definition.baseDiameter;
    instance.root.scale.setScalar(factor);
    const model = instance.root.children[0];
    model.position.set(...token.definition.baseCenter.map((value) => -value) as [number, number, number]);
    const position = moves.get(token.id) ?? token;
    instance.root.position.set(position.x, 0, position.y);
    instance.root.rotation.y = position.facing ?? 0;
    instance.materials.forEach((material, index) => {
      const transparent = token.hidden || instance.originalTransparent[index];
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = instance.originalOpacity[index] * (token.hidden ? 0.45 : 1);
    });
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
    }
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
        const cloned = new Map<Material, Material>();
        model.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          const copy = (material: Material) => {
            if (!cloned.has(material)) cloned.set(material, material.clone());
            return cloned.get(material)!;
          };
          node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
        });
        const mixer = gltf.animations.length ? new AnimationMixer(model) : null;
        gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
        const materials = [...cloned.values()];
        const instance: Instance = {
          root, url: definition.url, materials,
          originalOpacity: materials.map((material) => material.opacity),
          originalTransparent: materials.map((material) => material.transparent), mixer, fx: null,
        };
        instances.set(token.id, instance);
        place(current, instance);
        scene.add(root);
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
  useImperativeHandle(ref, () => ({
    setView: (view) => engine.current?.setView(view),
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
