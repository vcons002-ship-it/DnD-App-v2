import {useEffect,useState,type ReactNode} from 'react';
import {useEnvironmentQuality,readStandardGraphicsQuality} from '../lib/useEnvironmentQuality';
import {setServerRendering} from '../lib/useServerRendering';
import {useDiceRendering} from '../lib/useDiceRendering';
import {runHardwareBenchmark,type HardwareBenchmarkResult} from '../lib/hardwareBenchmark';
import {ServerRenderingControl} from './ServerRenderingControl';
import {DiceRenderingControl} from './DiceRenderingControl';

export function HardwareBenchmarkPanel({compact=false,onResult,onApplyAndStart}:{compact?:boolean;onResult?:(r:HardwareBenchmarkResult)=>void;onApplyAndStart?:(r:HardwareBenchmarkResult['recommendation'])=>void}){
 const {setQuality}=useEnvironmentQuality();
 const {setPreference:setDicePreference}=useDiceRendering();
 const [benchmarking,setBenchmarking]=useState(false);
 const [benchmarkStage,setBenchmarkStage]=useState('');
 const [benchmarkResult,setBenchmarkResult]=useState<HardwareBenchmarkResult|null>(null);
 const handleRunBenchmark=async()=>{
   if(benchmarking)return;
   setBenchmarking(true);
   try{
     const result=await runHardwareBenchmark(stage=>setBenchmarkStage(stage));
     setBenchmarkResult(result);
     onResult?.(result);
   }finally{
     setBenchmarking(false);
     setBenchmarkStage('');
   }
 };
 const applyRecommendation=(rec:HardwareBenchmarkResult['recommendation'])=>{
   setQuality(rec.quality);
   setServerRendering(rec.serverRendering);
   setDicePreference(rec.dicePreference);
 };
 const rec=benchmarkResult?.recommendation;
 const m=benchmarkResult?.measurements;
 return <section className="rendering-benchmark" aria-label="Hardware benchmark">
   <div className="rendering-benchmark-header">
     <div>
       <strong>Hardware &amp; Server Assist Benchmark</strong>
       <small>Tests this browser’s CPU raycasting, WebGL 3D/shadow GPU throughput, and server worker round-trip latency to decipher the best mode + Server Assist combo.</small>
     </div>
     <button type="button" className="btn" aria-label="Run hardware benchmark" disabled={benchmarking} onClick={()=>void handleRunBenchmark()}>
       {benchmarking?(benchmarkStage||'Running benchmark…'):(benchmarkResult?'Re-run hardware benchmark':'Run hardware benchmark')}
     </button>
   </div>
   {benchmarkResult&&rec&&m&&<div className="rendering-benchmark-result" data-testid="benchmark-recommendation">
     <div className="rendering-benchmark-summary">
       <span className="rendering-benchmark-badge">Recommended combo</span>
       <strong>{rec.summary}</strong>
     </div>
     <ul className="rendering-benchmark-reasons">
       {rec.reasons.map((r,i)=><li key={i}>{r}</li>)}
     </ul>
     <div className="rendering-benchmark-metrics">
       <span><strong>GPU:</strong> {m.gpuRenderer} ({m.gpuFrameMs!==null?`${m.gpuFrameMs} ms/frame · ~${Math.min(240,Math.round(1000/Math.max(0.5,m.gpuFrameMs)))} FPS`:'Unavailable'})</span>
       <span><strong>Client CPU:</strong> {m.cpuThreads} threads · {m.clientCpuGeometryMs} ms raycast · {m.clientCanvas2dMs} ms 2D canvas</span>
       <span><strong>Server &amp; Network:</strong> {m.sameHost?'Same PC as server (localhost)':'Remote client'}{m.pingMs!==null?` · ${m.pingMs} ms RTT`:''}{m.serverGeometryMs!==null?` · ${m.serverGeometryMs} ms server worker (${m.serverThreads??'?'} threads)`:''}</span>
     </div>
     <div className="rendering-benchmark-actions">
       {onApplyAndStart&&<button type="button" className="btn big" onClick={()=>onApplyAndStart(rec)}>
         Apply &amp; start ({rec.legacy?'Legacy mode':`3D ${rec.quality==='off'?'Effects off':rec.quality} mode`}, Assist {rec.serverRendering?'On':'Off'})
       </button>}
       <button type="button" className={compact?'btn tiny':'btn'} onClick={()=>applyRecommendation(rec)}>
         {onApplyAndStart?'Apply to controls':`Apply recommended (${rec.legacy?'Legacy':`3D ${rec.quality==='off'?'Effects off':rec.quality}`}, Assist ${rec.serverRendering?'On':'Off'})`}
       </button>
     </div>
   </div>}
 </section>;
}

/** Available before joining, before any optional scene can start loading. */
export function LegacyModeControl({toolbar=false}:{toolbar?:boolean}={}){
 const {quality,setQuality}=useEnvironmentQuality();
 return <><label className="legacy-mode-control"><input type="checkbox" checked={quality==='legacy'} onChange={e=>setQuality(e.target.checked?'legacy':readStandardGraphicsQuality())}/>Legacy mode <small>For older CPUs and integrated graphics. Only changes this browser.</small></label><ServerRenderingControl/>{!toolbar&&<DiceRenderingControl/>}</>;
}
export function RenderingModeClass(){
 const {budget}=useEnvironmentQuality();
 useEffect(()=>{document.documentElement.dataset.renderMode=budget.legacy?'legacy':'standard';},[budget.legacy]);
 return null;
}

export const RENDERING_STARTUP_KEY='dnd.rendering-started';
export function RenderingStartupGate({children}:{children:ReactNode}){
 const {quality,setQuality}=useEnvironmentQuality();
 const {setPreference:setDicePreference}=useDiceRendering();
 const [ready,setReady]=useState(()=>{try{return sessionStorage.getItem(RENDERING_STARTUP_KEY)==='1';}catch{return false;}});
 const [benchmarkResult,setBenchmarkResult]=useState<HardwareBenchmarkResult|null>(null);
 const start=(legacy:boolean)=>{
   setQuality(legacy?'legacy':quality==='legacy'?readStandardGraphicsQuality():quality);
   try{sessionStorage.setItem(RENDERING_STARTUP_KEY,'1');}catch{}
   setReady(true);
 };
 const applyAndStart=(rec:HardwareBenchmarkResult['recommendation'])=>{
   setQuality(rec.quality);
   setServerRendering(rec.serverRendering);
   setDicePreference(rec.dicePreference);
   try{sessionStorage.setItem(RENDERING_STARTUP_KEY,'1');}catch{}
   setReady(true);
 };
 if(ready)return <>{children}</>;
 const rec=benchmarkResult?.recommendation;
 return <main className="rendering-startup" aria-label="Choose rendering mode">
   <h1>Choose how to run this browser</h1>
   <p>Choose before loading a campaign. DMs and players can use different modes at the same table.</p>
   <ServerRenderingControl/>
   <DiceRenderingControl/>
   <HardwareBenchmarkPanel onResult={setBenchmarkResult} onApplyAndStart={applyAndStart}/>
   <div className="rendering-startup-options">
     <section className={rec?.legacy===true?'recommended':undefined}>
       <h2>Legacy mode {rec?.legacy===true&&<span className="rendering-benchmark-badge">Recommended</span>}</h2>
       <p>For older CPUs and integrated graphics. Flat tokens and lightweight maps, with animated movement and basic visibility. Dice can use 3D graphics or lightweight 2D animation.</p>
       <p>Includes wall and light editing, fog, targeting and all game rules.</p>
       <button className="btn big" onClick={()=>start(true)}>Start in legacy mode</button>
     </section>
     <section className={rec?.legacy===false?'recommended':undefined}>
       <h2>3D / standard mode {rec?.legacy===false&&<span className="rendering-benchmark-badge">Recommended</span>}</h2>
       <p>3D figures, detailed lighting, animated effects and dice. Graphics quality can be adjusted for this computer.</p>
       <p>Existing token and graphics preferences are retained.</p>
       <button className="btn big" onClick={()=>start(false)}>Start in 3D mode</button>
     </section>
   </div>
   <small>Saved preference: {quality==='legacy'?'Legacy':`3D / standard (${quality})`}. You can change modes from the map toolbar or graphics settings.</small>
 </main>;
}
