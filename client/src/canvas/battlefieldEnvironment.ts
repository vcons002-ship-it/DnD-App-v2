import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, Group,
  IcosahedronGeometry, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFShadowMap,
  PlaneGeometry, RepeatWrapping, ShadowMaterial, SRGBColorSpace,
  Texture, TextureLoader, Vector2,
  type DirectionalLight, type Scene, type WebGLRenderer,
} from 'three';
import {createBattlefieldMist} from './battlefieldMist';

export type EnvironmentSceneryProp = {
  id?: string;
  type: 'pillar' | 'rock';
  x: number;
  y: number;
  size: number;
  height: number;
  depth?: number;
  rotation?: number;
};

export type EnvironmentMistPatch = {
  x: number;
  y: number;
  width: number;
  depth: number;
  height?: number;
  rotation?: number;
};

/** Preview-only rendering settings. Positions and lengths are map image pixels. */
export type EnvironmentPreviewSettings = {
  enabled: boolean;
  mapUrl: string;
  mapWidth: number;
  mapHeight: number;
  shadows: boolean;
  mist: boolean;
  scenery: boolean;
  /** Direction the shadow travels: 0 = map right, 90 = map down. */
  shadowDirectionDegrees: number;
  /** Ground distance per unit of caster height; controls sun elevation. */
  shadowLength: number;
  shadowOpacity: number;
  mistOpacity?: number;
  mistCoverage?: 'patches' | 'map';
  /** Top of the mist above the ground, in map pixels. */
  mistHeight?: number;
  mistShadows?: boolean;
  mistInteraction?: boolean;
  mistQuality?: 'auto' | 'high' | 'low' | 'off';
  props?: EnvironmentSceneryProp[];
  mistPatches?: EnvironmentMistPatch[];
};

export type EnvironmentContactToken = {
  id: string;
  x: number;
  y: number;
  diameter: number;
  /** Measured lower-body ellipse in map coordinates; decorative base excluded. */
  body?: {x:number;y:number;radiusX:number;radiusY:number;facing:number};
  visible: boolean;
};

export const DEFAULT_ENVIRONMENT_PREVIEW_SETTINGS: EnvironmentPreviewSettings = {
  enabled: true, mapUrl: '', mapWidth: 1216, mapHeight: 832,
  shadows: true, mist: true, scenery: true,
  shadowDirectionDegrees: 55, shadowLength: 1.3, shadowOpacity: 0.42,
  mistOpacity: 0.28,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function stoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(256, 256);
  const random = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const row = Math.floor(y / 64);
    const seamX = (x + (row % 2) * 64) % 128;
    const seamY = y % 64;
    const seam = seamX < 3 || seamY < 3;
    const edge = seamX < 6 || seamY < 6;
    const grain = random(x, y) * 19 + random(Math.floor(x / 7), Math.floor(y / 7)) * 13;
    const cloud = Math.sin(x * 0.066 + Math.sin(y * 0.039) * 2.7) * 7;
    const value = seam ? 70 + grain * 0.4 : (edge ? 130 : 115) + grain + cloud;
    const i = (y * 256 + x) * 4;
    pixels.data[i] = value + 9;
    pixels.data[i + 1] = value + 8;
    pixels.data[i + 2] = value + 1;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  // Small cracks, rather than high-contrast brick lines, carry the raised stone at a distance.
  context.strokeStyle = 'rgba(35,35,29,0.24)';
  context.lineWidth = 0.8;
  for (let i = 0; i < 22; i++) {
    const x = random(i, 8) * 256, y = random(i, 17) * 256;
    context.beginPath(); context.moveTo(x, y);
    context.lineTo(x + 5, y + 8); context.lineTo(x + 3, y + 13);
    context.lineTo(x + 11, y + 23); context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

function contactTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(48, 48, 3, 48, 48, 47);
  gradient.addColorStop(0, 'rgba(13,17,19,0.75)');
  gradient.addColorStop(0.28, 'rgba(13,17,19,0.6)');
  gradient.addColorStop(0.63, 'rgba(13,17,19,0.2)');
  gradient.addColorStop(1, 'rgba(13,17,19,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A disposable environment in the same depth buffer and map coordinates as the miniatures. */
export function createBattlefieldEnvironment(
  scene: Scene,
  renderer: WebGLRenderer,
  keyLight: DirectionalLight,
  initial: EnvironmentPreviewSettings,
  depthBuffer: {texture: Texture; resolution: Vector2},
  requestRender: () => void = () => {},
) {
  const environment = new Group();
  environment.name = 'battlefield-environment-preview';
  const scenery = new Group(), contacts = new Group();
  scenery.name = 'raised-courtyard-stone';
  contacts.name = 'miniature-contact-shadows';
  scene.add(environment);
  environment.add(scenery, contacts);
  const mist = createBattlefieldMist(depthBuffer.texture, depthBuffer.resolution);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const geometry = <T extends BufferGeometry>(value: T) => { geometries.add(value); return value; };
  const material = <T extends Material>(value: T) => { materials.add(value); return value; };
  const texture = <T extends Texture>(value: T) => { textures.add(value); return value; };
  const plane = geometry(new PlaneGeometry(1, 1));
  const groundMaterial = material(new MeshBasicMaterial({ toneMapped: false }));
  const floorUniforms = { groundArtwork: { value: null as Texture | null }, shadowStrength: { value: 0 } };
  const shadowedGroundMaterial = material(new ShadowMaterial({ transparent: false,
    depthWrite: true, toneMapped: false }));
  // Composite in the opaque artwork pass. This keeps the map's original colors outside
  // the shadow and avoids a second nearly coplanar transparent plane in the shared canvas.
  shadowedGroundMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floorUniforms);
    shader.vertexShader = 'varying vec2 groundUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'void main() {\n groundUv = uv;');
    shader.fragmentShader = 'uniform sampler2D groundArtwork; uniform float shadowStrength; varying vec2 groundUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      'vec4 artwork = texture2D(groundArtwork, groundUv);\n gl_FragColor = vec4(artwork.rgb * (1.0 - shadowStrength * (1.0 - getShadowMask())), 1.0);',
    );
    mist.extendGroundShader(shader);
  };
  shadowedGroundMaterial.customProgramCacheKey = () => 'battlefield-shadowed-artwork-v2-mist';
  const ground = new Mesh<PlaneGeometry, MeshBasicMaterial | ShadowMaterial>(plane, groundMaterial);
  ground.name = 'unchanged-map-artwork';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.visible = false;
  ground.receiveShadow = true;
  environment.add(ground);
  const stoneMap = texture(stoneTexture());
  stoneMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const stoneMaterial = material(new MeshStandardMaterial({
    map: stoneMap, bumpMap: stoneMap, bumpScale: 1.3,
    color: 0x8c8977, roughness: 0.94, metalness: 0, envMapIntensity: 0.2,
  }));
  const contactMap = texture(contactTexture());
  const contactMaterial = material(new MeshBasicMaterial({
    map: contactMap, transparent: true, depthWrite: false, toneMapped: false,
  }));
  const contactMeshes = new Map<string, Mesh<PlaneGeometry, MeshBasicMaterial>>();
  const loader = new TextureLoader();
  const original = {
    position: keyLight.position.clone(), targetPosition: keyLight.target.position.clone(),
    targetParent: keyLight.target.parent, castShadow: keyLight.castShadow,
    rendererEnabled: renderer.shadowMap.enabled, rendererType: renderer.shadowMap.type,
    rendererAutoUpdate: renderer.shadowMap.autoUpdate,
    rendererNeedsUpdate: renderer.shadowMap.needsUpdate,
    bias: keyLight.shadow.bias, normalBias: keyLight.shadow.normalBias,
    radius: keyLight.shadow.radius, intensity: keyLight.shadow.intensity,
    mapSize: keyLight.shadow.mapSize.clone(), camera: keyLight.shadow.camera.clone(),
    map: keyLight.shadow.map, mapPass: keyLight.shadow.mapPass,
    autoUpdate: keyLight.shadow.autoUpdate, needsUpdate: keyLight.shadow.needsUpdate,
  };
  const drawingSize = new Vector2();
  let settings = initial;
  let disposed = false, lightModified = false;
  let mapUrl = '', mapVersion = 0;
  let mapTexture: Texture | null = null;
  let propKey = '';
  let lightingKey = '';

  function releaseShadowMap() {
    if (keyLight.shadow.map !== original.map) keyLight.shadow.map?.dispose();
    if (keyLight.shadow.mapPass !== original.mapPass) keyLight.shadow.mapPass?.dispose();
    keyLight.shadow.map = original.map;
    keyLight.shadow.mapPass = original.mapPass;
  }

  function restoreLighting() {
    if (!lightModified) return;
    releaseShadowMap();
    keyLight.position.copy(original.position);
    keyLight.target.position.copy(original.targetPosition);
    if (!original.targetParent) keyLight.target.removeFromParent();
    keyLight.target.updateMatrixWorld();
    keyLight.castShadow = original.castShadow;
    keyLight.shadow.bias = original.bias;
    keyLight.shadow.normalBias = original.normalBias;
    keyLight.shadow.radius = original.radius;
    keyLight.shadow.intensity = original.intensity;
    keyLight.shadow.mapSize.copy(original.mapSize);
    keyLight.shadow.camera.copy(original.camera);
    keyLight.shadow.autoUpdate = original.autoUpdate;
    keyLight.shadow.needsUpdate = original.needsUpdate;
    renderer.shadowMap.enabled = original.rendererEnabled;
    renderer.shadowMap.type = original.rendererType;
    renderer.shadowMap.autoUpdate = original.rendererAutoUpdate;
    renderer.shadowMap.needsUpdate = original.rendererNeedsUpdate;
    lightModified = false;
  }

  function updateMap() {
    if (mapUrl === settings.mapUrl) return;
    mapUrl = settings.mapUrl;
    const version = ++mapVersion;
    if (mapTexture) { textures.delete(mapTexture); mapTexture.dispose(); mapTexture = null; }
    groundMaterial.map = null;
    floorUniforms.groundArtwork.value = null;
    groundMaterial.needsUpdate = true;
    ground.visible = false;
    if (!mapUrl) return;
    const pending = loader.load(mapUrl, (loaded) => {
      if (disposed || version !== mapVersion) { loaded.dispose(); return; }
      loaded.colorSpace = SRGBColorSpace;
      loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      groundMaterial.map = loaded;
      floorUniforms.groundArtwork.value = loaded;
      groundMaterial.needsUpdate = true;
      ground.visible = true;
      requestRender();
    }, undefined, () => {
      if (disposed || version !== mapVersion) return;
      ground.visible = false;
      requestRender();
    });
    mapTexture = texture(pending);
  }

  function clearProps() {
    scenery.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      geometries.delete(node.geometry); node.geometry.dispose();
    });
    scenery.clear();
  }

  function updateProps() {
    const definitions = settings.props ?? [];
    const nextKey = JSON.stringify(definitions);
    if (nextKey === propKey) return;
    propKey = nextKey;
    clearProps();
    definitions.forEach((definition, index) => {
      const root = new Group();
      root.name = definition.id ?? `${definition.type}-${index}`;
      root.position.set(definition.x, 0, definition.y);
      root.rotation.y = -(definition.rotation ?? 0) * Math.PI / 180;
      scenery.add(root);
      const size = Math.max(1, definition.size), height = Math.max(1, definition.height);
      const depth = Math.max(1, definition.depth ?? size);
      const addStone = (shape: BufferGeometry, y: number) => {
        const mesh = new Mesh(geometry(shape), stoneMaterial);
        mesh.position.y = y;
        mesh.castShadow = mesh.receiveShadow = true;
        // Include opaque scenery in the miniature outline/name depth mask.
        mesh.layers.enable(1);
        root.add(mesh);
        return mesh;
      };
      if (definition.type === 'pillar') {
        const foot = height * 0.12, cap = height * 0.09;
        addStone(new BoxGeometry(size * 1.16, foot, depth * 1.16), foot / 2);
        const shaft = addStone(new CylinderGeometry(size * 0.37, size * 0.42,
          height - foot - cap, 8, 3), foot + (height - foot - cap) / 2);
        shaft.scale.z = depth / size;
        shaft.rotation.y = Math.PI / 8;
        addStone(new BoxGeometry(size * 1.04, cap, depth * 1.04), height - cap / 2);
      } else {
        const rock = new IcosahedronGeometry(1, 1);
        const positions = rock.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
          const dent = 0.9 + 0.12 * Math.sin(x * 7.1 + z * 4.7 + y * 9.3);
          positions.setXYZ(i, x * dent * size * 0.5,
            (y * dent + 1) * height * 0.5, z * dent * depth * 0.5);
        }
        rock.computeVertexNormals();
        addStone(rock, -height * 0.025);
      }
    });
  }

  function updateLighting() {
    renderer.getDrawingBufferSize(drawingSize);
    const nextKey = JSON.stringify([settings.enabled, settings.shadows, settings.scenery,
      settings.shadowDirectionDegrees, settings.shadowLength, settings.mapWidth, settings.mapHeight,
      settings.props, drawingSize.x, drawingSize.y]);
    if (nextKey === lightingKey) return;
    lightingKey = nextKey;
    if (!settings.enabled) { restoreLighting(); return; }
    if (!lightModified) {
      keyLight.shadow.map = null;
      keyLight.shadow.mapPass = null;
      lightModified = true;
    }
    if (!keyLight.target.parent) scene.add(keyLight.target);
    const width = Math.max(1, settings.mapWidth), height = Math.max(1, settings.mapHeight);
    const reach = Math.max(width, height) * 1.2;
    const direction = settings.shadowDirectionDegrees * Math.PI / 180;
    const length = clamp(settings.shadowLength, 0.1, 4);
    keyLight.target.position.set(width / 2, 0, height / 2);
    keyLight.position.set(width / 2 - Math.cos(direction) * reach * length,
      reach, height / 2 - Math.sin(direction) * reach * length);
    keyLight.target.updateMatrixWorld();
    keyLight.castShadow = settings.shadows;
    renderer.shadowMap.enabled = settings.shadows;
    renderer.shadowMap.type = PCFShadowMap;
    // Mist animation never refreshes this map. The parent marks moving/animated casters dirty.
    renderer.shadowMap.autoUpdate = false;
    keyLight.shadow.autoUpdate = true;
    keyLight.shadow.intensity = 1;
    keyLight.shadow.bias = -0.00012;
    keyLight.shadow.normalBias = Math.max(width, height) * 0.00032;
    keyLight.shadow.radius = 2.2;
    renderer.getDrawingBufferSize(drawingSize);
    const resolution = Math.max(drawingSize.x, drawingSize.y) > 1500
      && renderer.capabilities.maxTextureSize >= 2048 ? 2048 : 1024;
    if (keyLight.shadow.mapSize.x !== resolution) {
      keyLight.shadow.map?.dispose(); keyLight.shadow.map = null;
      keyLight.shadow.mapSize.set(resolution, resolution);
    }
    const maxPropHeight = Math.max(150, ...(settings.props ?? []).map((prop) => prop.height));
    const half = Math.hypot(width, height) * 0.54 + maxPropHeight * 0.5;
    const camera = keyLight.shadow.camera;
    camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
    camera.near = Math.max(1, reach * Math.sqrt(1 + length * length) - half * 1.6 - maxPropHeight);
    camera.far = reach * Math.sqrt(1 + length * length) + half * 1.6 + maxPropHeight;
    camera.updateProjectionMatrix();
    keyLight.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  }

  function update(next: EnvironmentPreviewSettings) {
    if (disposed) return;
    settings = next;
    // This group also owns the baseline artwork: the effects toggle must never hide the map.
    environment.visible = true;
    const width = Math.max(1, settings.mapWidth), height = Math.max(1, settings.mapHeight);
    ground.position.x = width / 2; ground.position.z = height / 2;
    ground.scale.set(width, height, 1);
    scenery.visible = settings.enabled && settings.scenery;
    mist.update(settings);
    contacts.visible = settings.enabled && settings.shadows;
    ground.material = settings.enabled && (settings.shadows || (settings.mist && settings.mistShadows !== false)) ? shadowedGroundMaterial : groundMaterial;
    floorUniforms.shadowStrength.value = settings.shadows ? clamp(settings.shadowOpacity, 0, 1) : 0;
    contactMaterial.opacity = clamp(settings.shadowOpacity * 0.85, 0, 0.75);
    updateMap(); updateProps(); updateLighting();
    requestRender();
  }

  function setTokens(tokens: readonly EnvironmentContactToken[]) {
    if (disposed) return;
    mist.setTokens(tokens);
    const ids = new Set<string>();
    for (const token of tokens) {
      if (!token.visible) continue;
      ids.add(token.id);
      let mesh = contactMeshes.get(token.id);
      if (!mesh) {
        mesh = new Mesh(plane, contactMaterial);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 1;
        mesh.name = `contact-${token.id}`;
        contacts.add(mesh); contactMeshes.set(token.id, mesh);
      }
      mesh.position.set(token.x, 0.012, token.y);
      const diameter = Math.max(1, token.diameter) * 0.92;
      mesh.scale.set(diameter, diameter, 1);
    }
    for (const [id, mesh] of contactMeshes) if (!ids.has(id)) {
      mesh.removeFromParent(); contactMeshes.delete(id);
    }
  }

  function tick(timeSeconds: number) {
    if (disposed) return false;
    return mist.tick(timeSeconds);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    mapVersion++;
    restoreLighting();
    environment.removeFromParent();
    geometries.forEach((entry) => entry.dispose());
    materials.forEach((entry) => entry.dispose());
    textures.forEach((entry) => entry.dispose());
    contactMeshes.clear(); mist.dispose();
  }

  update(initial);
  return { update, tick, setTokens, dispose, get ready() { return groundMaterial.map !== null; },
    renderMist: mist.render,
    get mistState() { return mist.state; },
  };
}
