import {createLegacyVisionGeometry} from '../../../shared/legacyVision';
import {SIGHT_EXTENT} from '../../../shared/mapWalls';
import {visionShowsAffinity,type PlayerVision} from '../../../shared/playerVision';
import type {EnvironmentQuality} from '../../../shared/mapEnvironment';
import type {DiceRenderingPreference} from './useDiceRendering';

export interface HardwareBenchmarkMeasurements {
  cpuThreads: number;
  deviceMemoryGb: number | null;
  pixelRatio: number;
  clientCpuGeometryMs: number;
  clientCanvas2dMs: number;
  webglAvailable: boolean;
  webglVersion: 2 | 1 | 0;
  gpuRenderer: string;
  gpuVendor: string;
  maxTextureSize: number;
  gpuFrameMs: number | null;
  sameHost: boolean;
  pingMs: number | null;
  serverGeometryMs: number | null;
  serverRasterMs: number | null;
  serverThreads: number | null;
  clientDecodeMs: number | null;
}

export interface HardwareBenchmarkRecommendation {
  legacy: boolean;
  quality: EnvironmentQuality;
  serverRendering: boolean;
  dicePreference: DiceRenderingPreference;
  summary: string;
  reasons: string[];
  comboEstimates?: {
    legacyAssistOffMs: number;
    legacyAssistOnMs: number | null;
    standard2dAssistOffMs: number | null;
    standard2dAssistOnMs: number | null;
  };
}

export interface HardwareBenchmarkResult {
  measurements: HardwareBenchmarkMeasurements;
  recommendation: HardwareBenchmarkRecommendation;
}

const SOFTWARE_GPU_PATTERN = /swiftshader|llvmpipe|softpipe|microsoft basic render|software|virtualbox|vmware/i;
const INTEGRATED_GPU_PATTERN = /intel.*(uhd|hd graphics|iris)|radeon\(tm\) graphics|vega [0-9]|adreno|mali-|powervr/i;
const DISCRETE_GPU_PATTERN = /rtx|gtx|radeon rx|arc a[0-9]|quadro|firepro|apple m[1-9]\s*(pro|max|ultra)/i;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function measureClientCpuGeometry(): number {
  const walls = Array.from({length: 28}, (_, i) => ({ id: `bw-${i}`, ax: 80 + (i % 7) * 140, ay: 60 + Math.floor(i / 7) * 160, bx: 160 + (i % 7) * 140, by: 110 + Math.floor(i / 7) * 160 }));









  const lights = Array.from({length: 12}, (_, i) => ({ id: `bl-${i}`, x: 120 + (i % 4) * 220, y: 100 + Math.floor(i / 4) * 200, radius: 180, height: 30, strength: 1, carried: i === 0 }));








  const tokens = Array.from({length: 40}, (_, i) => ({ id: `bt-${i}`, x: 90 + (i % 8) * 110, y: 80 + Math.floor(i / 8) * 110 }));




  const samples: number[] = [];
  for (let pass = 0; pass < 5; pass++) {
    const geometry = createLegacyVisionGeometry();
    const ox = 185 + pass * 17;
    const oy = 195 + pass * 13;
    const vision: PlayerVision = {
      rangeFt: 60,
      radius: 300,
      heavy: true,
      daylight: false,
      origins: [{id: 'bench-pc', x: ox, y: oy}],
      lights,
      walls,
    };
    const t0 = performance.now();
    geometry(vision, true);
    for (const o of vision.origins) {
      geometry.points(o, SIGHT_EXTENT, walls);
      geometry.points(o, vision.radius, walls);
    }
    for (const l of lights) {
      geometry.points(l, SIGHT_EXTENT, walls);
    }
    for (const t of tokens) {
      visionShowsAffinity(vision, t.x, t.y);
    }
    samples.push(performance.now() - t0);
  }
  return Number(median(samples).toFixed(2));
}

function measureClientCanvas2d(): number {
  if (typeof document === 'undefined') return 5;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 15;
  const samples: number[] = [];
  for (let pass = 0; pass < 4; pass++) {
    const t0 = performance.now();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#12151e';
    ctx.fillRect(0, 0, 1024, 768);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 24; i++) {
      const x = 120 + ((i * 97 + pass * 31) % 780);
      const y = 100 + ((i * 67 + pass * 19) % 560);
      const grad = ctx.createRadialGradient(x, y, 8, x, y, 120);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, 120, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.getImageData(512, 384, 1, 1);
    samples.push(performance.now() - t0);
  }
  canvas.width = 1;
  canvas.height = 1;
  return Number(median(samples).toFixed(2));
}

function measureWebGlGpu(): {
  webglAvailable: boolean;
  webglVersion: 2 | 1 | 0;
  gpuRenderer: string;
  gpuVendor: string;
  maxTextureSize: number;
  gpuFrameMs: number | null;
} {
  if (typeof document === 'undefined') {
    return {webglAvailable: false, webglVersion: 0, gpuRenderer: 'Unavailable', gpuVendor: 'Unavailable', maxTextureSize: 0, gpuFrameMs: null};
  }
  const canvas = document.createElement('canvas');
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  canvas.width = Math.min(1920, Math.max(800, Math.round(((typeof window !== 'undefined' ? window.innerWidth : 1280) || 1280) * dpr)));
  canvas.height = Math.min(1080, Math.max(600, Math.round(((typeof window !== 'undefined' ? window.innerHeight : 720) || 720) * dpr)));
  const attrs: WebGLContextAttributes = {powerPreference: 'high-performance', antialias: true, depth: true, stencil: false};
  const gl2 = canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
  const gl = (gl2 ?? canvas.getContext('webgl', attrs)) as WebGLRenderingContext | WebGL2RenderingContext | null;
  if (!gl) {
    return {webglAvailable: false, webglVersion: 0, gpuRenderer: 'WebGL disabled or unsupported', gpuVendor: 'None', maxTextureSize: 0, gpuFrameMs: null};
  }
  const webglVersion: 2 | 1 = gl2 ? 2 : 1;
  let gpuRenderer = String(gl.getParameter(gl.RENDERER) ?? 'WebGL GPU');
  let gpuVendor = String(gl.getParameter(gl.VENDOR) ?? 'WebGL Vendor');
  let maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 4096);
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      gpuRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || gpuRenderer);
      gpuVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || gpuVendor);
    }
    const vsSource = `
      attribute vec3 aPos;
      attribute vec3 aNormal;
      uniform float uTime;
      varying vec3 vPos;
      varying vec3 vNormal;
      void main() {
        float angle = uTime + aPos.z * 0.25;
        float c = cos(angle), s = sin(angle);
        vec3 p = vec3(aPos.x * c - aPos.y * s, aPos.x * s + aPos.y * c, aPos.z);
        vPos = p;
        vNormal = normalize(aNormal);
        gl_Position = vec4(p.xy, fract(aPos.z * 0.13) * 0.8 - 0.4, 1.0);
      }
    `;
    const fsSource = `
      precision highp float;
      varying vec3 vPos;
      varying vec3 vNormal;
      uniform float uTime;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 acc = vec3(0.04, 0.05, 0.07);
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          vec3 lPos = vec3(sin(fi * 1.7 + uTime) * 0.75, cos(fi * 2.3 - uTime) * 0.75, 0.35 + 0.15 * sin(fi));
          vec3 d = lPos - vPos;
          float dist2 = dot(d, d) + 0.04;
          vec3 lDir = normalize(d);
          float ndl = max(dot(n, lDir), 0.0);
          float shadow = 0.0;
          for (int tap = 0; tap < 4; tap++) {
            float ft = float(tap) * 0.015;
            shadow += step(0.15, fract(sin(dot(vPos.xy + vec2(ft, -ft), vec2(12.9898, 78.233))) * 43758.5453));
          }
          acc += ( vec3(0.95, 0.68, 0.38) * ndl / dist2 ) * (shadow * 0.25) * 0.08;
        }
        gl_FragColor = vec4(acc / (1.0 + acc), 1.0);
      }
    `;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const triCount = 36000;
    const verts = new Float32Array(triCount * 3 * 6);
    let ptr = 0;
    for (let i = 0; i < triCount; i++) {
      const gx = ((i % 240) / 120) - 1;
      const gy = (Math.floor(i / 240) / 75) - 1;
      const gz = (i % 16) * 0.05;
      for (let v = 0; v < 3; v++) {
        const vx = gx + (v === 1 ? 0.035 : v === 2 ? -0.02 : 0);
        const vy = gy + (v === 2 ? 0.035 : -0.015);
        verts[ptr++] = vx;
        verts[ptr++] = vy;
        verts[ptr++] = gz;
        verts[ptr++] = vx;
        verts[ptr++] = vy;
        verts[ptr++] = 1;
      }
    }
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aNormal = gl.getAttribLocation(prog, 'aNormal');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.DEPTH_TEST);

    const pixel = new Uint8Array(4);
    const samples: number[] = [];
    for (let frame = 0; frame < 7; frame++) {
      const t0 = performance.now();
      gl.clearColor(0.05, 0.06, 0.08, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uTime, frame * 0.17);
      gl.drawArrays(gl.TRIANGLES, 0, triCount * 3);
      gl.finish();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const elapsed = performance.now() - t0;
      if (frame >= 2) samples.push(elapsed);
    }
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return {
      webglAvailable: true,
      webglVersion,
      gpuRenderer,
      gpuVendor,
      maxTextureSize,
      gpuFrameMs: Number(median(samples).toFixed(2)),
    };
  } catch {
    return {webglAvailable: false, webglVersion, gpuRenderer, gpuVendor, maxTextureSize, gpuFrameMs: null};
  } finally {
    try {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
    canvas.width = 1;
    canvas.height = 1;
  }
}

async function measureServerAndNetwork(): Promise<{
  pingMs: number | null;
  serverGeometryMs: number | null;
  serverRasterMs: number | null;
  serverThreads: number | null;
  clientDecodeMs: number | null;
}> {
  try {
    // Warm connection + measure steady-state HTTP RTT
    await fetch('/api/health', {cache: 'no-store', signal: AbortSignal.timeout(5000)});
    const pings: number[] = [];
    for (let i = 0; i < 2; i++) {
      const t0 = performance.now();
      const r = await fetch('/api/health', {cache: 'no-store', signal: AbortSignal.timeout(5000)});
      if (r.ok) pings.push(performance.now() - t0);
    }
    const pingMs = pings.length ? Number(Math.min(...pings).toFixed(2)) : null;

    const res = await fetch('/api/rendering-benchmark', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
    if (!res.ok) {
      return {pingMs, serverGeometryMs: null, serverRasterMs: null, serverThreads: null, clientDecodeMs: null};
    }
    const data = await res.json() as {
      serverGeometryMs?: number;
      serverRasterMs?: number;
      serverThreads?: number;
      samplePngBase64?: string;
    };
    let clientDecodeMs: number | null = null;
    if (data.samplePngBase64 && typeof Image !== 'undefined') {
      const tDecode = performance.now();
      const img = new Image();
      img.decoding = 'async';
      img.src = `data:image/png;base64,${data.samplePngBase64}`;
      await img.decode();
      clientDecodeMs = Number((performance.now() - tDecode).toFixed(2));
    }
    return {
      pingMs,
      serverGeometryMs: typeof data.serverGeometryMs === 'number' ? data.serverGeometryMs : null,
      serverRasterMs: typeof data.serverRasterMs === 'number' ? data.serverRasterMs : null,
      serverThreads: typeof data.serverThreads === 'number' ? data.serverThreads : null,
      clientDecodeMs,
    };
  } catch {
    return {pingMs: null, serverGeometryMs: null, serverRasterMs: null, serverThreads: null, clientDecodeMs: null};
  }
}

export function decipherBenchmarkRecommendation(m: HardwareBenchmarkMeasurements): HardwareBenchmarkRecommendation {
  const reasons: string[] = [];
  const isSoftwareGpu = SOFTWARE_GPU_PATTERN.test(m.gpuRenderer);
  const isDiscreteGpu = DISCRETE_GPU_PATTERN.test(m.gpuRenderer);
  const isIntegratedGpu = !isDiscreteGpu && INTEGRATED_GPU_PATTERN.test(m.gpuRenderer);

  // 1. Determine Graphics Mode & Quality Tier
  let quality: EnvironmentQuality;
  let dicePreference: DiceRenderingPreference;

  if (!m.webglAvailable || isSoftwareGpu || m.gpuFrameMs === null || m.gpuFrameMs > 28 || m.clientCpuGeometryMs > 45) {
    quality = 'legacy';
    dicePreference = '2d';
    if (!m.webglAvailable || isSoftwareGpu) {
      reasons.push(`WebGL hardware acceleration is unavailable (${m.gpuRenderer}); Legacy mode avoids 3D shaders and WebGL context overhead.`);
    } else if (m.gpuFrameMs !== null && m.gpuFrameMs > 28) {
      reasons.push(`3D shader/shadow pass took ${m.gpuFrameMs} ms/frame (~${Math.round(1000 / m.gpuFrameMs)} FPS) on ${m.gpuRenderer}; Legacy mode keeps map navigation responsive.`);
    } else {
      reasons.push(`Single-thread CPU raycasting took ${m.clientCpuGeometryMs} ms; Legacy mode throttles background updates to keep the UI responsive.`);
    }
  } else if (m.gpuFrameMs <= 5.5 && m.clientCpuGeometryMs <= 12 && !isIntegratedGpu && m.cpuThreads >= 6) {
    quality = 'high';
    dicePreference = '3d';
    reasons.push(`Fast discrete GPU (${m.gpuRenderer}, ${m.gpuFrameMs} ms/frame in 12-light shadow stress test) and ${m.cpuThreads} CPU threads easily sustain High 3D quality.`);
  } else if (m.gpuFrameMs <= 12 && m.clientCpuGeometryMs <= 20) {
    quality = 'balanced';
    dicePreference = '3d';
    reasons.push(`GPU completed the 3D lighting & shadow stress pass in ${m.gpuFrameMs} ms/frame on ${m.gpuRenderer}; Balanced 3D mode keeps smooth frame pacing with reduced-polygon distant figures.`);
  } else if (m.gpuFrameMs <= 20) {
    quality = 'low';
    dicePreference = '3d';
    reasons.push(`GPU frame time (${m.gpuFrameMs} ms/frame on ${m.gpuRenderer}) suits Low 3D quality (floor shadows, 1x pixel ratio, and coarse LOD miniatures).`);
  } else {
    quality = 'off';
    dicePreference = '2d';
    reasons.push(`GPU supports WebGL (${m.gpuFrameMs} ms/frame on ${m.gpuRenderer}) for hardware-composited sight/fog, but disabling extra environment effects and using 2D dice avoids frame drops.`);
  }

  let legacy = quality === 'legacy';
  const serverAvailable = m.serverGeometryMs !== null && m.pingMs !== null;
  const legacyAssistOffMs = Number((m.clientCpuGeometryMs * 2.4 + m.clientCanvas2dMs).toFixed(1));
  const legacyAssistOnMs = serverAvailable ? Number((m.serverGeometryMs! + (m.serverRasterMs ?? 4) + m.pingMs! + (m.clientDecodeMs ?? 2) + m.clientCanvas2dMs * 0.35).toFixed(1)) : null;
  const standard2dAssistOffMs = m.webglAvailable && !isSoftwareGpu && m.gpuFrameMs !== null ? Number((m.clientCpuGeometryMs + m.gpuFrameMs * 0.45).toFixed(1)) : null;
  const standard2dAssistOnMs = serverAvailable && m.webglAvailable && !isSoftwareGpu && m.gpuFrameMs !== null ? Number((m.serverGeometryMs! + m.pingMs! + m.gpuFrameMs * 0.45).toFixed(1)) : null;
  const comboEstimates = {legacyAssistOffMs, legacyAssistOnMs, standard2dAssistOffMs, standard2dAssistOnMs};

  // 2. Determine Server Assist (Server Managed Rendering)
  let serverRendering = true; let crossCompared = false;
  // Cross-compare 2D WebGL (Effects off) vs Legacy 2D Canvas across Server Assist On/Off when in the 2D tier.
  if ((quality === 'off' || (quality === 'legacy' && m.webglAvailable && !isSoftwareGpu && m.gpuFrameMs !== null && m.gpuFrameMs <= 28)) && standard2dAssistOffMs !== null) {
    const candidates: {q: 'off' | 'legacy'; assist: boolean; cost: number; label: string}[] = [
      {q: 'legacy', assist: false, cost: legacyAssistOffMs, label: `Legacy Assist Off (${legacyAssistOffMs} ms)`},
      {q: 'off', assist: false, cost: standard2dAssistOffMs, label: `2D WebGL Assist Off (${standard2dAssistOffMs} ms)`},
    ];
    if (legacyAssistOnMs !== null && standard2dAssistOnMs !== null) {
      candidates.push(
        {q: 'legacy', assist: true, cost: legacyAssistOnMs, label: `Legacy Assist On (${legacyAssistOnMs} ms)`},
        {q: 'off', assist: true, cost: standard2dAssistOnMs, label: `2D WebGL Assist On (${standard2dAssistOnMs} ms)`},
      );
    }
    candidates.sort((a, b) => a.cost - b.cost);
    const best = candidates[0];
    quality = best.q;
    legacy = quality === 'legacy';
    serverRendering = best.assist; crossCompared = true;
    reasons.push(`Cross-compared 2D & Legacy combos: ${candidates.map(c => c.label).join(' vs ')} → ${best.label} is fastest.`);
  }

  if (crossCompared) { /* selected by 4-way 2D vs Legacy cross-comparison */ } else if (!serverAvailable) {
    serverRendering = legacy;
    reasons.push('Server benchmark endpoint was unreachable; defaulting Server Assist based on local mode.');
  } else {
    const serverGeoMs = m.serverGeometryMs!;
    const serverRasterMs = m.serverRasterMs ?? 4;
    const pingMs = m.pingMs!;
    const decodeMs = m.clientDecodeMs ?? 2;

    if (legacy) {
      // In Legacy mode, local rendering must both raycast and rasterize masks/sprites on the client CPU.
      const localLegacyEstimateMs = m.clientCpuGeometryMs * 2.4 + m.clientCanvas2dMs;
      const serverLegacyEstimateMs = serverGeoMs + serverRasterMs + pingMs + decodeMs;
      if (pingMs > 240 && m.clientCpuGeometryMs < 8 && localLegacyEstimateMs < serverLegacyEstimateMs) {
        serverRendering = false;
        reasons.push(`High network latency (${pingMs} ms RTT) exceeds local CPU visibility cost (${m.clientCpuGeometryMs} ms); local rendering will respond faster.`);
      } else {
        serverRendering = true;
        reasons.push(`Server Assist On offloads Legacy mask & token sprite rasterization (${serverGeoMs + serverRasterMs} ms on ${m.serverThreads ?? 'multi'}-thread server, ${pingMs} ms RTT) from this browser.`);
      }
    } else if (m.sameHost) {
      // Client is running on the same PC as the server.
      // Server Assist runs wall/light outline raycasts on background Node worker threads while skipping 2D sprites for 3D miniatures.
      if ((m.serverThreads ?? m.cpuThreads) >= 6 && serverGeoMs <= m.clientCpuGeometryMs * 1.75) {
        serverRendering = true;
        reasons.push(`Running on the same PC as the server (${m.serverThreads ?? m.cpuThreads} threads): Server Assist On offloads wall/light raycasts (${serverGeoMs} ms) to background server workers while skipping duplicate 2D sprites for 3D tokens.`);
      } else {
        serverRendering = false;
        reasons.push((m.serverThreads ?? m.cpuThreads) < 6 ? `Running on the same PC as a core-constrained server (${m.serverThreads ?? m.cpuThreads} threads): Server Assist Off avoids competing for local CPU threads.` : `Running on the same PC as the server: local CPU raycast (${m.clientCpuGeometryMs} ms) outpaced busy server workers (${serverGeoMs} ms), so Server Assist Off avoids queuing.`);
      }
    } else {
      // Remote client in Standard/3D mode.
      const remoteAssistRoundTripMs = serverGeoMs + pingMs;
      if (m.clientCpuGeometryMs <= 6.5 && pingMs > 25 && remoteAssistRoundTripMs > m.clientCpuGeometryMs * 2.2) {
        serverRendering = false;
        reasons.push(`Remote client has a fast local CPU (${m.clientCpuGeometryMs} ms visibility raycast) vs ${pingMs} ms network RTT (${remoteAssistRoundTripMs.toFixed(1)} ms assisted round-trip); Server Assist Off gives lower token-movement latency.`);
      } else {
        serverRendering = true;
        reasons.push(`Server Assist On leverages the server's ${m.serverThreads ?? 'multi'}-thread worker pool (${serverGeoMs} ms compute, ${pingMs} ms RTT) vs ${m.clientCpuGeometryMs} ms on this client's main thread.`);
      }
    }
  }

  const modeLabel = legacy ? 'Legacy mode' : `3D / standard mode (${quality === 'off' ? 'Effects off' : quality[0].toUpperCase() + quality.slice(1)} quality)`;
  const assistLabel = `Server managed rendering: ${serverRendering ? 'On' : 'Off'}`;
  const diceLabel = `${dicePreference.toUpperCase()} dice`;

  return {
    legacy,
    quality,
    serverRendering,
    dicePreference,
    summary: `${modeLabel} · ${assistLabel} · ${diceLabel}`,
    reasons,
    comboEstimates,
  };
}

export async function runHardwareBenchmark(onProgress?: (stage: string) => void): Promise<HardwareBenchmarkResult> {
  onProgress?.('Testing local CPU visibility & wall raycasting…');
  await new Promise(resolve => setTimeout(resolve, 16));
  const clientCpuGeometryMs = measureClientCpuGeometry();
  const clientCanvas2dMs = measureClientCanvas2d();

  onProgress?.('Testing local GPU 3D lighting & shadow shaders…');
  await new Promise(resolve => setTimeout(resolve, 16));
  const gpu = measureWebGlGpu();

  onProgress?.('Testing server assist worker speed & network latency…');
  const server = await measureServerAndNetwork();

  const sameHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & {deviceMemory?: number}) : undefined;
  const measurements: HardwareBenchmarkMeasurements = {
    cpuThreads: nav?.hardwareConcurrency || 4,
    deviceMemoryGb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
    pixelRatio: typeof window !== 'undefined' ? Number((window.devicePixelRatio || 1).toFixed(2)) : 1,
    clientCpuGeometryMs,
    clientCanvas2dMs,
    ...gpu,
    sameHost,
    ...server,
  };

  const recommendation = decipherBenchmarkRecommendation(measurements);
  return {measurements, recommendation};
}
