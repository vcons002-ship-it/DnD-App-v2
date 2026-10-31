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
  const rec=decipherBenchmarkRecommendation({...base,sameHost:false,cpuThreads:8,gpuRenderer:'ANGLE (AMD, Radeon RX 6600M)',gpuFrameMs:8.5,clientCpuGeometryMs:11.2,pingMs:14,serverGeometryMs:2.1});
  expect(rec).toMatchObject({legacy:false,quality:'balanced',serverRendering:true,dicePreference:'3d'});
});

it('recommends Low 3D on an integrated GPU that completes the shader pass under 20 ms',()=>{
  const rec=decipherBenchmarkRecommendation({...base,sameHost:false,cpuThreads:4,gpuRenderer:'Intel(R) Iris(R) Xe Graphics',gpuFrameMs:15.4,clientCpuGeometryMs:14.0,pingMs:18});
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
