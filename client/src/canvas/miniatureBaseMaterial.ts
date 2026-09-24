import { Color, LatheGeometry, Vector2, Float32BufferAttribute, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace, TextureLoader } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { MiniatureDefinition } from '../lib/miniatures';

/** Add high-resolution basalt to Druk's existing terrain only. Geometry,
 * feet, metal rim and orb inlay remain the original approved model. */
export async function prepareMiniatureBase(gltf: GLTF, definition: MiniatureDefinition, anisotropy: number) {
  // Keep the measured footprint and central foot-contact plane, with a small
  // raised metal lip to make the base read as a solid pewter plinth.
  if (definition.url.startsWith('/miniatures/monsters/')) {
    gltf.scene.traverse(node => {
      if (!(node instanceof Mesh) || !node.name.endsWith('_round_base')) return;
      const radius = definition.baseDiameter / 2;
      const profile = [[0,-.0275],[.97,-.0275],[1,-.02],[1,.015],[.98,.0325],[.92,.0325],[.90,.0275],[0,.0275]];
      const geometry = new LatheGeometry(profile.map(([r,y]) => new Vector2(r * radius, y)), 64);
      const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
      const top = new Color('#454a50'), rim = new Color('#7a828b');
      for (let i = 0; i < positions.count; i++) {
        const color = Math.hypot(positions.getX(i), positions.getZ(i)) >= radius * .91 ? rim : top;
        colors.set([color.r, color.g, color.b], i * 3);
      }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      node.geometry.dispose();
      node.geometry = geometry;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.color.set('#ffffff');
        material.vertexColors = true;
        material.metalness = .82;
        material.roughness = .34;
        material.envMapIntensity = .85;
        material.userData.pewterBase = true;
        material.needsUpdate = true;
      }
    });
    return gltf;
  }
  if (definition.id !== 'druk' || !definition.baseTextureUrl) return gltf;
  const color = await new TextureLoader().loadAsync(definition.baseTextureUrl);
  color.colorSpace = SRGBColorSpace;
  color.anisotropy = anisotropy;
  const bump = color.clone();
  bump.colorSpace = NoColorSpace;
  const targets: Mesh[] = [];
  gltf.scene.traverse(node => {
    if (node instanceof Mesh && (node.name === 'Druk_Base_Earthy_Stone_Moss_Top' || node.name.startsWith('Druk_Base_Low_Stone_'))) targets.push(node);
  });
  if (!targets.length) { color.dispose(); bump.dispose(); throw new Error('Druk base terrain is missing'); }
  for (const node of targets) {
    const positions = node.geometry.getAttribute('position');
    const uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      uv[i * 2] = (positions.getX(i) - definition.baseCenter[0]) / definition.baseDiameter + 0.5;
      uv[i * 2 + 1] = (positions.getZ(i) - definition.baseCenter[2]) / definition.baseDiameter + 0.5;
    }
    node.geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.vertexColors = false;
      material.color.setRGB(0.22, 0.22, 0.22);
      material.map = color;
      // Restrained surface relief from the rock's grayscale variation; no
      // displacement, so the fitted soles and base footprint cannot change.
      material.bumpMap = bump;
      material.bumpScale = 0.0025;
      material.roughness = 0.96;
      material.metalness = 0;
      material.needsUpdate = true;
    }
  }
  return gltf;
}
