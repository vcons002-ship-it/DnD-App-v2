import {it,expect} from 'vitest';
import {decipherBenchmarkRecommendation,runHardwareBenchmark,type HardwareBenchmarkMeasurements} from './hardwareBenchmark';

const base:HardwareBenchmarkMeasurements={
  cpuThreads:16,
  deviceMemoryGb:32,
  pixelRatio:2,
  clientCpuGeometryMs:2.4,
  clientCanvas2dMs:1.1,
  webglAvailable:true,
  webglVersion:2,
  gpuRenderer:'ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)',
  gpuVendor:'Google Inc. (NVIDIA)',
  maxTextureSize:16384,
  gpuFrameMs:1.8,
  sameHost:true,
  pingMs:0.8,
  serverGeometryMs:1.9,
  serverRasterMs:2.5,
  serverThreads:16,
  clientDecodeMs:1.2,
};

it('recommends High 3D + Server Assist On + 3D dice when running on a high-end server host PC',()=>{
  const rec=decipherBenchmarkRecommendation(base);
  expect(rec).toMatchObject({legacy:false,quality:'high',serverRendering:true,dicePreference:'3d'});
});

it('recommends High 3D + Server Assist Off on a fast remote gaming PC when network RTT exceeds local CPU compute',()=>{
  const rec=decipherBenchmarkRecommendation({...base,sameHost:false,clientCpuGeometryMs:2.8,pingMs:42,serverGeometryMs:2.0});
  expect(rec).toMatchObject({legacy:false,quality:'high',serverRendering:false,dicePreference:'3d'});
});

it('recommends Balanced 3D + Server Assist On on a remote laptop with moderate GPU and slower CPU',()=>{
  const rec=decipherBenchmarkRecommendation({...base,sameHost:false,cpuThreads:8,gpuRenderer:'ANGLE (AMD, Radeon RX 6600M)',gpuFrameMs:22.0,clientCpuGeometryMs:26.0,pingMs:14,serverGeometryMs:2.1});
  expect(rec).toMatchObject({legacy:false,quality:'balanced',serverRendering:true,dicePreference:'3d'});
});

it('recommends Low 3D on an integrated GPU that completes the shader pass under 20 ms',()=>{
  const rec=decipherBenchmarkRecommendation({...base,sameHost:false,cpuThreads:4,gpuRenderer:'Intel(R) Iris(R) Xe Graphics',gpuFrameMs:34.0,clientCpuGeometryMs:28.0,pingMs:18});
  expect(rec).toMatchObject({legacy:false,quality:'low',serverRendering:true,dicePreference:'3d'});
});

it('recommends Legacy mode + Server Assist On + 2D dice when WebGL is unavailable or software-rendered',()=>{
  const noWebgl=decipherBenchmarkRecommendation({...base,webglAvailable:false,webglVersion:0,gpuRenderer:'WebGL disabled or unsupported',gpuFrameMs:null});
  expect(noWebgl).toMatchObject({legacy:true,quality:'legacy',serverRendering:true,dicePreference:'2d'});
  const swiftShader=decipherBenchmarkRecommendation({...base,gpuRenderer:'Google SwiftShader',gpuFrameMs:6.0});
  expect(swiftShader).toMatchObject({legacy:true,quality:'legacy',serverRendering:true,dicePreference:'2d'});
});

it('executes the end-to-end benchmark probe and returns valid measurements and recommendation',async()=>{
  const stages:string[]=[];
  const result=await runHardwareBenchmark(s=>stages.push(s));
  expect(stages.length).toBeGreaterThanOrEqual(3);
  expect(result.measurements.clientCpuGeometryMs).toBeGreaterThan(0);
  expect(['high','balanced','low','off','legacy']).toContain(result.recommendation.quality);
});


it('cross-compares Legacy without Server Assist against 2D WebGL with Server Assist and picks the faster combo',()=>{
  // Case A: Slow client CPU (38ms raycast, 24ms canvas -> Legacy Assist Off = 115.2ms), modest GPU (24ms stress pass -> ~10.8ms 2D WebGL), fast LAN server (2ms geo, 2ms ping -> 2D Assist On = 14.8ms).
  const win2dAssist=decipherBenchmarkRecommendation({...base,sameHost:false,gpuRenderer:'Intel(R) UHD Graphics 620',gpuFrameMs:46,clientCpuGeometryMs:38,clientCanvas2dMs:24,pingMs:2,serverGeometryMs:2,serverRasterMs:8,clientDecodeMs:4});
  expect(win2dAssist).toMatchObject({legacy:false,quality:'off',serverRendering:true,dicePreference:'2d'});
  expect(win2dAssist.comboEstimates?.standard2dAssistOnMs).toBeLessThan(win2dAssist.comboEstimates!.legacyAssistOffMs);

  // Case B: Very fast client CPU & 2D Canvas (2.5ms raycast, 1.5ms canvas -> Legacy Assist Off = 7.5ms), borderline slow GPU (26ms stress pass -> 11.7ms 2D WebGL), high WAN RTT (90ms -> 2D Assist On = 103.7ms).
  const winLegacyLocal=decipherBenchmarkRecommendation({...base,sameHost:false,gpuRenderer:'Intel(R) HD Graphics 520',gpuFrameMs:48,clientCpuGeometryMs:2.5,clientCanvas2dMs:1.5,pingMs:90,serverGeometryMs:2,serverRasterMs:4,clientDecodeMs:2});
  expect(winLegacyLocal).toMatchObject({legacy:true,quality:'legacy',serverRendering:false,dicePreference:'2d'});
  expect(winLegacyLocal.comboEstimates?.legacyAssistOffMs).toBeLessThan(winLegacyLocal.comboEstimates!.standard2dAssistOnMs!);
});
