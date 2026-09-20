import { Float32BufferAttribute, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace, TextureLoader } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { MiniatureDefinition } from '../lib/miniatures';

/** Add high-resolution basalt to Druk's existing terrain only. Geometry,
 * feet, metal rim and orb inlay remain the original approved model. */
export async function prepareMiniatureBase(gltf: GLTF, definition: MiniatureDefinition, anisotropy: number) {
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
