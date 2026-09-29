import {
  FramebufferTexture, Mesh, NoBlending, OrthographicCamera, PlaneGeometry,
  Scene, ShaderLib, ShaderMaterial, type Texture, type WebGLRenderer,
} from 'three';

/** Keep the existing opaque-body depth/alpha mask, and identify personal bodies
 * in its red channel. Shared awareness has its own depth-correct overlay. */
export function createMiniatureVisibilityMaterial() {
  const material = new ShaderMaterial({
    uniforms: { personal: { value: 1 } },
    vertexShader: ShaderLib.basic.vertexShader,
    fragmentShader: 'uniform float personal; void main(){gl_FragColor=vec4(personal,1.,1.,1.);}',
    toneMapped: false,
  });
  material.onBeforeRender = (_renderer, _scene, _camera, _geometry, object) => {
    material.uniforms.personal.value = object.layers.isEnabled(4) ? 0 : 1;
    material.uniformsNeedUpdate = true;
  };
  return material;
}

/** Restore only visible body pixels where terrain fog covers raised geometry.
 * Copy the finished framebuffer, including its lighting and volumetric mist;
 * no second model render, new WebGL context, asset load or CPU pixel readback.
 * The original full scene is then restored to the ordinary ground canvas. */
export function createMiniatureVisionLift(renderer: WebGLRenderer, host: HTMLElement, mask: Texture) {
  const canvas = document.createElement('canvas');
  canvas.dataset.testid = 'personal-sight-miniatures';
  canvas.style.cssText = 'display:none;position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;mask-image:var(--player-vision-cover)';
  host.parentElement?.appendChild(canvas);
  const context = canvas.getContext('2d')!;
  const scene = new Scene(), camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let frame: FramebufferTexture | undefined;
  const material = new ShaderMaterial({
    uniforms: { frame: { value: null }, bodyMask: { value: mask }, extract: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    // Framebuffer data already has the renderer's tone mapping and output color
    // conversion. Copy it verbatim, without converting either a second time.
    fragmentShader: `uniform sampler2D frame, bodyMask; uniform float extract; varying vec2 vUv;
      void main(){vec4 c=texture2D(frame,vUv);vec4 m=texture2D(bodyMask,vUv);
        gl_FragColor=c*mix(1.,m.r*m.a,extract);}`,
    depthTest: false, depthWrite: false, toneMapped: false, blending: NoBlending,
  });
  const geometry = new PlaneGeometry(2, 2);
  scene.add(new Mesh(geometry, material));
  return {
    render(enabled: boolean) {
      canvas.style.display = enabled ? 'block' : 'none';
      if (!enabled) return;
      const { width, height } = renderer.domElement;
      if (!frame || canvas.width !== width || canvas.height !== height) {
        frame?.dispose(); frame = new FramebufferTexture(width, height);
        material.uniforms.frame.value = frame;
        canvas.width = width; canvas.height = height;
      }
      renderer.copyFramebufferToTexture(frame);
      material.uniforms.extract.value = 1;
      renderer.render(scene, camera);
      context.clearRect(0, 0, width, height);
      context.drawImage(renderer.domElement, 0, 0);
      material.uniforms.extract.value = 0;
      renderer.render(scene, camera);
    },
    dispose() { canvas.remove(); frame?.dispose(); material.dispose(); geometry.dispose(); },
  };
}
