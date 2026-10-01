import {diceFlightPoint,diceFlightKeyframes,DIE_FLASH_MS,DIE_REVEAL_MS} from '../lib/diceFlightPosition';
import {useContext,useEffect,useRef,useState,type CSSProperties} from 'react';
import {DiceThemeContext} from './ThreeDie';
import {physicalDice,diceRevealTimes,dieResultEmphasis,dieResultTier,dieResultLabel,type TrayDie,type Toss,type DiceEntrySide} from '../lib/diceTrayTypes';
import './PhysicsDiceTray.css';
import {createDiceSound,rollingSpeeds} from '../lib/diceSfx';
import {metresPerUnitFor} from '../../../shared/diceImpacts';
import type {RollComparison} from '../../../shared/types';
// Presentation pacing only; the precomputed gravity/contact simulation is unchanged.
const ROLL_PLAYBACK_RATE=.6;
export function PhysicsDiceTray({dice,onSettled,label='Dice tray',comparison,rollKey,entrySide='bottom'}:{dice:TrayDie[];onSettled:(index:number,set:number)=>void;label?:string;comparison?:RollComparison;rollKey?:string;entrySide?:DiceEntrySide}){
  const resultStyle=(d:TrayDie)=>({'--roll-strength':dieResultEmphasis(d),'--arrival-scale':1.12+dieResultEmphasis(d)*.5,'--arrival-glow':`${5+Math.pow(dieResultEmphasis(d),3)*28}px`} as CSSProperties);
  const theme=useContext(DiceThemeContext),canvas=useRef<HTMLCanvasElement>(null),callback=useRef(onSettled);callback.current=onSettled;
  const root=useRef<HTMLDivElement>(null), flights=useRef<(HTMLSpanElement|null)[]>([]), boxes=useRef<(HTMLSpanElement|null)[]>([]);
  const [arrived,setArrived]=useState<number[]>([]);
  const key=JSON.stringify(dice),[status,setStatus]=useState<'loading'|'rolling'|'settled'|'fallback'>('loading');
  useEffect(()=>{
    let dead=false,raf=0,renderer:ReturnType<typeof import('../lib/diceTrayRenderer').createTrayRenderer>|undefined;
    let worker:Worker|undefined;
    let sound:ReturnType<typeof createDiceSound>|undefined;
    const flightAnimations:Animation[]=[];
    const expanded=physicalDice(JSON.parse(key));let completed=false;
    setStatus('loading');setArrived([]);
    flights.current.forEach(el=>{if(el){el.style.opacity='0';delete el.dataset.phase;}});
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
          const delivered=new Set<number>(),launched=new Set<number>();
          let finalTrayDrawn=false;
          const revealTimes=diceRevealTimes(toss.settleTimes,ROLL_PLAYBACK_RATE);
          const finishAt=Math.max(toss.duration/ROLL_PLAYBACK_RATE,...revealTimes.map(t=>t+.85));
          let elapsed=0,previous=performance.now();setStatus('rolling');
          // Sound follows the recorded simulation: strikes as playback passes
          // them, and each die's rumble from its own speed in the frames.
          sound=createDiceSound(expanded.map(d=>d.sides));
          const bodies=expanded.length,metres=metresPerUnitFor(toss.radius),impacts=toss.impacts??[];
          let heard=-1;
          const pose=(frame:number)=>toss.frames.subarray(frame*bodies*7,(frame+1)*bodies*7);
          const draw=(now:number)=>{
            if(dead)return;
            if(!document.hidden)elapsed+=Math.min(.05,(now-previous)/1000);previous=now;
            const width=node.clientWidth||600,height=width*10.2/15.2,dpr=Math.min(2,devicePixelRatio||1);
            if(node.width!==Math.round(width*dpr)){node.width=Math.round(width*dpr);node.height=Math.round(height*dpr);}
            try{
              if(!finalTrayDrawn){
                renderer!.draw(ctx,width,height,dpr,Math.min(elapsed*ROLL_PLAYBACK_RATE,toss.duration),now);
                finalTrayDrawn=elapsed*ROLL_PLAYBACK_RATE>=toss.duration;
              }
            }catch{fallback();return;}
            const simNow=Math.min(elapsed*ROLL_PLAYBACK_RATE,toss.duration);
            if(sound){
              const due=impacts.filter(i=>i.t>heard&&i.t<=simNow);
              if(due.length)sound.impacts(due,()=>0);
              heard=simNow;
              const frame=Math.min(toss.frameCount-1,Math.floor(simNow/toss.step)),back=Math.max(0,frame-8);
              if(frame>back)sound.rolling(rollingSpeeds(pose(back),pose(frame),(frame-back)*toss.step,toss.radius,metres));
              if(simNow>=toss.duration){sound.stop();sound=undefined;}
            }
            node.dataset.playbackRate=String(ROLL_PLAYBACK_RATE);node.dataset.simulationElapsed=(elapsed*ROLL_PLAYBACK_RATE).toFixed(3);
            node.dataset.wallHits=String(toss.wallHits);node.dataset.elapsed=elapsed.toFixed(3);node.dataset.duration=toss.duration.toFixed(3);
            const starting=expanded.map((_,i)=>i).filter(i=>!launched.has(i)&&elapsed>=revealTimes[i]);
            // Only measure when a flight starts. Its destination never follows
            // a pulsing number's transformed bounds or another result's arrival.
            if(starting.length){
              const bounds=root.current!.getBoundingClientRect(),canvasBounds=node.getBoundingClientRect();
              const targets=starting.map(i=>boxes.current[i]?.querySelector('strong')?.getBoundingClientRect());
              starting.forEach((i,j)=>{
                const flight=flights.current[i],target=targets[j];if(!flight||!target)return;
                launched.add(i);
                const source=renderer!.numberPosition(i);
                const {x:sx,y:sy}=diceFlightPoint(bounds,root.current!.clientWidth,canvasBounds.left+source.x*canvasBounds.width,canvasBounds.top+source.y*canvasBounds.height);
                const {x:tx,y:ty}=diceFlightPoint(bounds,root.current!.clientWidth,target.left+target.width/2,target.top+target.height/2);
                const frames=diceFlightKeyframes(sx,sy,tx,ty,dieResultEmphasis(expanded[i]));
                flight.dataset.phase='flash';
                // Transform/opacity run on the compositor, independently of WebGL.
                const animation=flight.animate(frames,{duration:DIE_REVEAL_MS,easing:'linear'});
                flightAnimations.push(animation);
                animation.finished.then(()=>{
                  if(dead)return;
                  delivered.add(i);setArrived([...delivered]);flight.dataset.phase='arrived';
                }).catch(()=>{}); // cancellation during dismissal/unmount
              });
            }
            expanded.forEach((_,i)=>{
              const flight=flights.current[i];
              if(flight?.dataset.phase==='flash'&&elapsed-revealTimes[i]>=DIE_FLASH_MS/1000)flight.dataset.phase='flying';
            });
            if(elapsed>=finishAt&&delivered.size===expanded.length){setStatus('settled');complete();return;}
            raf=requestAnimationFrame(draw);
          };raf=requestAnimationFrame(draw);
        }catch{fallback();}
      };
      const seed=new Uint32Array(1);crypto.getRandomValues(seed);
      if(rollKey){seed[0]=2166136261;for(const char of rollKey)seed[0]=Math.imul(seed[0]^char.charCodeAt(0),16777619)>>>0;}
      worker.postMessage({dice:expanded,seed:seed[0],entrySide});
    }catch{fallback();}
    return()=>{dead=true;sound?.stop();clearTimeout(timeout);worker?.terminate();cancelAnimationFrame(raf);flightAnimations.forEach(a=>a.cancel());renderer?.dispose();};
  },[key,theme,rollKey,comparison?.kept,entrySide]);
  const expanded=physicalDice(dice),landed=status==='settled'||status==='fallback';
  return <div ref={root} className="physics-dice-tray" data-entry-side={entrySide} data-status={status} data-theme={theme.id} data-material={status==='loading'?'loading':theme.id==='sorcerer'?'volumetric-glass':theme.id==='fighter'?'obsidian-gold':'forest-resin'} role="group" aria-label={label}>
    <canvas ref={canvas} className="dice-tray-canvas" aria-label="Overhead physics dice tray"/>
    {status==='loading'&&<div className="dice-tray-status">Preparing toss…</div>}
    {status==='fallback'&&<div className="dice-tray-status">Roll result · 3D tray unavailable</div>}
    <div className="tray-number-flights" aria-hidden="true">
      {expanded.map((d,i)=><span key={i} ref={el=>{flights.current[i]=el;}} style={resultStyle(d)} data-strength={dieResultTier(d)} className={`tray-flying-number${d.crit?' critical':''}`} data-die-id={i} data-set={d.set} data-tone={d.negative?'discarded':d.crit?'critical':comparison?(d.set===comparison.kept?'kept':'discarded'):'normal'}>{d.tens?String(d.value).padStart(2,'0'):d.value}</span>)}
    </div>
    <div className={`dice-tray-results${comparison?' rr-comparison':''}`} data-mode={comparison?.mode} aria-live="polite">
      {(comparison?comparison.sets.map((_,i)=>i):[0]).map(set=><div key={set} className={comparison?'rr-candidate':'tray-result-group'} data-candidate={set} data-result={landed?(set===comparison?.kept?'kept':'discarded'):'rolling'}>
        {comparison&&<div className="rr-candidate-label">{landed?(set===comparison.kept?(comparison.mode==='adv'?'Kept - higher':'Kept - lower'):'Discarded'):`Roll ${set+1}`}</div>}
        {expanded.map((d,i)=>({d,i})).filter(({d})=>d.set===set).map(({d,i})=>{const filled=landed||arrived.includes(i);return <span key={i} ref={el=>{boxes.current[i]=el;}} data-die-id={i} data-filled={filled} data-strength={dieResultTier(d)} style={resultStyle(d)} className={`tray-die-result${d.crit?' critical':''}`} data-sides={d.sides} data-value={d.value} data-critical={!!d.crit} data-theme={theme.id} data-set={d.set} data-orientation={filled?'settled':'rolling'} aria-label={`d${d.sides}: ${filled?d.value:'rolling'}`}>
          {d.negative?'-':''}{d.tens?'d100 tens':d.ones?'d100 ones':`d${d.sides}`} <strong>{filled?(d.tens?String(d.value).padStart(2,'0'):d.value):'?'}</strong><small className="tray-max-label" style={{visibility:filled&&!!dieResultLabel(d)?'visible':'hidden'}} aria-hidden={!(filled&&!!dieResultLabel(d))}>{dieResultLabel(d)}</small>{d.crit&&<small className="tray-critical-label">Critical die</small>}
        </span>;})}
        {comparison?.kind==='dice'&&<div className="rr-candidate-total">{landed?`Set total ${comparison.sets[set].total}`:'Rolling?'}</div>}
      </div>)}
    </div>
  </div>;
}
