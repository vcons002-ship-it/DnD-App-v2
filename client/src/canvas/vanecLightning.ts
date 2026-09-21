import {
  AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial,
  Sprite, SpriteMaterial, Vector3,
} from 'three';

export const CAST_GLOW_SECONDS = 2.4;

/** One smooth charge/release, never a rapid full-screen flash. */
export function castGlowEnvelope(age: number): number {
  if (age < 0 || age >= CAST_GLOW_SECONDS) return 0;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  return age < 0.3 ? smooth(age / 0.3) : 1 - smooth((age - 0.3) / 2.1);
}

/** Small reusable tube buffers: new discharge shapes without allocating geometry per frame. */
function energyArc(parent: Group, staff: boolean, index: number) {
  const segments = 20, sides = 5;
  const vertices = new Float32Array((segments + 1) * sides * 3);
  const indices: number[] = [];
  for (let j = 0; j < segments; j++) for (let k = 0; k < sides; k++) {
    const a = j * sides + k, b = j * sides + (k + 1) % sides;
    indices.push(a, b, a + sides, b, b + sides, a + sides);
  }
  const coreGeometry = new BufferGeometry();
  coreGeometry.setAttribute('position', new BufferAttribute(vertices, 3));
  coreGeometry.setIndex(indices);
  const haloGeometry = coreGeometry.clone();
  const core = new Mesh(coreGeometry, new MeshBasicMaterial({ color: '#fff0f7',
    transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  const halo = new Mesh(haloGeometry, new MeshBasicMaterial({ color: '#ff164c',
    transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  core.frustumCulled = halo.frustumCulled = false;
  parent.add(halo, core);
  const points = Array.from({ length: segments + 1 }, () => new Vector3());
  const tangent = new Vector3(), normal = new Vector3(), binormal = new Vector3();
  const up = new Vector3(0, 1, 0), right = new Vector3(1, 0, 0);
  let lastSeed = -1;
  const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  return {
    update(seconds: number, burst: number, reduced: boolean, hidden: boolean) {
      const time = reduced ? 0.35 : seconds * (staff ? 6.3 : 7.7) + index * 0.713;
      const tick = Math.floor(time), seed = tick * 31 + index * 137 + (staff ? 900 : 0);
      if (seed !== lastSeed) {
        lastSeed = seed;
        const angle = random(seed + 1) * Math.PI * 2;
        const reach = 0.17 + random(seed + 2) * 0.15;
        for (let j = 0; j <= segments; j++) {
          const t = j / segments, taper = Math.sin(t * Math.PI);
          const noise = (n: number) => (random(seed + j * 7 + n) - 0.5) * 0.048 * taper;
          if (staff) {
            // Discharges crawl around the ruby in three dimensions, never a fixed branch silhouette.
            const theta = angle + t * (1.3 + random(seed + 3) * 2.4);
            points[j].set(Math.cos(theta) * 0.105 + noise(1), Math.sin(theta) * 0.14 + noise(2),
              Math.sin(theta * 2 + index) * 0.055 + noise(3));
          } else {
            // Each short-lived filament rises from the palm and curls back toward the energy center.
            const theta = angle + t * (2.2 + random(seed + 4) * 2);
            const radius = Math.sin(t * Math.PI) * (0.07 + random(seed + 5) * 0.055);
            points[j].set(Math.cos(theta) * radius + noise(1), t * reach + noise(2),
              Math.sin(theta) * radius + noise(3));
          }
        }
        for (const [geometry, radius] of [[coreGeometry, 0.0018], [haloGeometry, 0.007]] as const) {
          const attr = geometry.getAttribute('position') as BufferAttribute;
          for (let j = 0; j <= segments; j++) {
            tangent.subVectors(points[Math.min(segments, j + 1)], points[Math.max(0, j - 1)]).normalize();
            normal.crossVectors(tangent, Math.abs(tangent.y) > 0.9 ? right : up).normalize();
            binormal.crossVectors(tangent, normal);
            const width = radius * (0.15 + Math.sin(j / segments * Math.PI) * 0.85);
            for (let k = 0; k < sides; k++) {
              const a = k / sides * Math.PI * 2, c = Math.cos(a) * width, s = Math.sin(a) * width;
              attr.setXYZ(j * sides + k, points[j].x + normal.x * c + binormal.x * s,
                points[j].y + normal.y * c + binormal.y * s, points[j].z + normal.z * c + binormal.z * s);
            }
          }
          attr.needsUpdate = true;
        }
      }
      const discharge = reduced ? 0.45 : Math.pow(Math.sin((time - tick) * Math.PI), 0.6);
      const strength = discharge * (0.55 + random(seed + 20) * 0.45) * (hidden ? 0.45 : 1);
      core.material.opacity = strength * (0.7 + burst * 0.3);
      halo.material.opacity = strength * (0.28 + burst * 0.42);
      // Extra filaments join the cast burst, then disappear as it subsides.
      core.visible = halo.visible = index < (staff ? 3 : 4) || burst > 0.2;
    },
    dispose() { coreGeometry.dispose(); haloGeometry.dispose(); core.material.dispose(); halo.material.dispose(); core.removeFromParent(); halo.removeFromParent(); },
  };
}

/** Replace only the baked effect meshes; approved staff, hand and ruby geometry stay intact. */
export function createVanecLightning(model: Group) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,245,238,1)');
  gradient.addColorStop(0.12, 'rgba(255,145,160,.85)');
  gradient.addColorStop(0.35, 'rgba(245,20,65,.3)');
  gradient.addColorStop(1, 'rgba(190,0,25,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  const glows: Array<{ sprite: Sprite; size: number; phase: number; source: boolean }> = [];
  const arcs: ReturnType<typeof energyArc>[] = [];
  const emitters: Group[] = [];
  const addGlow = (parent: Group | Mesh, position: Vector3, size: number, source: boolean) => {
    const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true,
      blending: AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false }));
    sprite.position.copy(position); sprite.scale.setScalar(size); parent.add(sprite);
    glows.push({ sprite, size, phase: glows.length * 1.7, source });
  };
  // Collect first: adding sprite children during traversal must not affect discovery.
  const meshes: Mesh[] = [];
  model.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
  for (const mesh of meshes) {
    if (/^(Palm_Lightning_|Staff_Lightning_)/.test(mesh.name)) mesh.visible = false;
  }
  const addEmitter = (position: Vector3, staff: boolean) => {
    const emitter = new Group(); emitter.position.copy(position); model.add(emitter); emitters.push(emitter);
    for (let i = 0; i < (staff ? 5 : 6); i++) arcs.push(energyArc(emitter, staff, i));
    addGlow(emitter, new Vector3(0, staff ? 0 : 0.1, 0), staff ? 0.29 : 0.24, true);
  };
  const palm = model.getObjectByName('Palm_Lightning_Main_Core');
  if (palm) addEmitter(palm.position.clone().add(new Vector3(0, 0.018, 0)), false);
  const ruby = model.getObjectByName('Staff_Ruby_Glow_Face_1');
  if (ruby) {
    model.updateMatrixWorld(true);
    const center = new Box3().setFromObject(ruby).getCenter(new Vector3());
    addEmitter(model.worldToLocal(center), true);
  }
  let castAt = -Infinity;
  return {
    cast(now: number) { castAt = now; },
    active(now: number) { return now - castAt < CAST_GLOW_SECONDS; },
    update(seconds: number, now: number, reduced: boolean, hidden: boolean) {
      const burst = castGlowEnvelope(now - castAt);
      arcs.forEach(arc => arc.update(seconds, reduced ? burst * 0.3 : burst, reduced, hidden));
      for (const { sprite, size, phase, source } of glows) {
        const shimmer = reduced ? 1 : 0.9 + 0.1 * Math.sin(seconds * 4 + phase);
        // Reduced motion keeps a restrained, steady cast highlight; no expansion.
        sprite.scale.setScalar(size * (reduced ? 1 : shimmer + burst * (source ? 1.5 : 0.7)));
        sprite.material.opacity = (source ? 0.46 : 0.23) * shimmer * (1 + burst * (reduced ? 0.6 : 1.8)) * (hidden ? 0.45 : 1);
      }
    },
    dispose() {
      glows.forEach(({ sprite }) => { sprite.removeFromParent(); sprite.material.dispose(); });
      arcs.forEach(arc => arc.dispose());
      emitters.forEach(emitter => emitter.removeFromParent());
      texture.dispose();
    },
  };
}
