import {useContext,useEffect,useRef,useState} from 'react';
import {DiceThemeContext} from './ThreeDie';
import {physicalDice,type TrayDie,type Toss,type DiceEntrySide} from '../lib/diceTrayTypes';
import './PhysicsDiceTray.css';
import type {RollComparison} from '../../../shared/types';
export function PhysicsDiceTray({dice,onSettled,label='Dice tray',comparison,rollKey,entrySide='bottom'}:{dice:TrayDie[];onSettled:(index:number,set:number)=>void;label?:string;comparison?:RollComparison;rollKey?:string;entrySide?:DiceEntrySide}){
  const theme=useContext(DiceThemeContext),canvas=useRef<HTMLCanvasElement>(null),callback=useRef(onSettled);callback.current=onSettled;
  const key=JSON.stringify(dice),[status,setStatus]=useState<'loading'|'rolling'|'settled'|'fallback'>('loading');
  useEffect(()=>{
    let dead=false,raf=0,renderer:ReturnType<typeof import('../lib/diceTrayRenderer').createTrayRenderer>|undefined;
    let worker:Worker|undefined;
    const expanded=physicalDice(JSON.parse(key));let completed=false;
    setStatus('loading');
    const complete=()=>{if(dead||completed)return;completed=true;dice.forEach(d=>callback.current(d.index,d.set));};
    const fallback=()=>{if(dead)return;setStatus('fallback');complete();};
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    if(expanded.length>40||expanded.some(d=>![4,6,8,10,12,20].includes(d.sides))){setStatus('fallback');queueMicrotask(complete);return()=>{dead=true;};}
    if(media.matches){setStatus('settled');queueMicrotask(complete);return()=>{dead=true;};}
    const timeout=setTimeout(()=>{worker?.terminate();fallback();},20000);
    try{
      worker=new Worker(new URL('../lib/dicePhysics.worker.ts',import.meta.url),{type:'module'});
      worker.onerror=()=>{clearTimeout(timeout);worker?.terminate();fallback();};
      worker.onmessage=async(event:MessageEvent<{toss?:Toss;error?:string}>)=>{
        clearTimeout(timeout);worker?.terminate();
        if(dead)return;if(!event.data.toss){fallback();return;}
        try{
          const module=await import('../lib/diceTrayRenderer');if(dead)return;
          const art=await module.loadTrayTexture(theme.id);if(dead){art?.dispose();return;}
          const toss=event.data.toss;renderer=module.createTrayRenderer(expanded,toss,theme,comparison?.kept,art);
          const node=canvas.current!,ctx=node.getContext('2d');if(!ctx){fallback();return;}
          let elapsed=0,previous=performance.now();setStatus('rolling');
          const draw=(now:number)=>{
            if(dead)return;
            if(!document.hidden)elapsed+=Math.min(.05,(now-previous)/1000);previous=now;
            const width=node.clientWidth||600,height=width*10.2/15.2,dpr=Math.min(2,devicePixelRatio||1);
            if(node.width!==Math.round(width*dpr)){node.width=Math.round(width*dpr);node.height=Math.round(height*dpr);}
            try{renderer!.draw(ctx,width,height,dpr,Math.min(elapsed,toss.duration),now);}catch{fallback();return;}
            node.dataset.wallHits=String(toss.wallHits);node.dataset.elapsed=elapsed.toFixed(3);node.dataset.duration=toss.duration.toFixed(3);
            if(elapsed>=toss.duration){setStatus('settled');complete();return;}
            raf=requestAnimationFrame(draw);
          };raf=requestAnimationFrame(draw);
        }catch{fallback();}
      };
      const seed=new Uint32Array(1);crypto.getRandomValues(seed);
      if(rollKey){seed[0]=2166136261;for(const char of rollKey)seed[0]=Math.imul(seed[0]^char.charCodeAt(0),16777619)>>>0;}
      worker.postMessage({dice:expanded,seed:seed[0],entrySide});
    }catch{fallback();}
    return()=>{dead=true;clearTimeout(timeout);worker?.terminate();cancelAnimationFrame(raf);renderer?.dispose();};
  },[key,theme,rollKey,comparison?.kept,entrySide]);
  const expanded=physicalDice(dice),landed=status==='settled'||status==='fallback';
  return <div className="physics-dice-tray" data-entry-side={entrySide} data-status={status} data-theme={theme.id} data-material={status==='loading'?'loading':theme.id==='sorcerer'?'volumetric-glass':theme.id==='fighter'?'obsidian-gold':'forest-resin'} role="group" aria-label={label}>
    <canvas ref={canvas} className="dice-tray-canvas" aria-label="Overhead physics dice tray"/>
    {status==='loading'&&<div className="dice-tray-status">Preparing toss…</div>}
    {status==='fallback'&&<div className="dice-tray-status">Roll result · 3D tray unavailable</div>}
    <div className={`dice-tray-results${comparison?' rr-comparison':''}`} data-mode={comparison?.mode} aria-live="polite">
      {(comparison?comparison.sets.map((_,i)=>i):[0]).map(set=><div key={set} className={comparison?'rr-candidate':'tray-result-group'} data-candidate={set} data-result={landed?(set===comparison?.kept?'kept':'discarded'):'rolling'}>
        {comparison&&<div className="rr-candidate-label">{landed?(set===comparison.kept?(comparison.mode==='adv'?'Kept - higher':'Kept - lower'):'Discarded'):`Roll ${set+1}`}</div>}
        {expanded.filter(d=>d.set===set).map((d,i)=><span key={i} className={`tray-die-result${d.crit?' critical':''}`} data-sides={d.sides} data-value={d.value} data-critical={!!d.crit} data-theme={theme.id} data-set={d.set} data-orientation={landed?'settled':'rolling'} aria-label={`d${d.sides}: ${landed?d.value:'rolling'}`}>
          {d.negative?'-':''}{d.tens?'d100 tens':d.ones?'d100 ones':`d${d.sides}`} <strong>{landed?(d.tens?String(d.value).padStart(2,'0'):d.value):'?'}</strong>{d.crit&&<small className="tray-critical-label">Critical die</small>}
        </span>)}
        {comparison?.kind==='dice'&&<div className="rr-candidate-total">{landed?`Set total ${comparison.sets[set].total}`:'Rolling?'}</div>}
      </div>)}
    </div>
  </div>;
}
