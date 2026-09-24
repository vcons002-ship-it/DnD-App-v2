import { CanvasTexture, Color, LatheGeometry, Vector2, Float32BufferAttribute, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace, TextureLoader } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { MiniatureDefinition } from '../lib/miniatures';

/** Add high-resolution basalt to Druk's existing terrain only. Geometry,
 * feet, metal rim and orb inlay remain the original approved model. */
export async function prepareMiniatureBase(gltf: GLTF, definition: MiniatureDefinition, anisotropy: number) {
  // Preserve the measured footprint; lift feet with the thicker beveled pewter top.
  if (definition.url.startsWith('/miniatures/monsters/') || definition.url.startsWith('/uploads/miniatures/')) {
    gltf.scene.traverse(node => {
      if (!(node instanceof Mesh) || !node.name.endsWith('_round_base')) return;
      const radius = definition.baseDiameter / 2;
      const profile = [[0,-.0275],[.94,-.0275],[1,-.008],[1,.012],[.97,.025],[.97,.075],[.93,.1025],[.88,.1025],[.85,.085],[0,.085]];
      const geometry = new LatheGeometry(profile.map(([r,y]) => new Vector2(r * radius, y)), 64);
      const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
      const top = new Color('#555d65'), rim = new Color('#7b8590'), side = new Color('#23272d');
      for (let i = 0; i < positions.count; i++) {
        const color = positions.getY(i) < .075 ? (positions.getY(i) > .024 ? side : rim)
          : Math.hypot(positions.getX(i), positions.getZ(i)) >= radius * .87 ? rim : top;
        colors.set([color.r, color.g, color.b], i * 3);
      }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      const uv = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) {
        uv[i * 2] = positions.getX(i) / (radius * 2) + .5;
        uv[i * 2 + 1] = positions.getZ(i) / (radius * 2) + .5;
      }
      geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      // Deterministic fine grain and faint circular tool marks, shared with clones.
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      const pixels = ctx.createImageData(512, 512);
      let seed = 9137;
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const grain = (seed / 4294967296 - .5) * 28;
        const distance = Math.hypot(x - 256, y - 256);
        const value = 210 + grain + Math.sin(distance * 2.8) * 7 + Math.sin(x * .035 + y * .006) * 9;
        const offset = (y * 512 + x) * 4;
        pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = value;
        pixels.data[offset + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      const metalTexture = new CanvasTexture(canvas);
      metalTexture.colorSpace = SRGBColorSpace;
      metalTexture.anisotropy = anisotropy;

      node.geometry.dispose();
      node.geometry = geometry;
      const oldMaterials = Array.isArray(node.material) ? node.material : [node.material];
      oldMaterials.forEach(m => m.dispose());
      node.material = new MeshStandardMaterial({
        color: '#ffffff', vertexColors: true, metalness: .92, roughness: .3, envMapIntensity: 1.25,
        map: metalTexture, bumpMap: metalTexture, bumpScale: .0008,
      });
      node.material.userData.pewterBase = true;

    });
    // Lift the body by exactly the top-surface increase so the feet stay seated.
    for (const node of gltf.scene.children) {
      if (!node.name.endsWith('_round_base')) node.position.y += .0575;
    }
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
