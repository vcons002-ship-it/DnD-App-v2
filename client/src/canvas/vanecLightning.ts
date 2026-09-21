import {
  AdditiveBlending, Box3, CanvasTexture, Group, Mesh, MeshStandardMaterial,
  Sprite, SpriteMaterial, Vector3,
} from 'three';

export const CAST_GLOW_SECONDS = 2.4;

/** One smooth charge/release, never a rapid full-screen flash. */
export function castGlowEnvelope(age: number): number {
  if (age < 0 || age >= CAST_GLOW_SECONDS) return 0;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  return age < 0.3 ? smooth(age / 0.3) : 1 - smooth((age - 0.3) / 2.1);
}

/** Runtime light only: source staff, hands and approved lightning topology stay intact. */
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
  const cores: MeshStandardMaterial[] = [];
  const sheaths: MeshStandardMaterial[] = [];
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
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      if (/^VanecFX_.*_Core$/.test(material.name)) {
        if (!cores.includes(material)) cores.push(material);
        material.emissive.set('#ffe5ec');
        material.color.set('#fff2f6');
        material.toneMapped = false;
        // Small luminous knots along each existing branch. They follow its baked animation.
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox!;
        addGlow(mesh, bounds.getCenter(new Vector3()), 0.10, false);
      } else if (/^VanecFX_.*_Crimson$/.test(material.name)) {
        if (!sheaths.includes(material)) sheaths.push(material);
        material.blending = AdditiveBlending; material.depthWrite = false;
        material.toneMapped = false;
      }
    }
  }
  const palm = model.getObjectByName('Palm_Lightning_Main_Core');
  if (palm) addGlow(model, palm.position.clone().add(new Vector3(0, 0.065, 0)), 0.25, true);
  const ruby = model.getObjectByName('Staff_Ruby_Glow_Face_1');
  if (ruby) {
    model.updateMatrixWorld(true);
    const center = new Box3().setFromObject(ruby).getCenter(new Vector3());
    addGlow(model, model.worldToLocal(center), 0.28, true);
  }
  let castAt = -Infinity;
  return {
    cast(now: number) { castAt = now; },
    active(now: number) { return now - castAt < CAST_GLOW_SECONDS; },
    update(seconds: number, now: number, reduced: boolean, hidden: boolean) {
      const burst = castGlowEnvelope(now - castAt);
      const wave = reduced ? 1 : 0.88 + 0.12 * Math.sin(seconds * 3.8);
      for (const material of cores) material.emissiveIntensity = 1.6 * wave + burst * 5;
      for (const material of sheaths) {
        material.emissiveIntensity = 1.4 + burst * 3;
        material.opacity = (0.32 + burst * 0.35) * (hidden ? 0.45 : 1);
      }
      for (const { sprite, size, phase, source } of glows) {
        const shimmer = reduced ? 1 : 0.9 + 0.1 * Math.sin(seconds * 4 + phase);
        // Reduced motion keeps a restrained, steady cast highlight; no expansion.
        sprite.scale.setScalar(size * (reduced ? 1 : shimmer + burst * (source ? 1.5 : 0.7)));
        sprite.material.opacity = (source ? 0.46 : 0.23) * shimmer * (1 + burst * (reduced ? 0.6 : 1.8)) * (hidden ? 0.45 : 1);
      }
    },
    dispose() {
      glows.forEach(({ sprite }) => { sprite.removeFromParent(); sprite.material.dispose(); });
      texture.dispose();
    },
  };
}
