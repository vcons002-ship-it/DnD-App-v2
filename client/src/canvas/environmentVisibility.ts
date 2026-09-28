import {DataTexture, NearestFilter, RedFormat, Vector4} from 'three';

export type EnvironmentFog = {grid: number; revealed: readonly string[]};
type Settings = {mapX?: number; mapY?: number; mapWidth: number; mapHeight: number; fog?: EnvironmentFog};
export const environmentVisibilityGlsl = /* glsl */`
  uniform sampler2D environmentVisibility;
  uniform vec4 environmentVisibilityBounds;
  uniform float environmentFogEnabled;
  float environmentVisible(vec2 world) {
    if (environmentFogEnabled < .5) return 1.0;
    vec2 uv = (world - environmentVisibilityBounds.xy) / environmentVisibilityBounds.zw;
    if (any(lessThan(uv,vec2(0.0))) || any(greaterThanEqual(uv,vec2(1.0)))) return 0.0;
    return step(.5,texture2D(environmentVisibility,uv).r);
  }
`;

/** One nearest-filtered texel per game fog cell: no interpolation into hidden terrain. */
export function environmentFogPixels(settings: Settings) {
  const grid = Math.max(1, settings.fog?.grid ?? 50);
  const x = Math.floor((settings.mapX ?? 0) / grid), y = Math.floor((settings.mapY ?? 0) / grid);
  const width = Math.max(1, Math.ceil(((settings.mapX ?? 0) + settings.mapWidth) / grid) - x);
  const height = Math.max(1, Math.ceil(((settings.mapY ?? 0) + settings.mapHeight) / grid) - y);
  // Fail closed on pathological map dimensions; never allocate an unbounded texture.
  if (width > 2048 || height > 2048) return {data: new Uint8Array(1), width: 1, height: 1, bounds: [x*grid,y*grid,width*grid,height*grid]};
  const data = new Uint8Array(width * height);
  if (!settings.fog) data.fill(255);
  else for (const cell of settings.fog.revealed) {
    const [col,row] = cell.split(',').map(Number);
    const cx = col-x, cy = row-y;
    if (Number.isInteger(cx) && Number.isInteger(cy) && cx>=0 && cy>=0 && cx<width && cy<height) data[cy*width+cx] = 255;
  }
  return {data, width, height, bounds: [x*grid,y*grid,width*grid,height*grid]};
}

export function createEnvironmentVisibility() {
  const texture = new DataTexture(new Uint8Array([255]),1,1,RedFormat);
  texture.minFilter=texture.magFilter=NearestFilter; texture.generateMipmaps=false; texture.needsUpdate=true;
  const uniforms = {environmentVisibility: {value:texture}, environmentVisibilityBounds: {value:new Vector4()}, environmentFogEnabled:{value:0}};
  let key = '';
  return {uniforms,
    update(settings: Settings) {
      const next=JSON.stringify([settings.mapX,settings.mapY,settings.mapWidth,settings.mapHeight,settings.fog]);
      if(next===key)return; key=next;
      const pixels=environmentFogPixels(settings);
      // Dispose the GPU allocation before changing dimensions (Three textures are immutable after use).
      texture.dispose(); texture.image={data:pixels.data,width:pixels.width,height:pixels.height}; texture.needsUpdate=true;
      uniforms.environmentVisibilityBounds.value.fromArray(pixels.bounds);
      uniforms.environmentFogEnabled.value=settings.fog?1:0;
    },
    dispose(){texture.dispose();},
  };
}
