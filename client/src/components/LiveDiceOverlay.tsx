import {diceFlightPoint,diceFlightKeyframes,DIE_FLASH_MS,DIE_REVEAL_MS} from '../lib/diceFlightPosition';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {useStore} from '../state/socket';
import {diceThemeForRoll} from '../../../shared/diceThemes';
import type {LiveDiceFrame} from '../../../shared/liveDiceTypes';
import {LIVE_DICE_PRESENTATION_RATE} from '../../../shared/liveDiceTypes';
import {dieResultEmphasis,dieResultTier,dieResultLabel,type Toss} from '../lib/diceTrayTypes';
import {liveDieResult} from '../../../shared/liveDieResult';
import './PhysicsDiceTray.css';
import {createDiceSound,rollingSpeeds} from '../lib/diceSfx';
import {metresPerUnitFor} from '../../../shared/diceImpacts';

/** Render authoritative poses with a short interpolation buffer. No local physics,
 * face reassignment, trajectory retry, or client-generated result. */
export function LiveDiceOverlay(){
 const frame=useStore(s=>s.liveDice)!;
 const canvas=useRef<HTMLCanvasElement>(null),root=useRef<HTMLDivElement>(null);
 const boxes=useRef<(HTMLSpanElement|null)[]>([]),flights=useRef<(HTMLSpanElement|null)[]>([]);
 const saveLabels=useRef<(HTMLSpanElement|null)[]>([]);
 const [arrived,setArrived]=useState<number[]>([]),[failed,setFailed]=useState(false),[prepared,setPrepared]=useState(false);
 const [bonusesShown,setBonusesShown]=useState(false);
 useEffect(()=>{
   setBonusesShown(false);
   if(!frame.saveDice||!frame.done||(!failed&&arrived.length<frame.sides.length))return;
   const timer=setTimeout(()=>setBonusesShown(true),550);return()=>clearTimeout(timer);
 },[frame.id,frame.done,arrived.length,failed]);
 const theme=diceThemeForRoll(frame.className,frame.dmDice,frame.affinity);
 const viewer=useStore.getState(),character=viewer.snapshot?.characters.find(c=>c.name===frame.roller);
 const own=viewer.snapshot?.role==='dm'?(frame.roller==='DM'||!!character&&!character.claimedBy):character?.claimedBy===viewer.socket?.id;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const frames=useRef<{at:number;frame:LiveDiceFrame}[]>([]);
 // Dice sounds for this roll: the server publishes each frame's real strikes.
 // The canvas draws ~80 ms behind the newest frame and physics runs at the
 // presentation rate, so each strike is scheduled to land with its picture.
 const sound=useRef<{id:string;player:ReturnType<typeof createDiceSound>}>();
 useEffect(()=>()=>{sound.current?.player.stop();},[]);
 useEffect(()=>{
  if(sound.current?.id!==frame.id){sound.current?.player.stop();sound.current={id:frame.id,player:createDiceSound(frame.sides)};}
  const player=sound.current.player,previous=frames.current.at(-1)?.frame;
  const viewer=useStore.getState(),character=viewer.snapshot?.characters.find(c=>c.name===frame.roller);
  const own=viewer.snapshot?.role==='dm'?(frame.roller==='DM'||!!character&&!character.claimedBy):character?.claimedBy===viewer.socket?.id;
  if(frame.impacts?.length)player.impacts(own?frame.impacts:frame.impacts.map(i=>({...i,x:-i.x})),
   i=>.08+(i.t-frame.elapsed)/LIVE_DICE_PRESENTATION_RATE);
  if(previous?.id===frame.id&&frame.elapsed>previous.elapsed&&!frame.rerolls.some((n,i)=>n!==previous.rerolls[i]))
   player.rolling(rollingSpeeds(previous.poses,frame.poses,frame.elapsed-previous.elapsed,frame.radius,metresPerUnitFor(frame.radius)));
  if(frame.done)player.stop();
 },[frame]);
 useEffect(()=>{
  const list=frames.current,at=performance.now();if(list[0]?.frame.id!==frame.id)list.length=0;
  // The initial pose predates graphics preparation. Anchor it to actual launch,
  // otherwise interpolation stretches the first spin across the loading delay.
  if(frame.elapsed>0&&list.length&&list.every(f=>f.frame.elapsed===0))
   list.forEach(f=>{f.at=at-frame.elapsed*1000/LIVE_DICE_PRESENTATION_RATE;});
  list.push({at,frame});if(list.length>12)list.shift();
 },[frame]);
 useEffect(()=>{
  let stopped=false,raf=0,renderer:ReturnType<typeof import('../lib/diceTrayRenderer').createTrayRenderer>|undefined;
  setArrived([]);setFailed(false);setPrepared(false);
  const animations:Animation[]=[];const launched=new Map<number,number>();let finalTrayDrawn=false,readySent=false,resultsStartedAt:number|undefined;
  const viewPose=(poses:number[])=>own?poses:poses.map((v,i)=>{
    // Same physical world viewed from the other side of the table.
    const offset=i-i%7;
    return i%7===0||i%7===1?-v:i%7===3?-poses[offset+4]:i%7===4?poses[offset+3]:i%7===5?poses[offset+6]:i%7===6?-poses[offset+5]:v;
  });
  const toss:Toss={settleTimes:[],wallHits:0,frames:new Float32Array(frame.sides.length*14),frameCount:2,step:1,radius:frame.radius,trayScale:frame.trayScale,topFaces:frame.sides.map(()=>0),duration:1};
  void (async()=>{
   const module=await import('../lib/diceTrayRenderer');const art=await module.loadTrayTexture(theme.id);
   if(stopped){art?.dispose();return;}
   renderer=module.createTrayRenderer(frame.sides.map((sides,index)=>({sides,value:1,index,set:frame.sets[index],crit:frame.critical[index],tens:frame.percentile[index]==='tens',ones:frame.percentile[index]==='ones'})),toss,theme,undefined,art,true);
   const node=canvas.current!,ctx=node.getContext('2d')!;
   const width=node.clientWidth||600;
   await Promise.all([
    reduced?Promise.resolve():renderer.prepare(width,width*10.2/15.2,Math.min(2,devicePixelRatio||1)),
    ...Array.from(root.current!.parentElement!.getAnimations()).map(a=>a.finished.catch(()=>{})),
   ]);
   if(stopped)return;
   setPrepared(true);
   const draw=(now:number)=>{
    if(stopped)return;
    const list=frames.current,target=now-80;
    let a=list[0],b=list[list.length-1];
    for(let i=1;i<list.length;i++){if(list[i].at>=target){a=list[i-1];b=list[i];break;}a=list[i];}
    if(a&&b){
     // A reroll is an intentional new throw, not interpolation through the floor.
     const reset=b.frame.rerolls.some((n,i)=>n!==a.frame.rerolls[i]);
     toss.frames.set(viewPose(reset?b.frame.poses:a.frame.poses),0);toss.frames.set(viewPose(b.frame.poses),b.frame.poses.length);
     const alpha=reset||a===b?1:Math.max(0,Math.min(1,(target-a.at)/(b.at-a.at)));
     const width=node.clientWidth||600,height=width*10.2/15.2,dpr=Math.min(2,devicePixelRatio||1);
     if(node.width!==Math.round(width*dpr)){node.width=Math.round(width*dpr);node.height=Math.round(height*dpr);}
     renderer!.setKeptSet(b.frame.done?b.frame.kept:undefined);
     const finalWasDrawn=finalTrayDrawn;
     if(!reduced&&!finalTrayDrawn){renderer!.draw(ctx,width,height,dpr,alpha,now);node.dataset.physicsElapsed=String(a.frame.elapsed+(b.frame.elapsed-a.frame.elapsed)*alpha);finalTrayDrawn=b.frame.done&&alpha===1;}
     if(b.frame.saveDice){
       const rect=root.current!.getBoundingClientRect(),c=node.getBoundingClientRect();
       saveLabels.current.forEach((el,i)=>{if(!el)return;const p=renderer!.numberPosition(i),pos=diceFlightPoint(rect,root.current!.clientWidth,c.left+p.x*c.width,c.top+p.y*c.height);el.style.left=`${pos.x}px`;el.style.top=`${pos.y-25}px`;});
     }
     if(!readySent){readySent=true;useStore.getState().socket?.emit('dice:ready',{id:frame.id});}
     if(b.frame.done&&(finalWasDrawn||reduced)){
       // Start on the frame AFTER the final WebGL draw has painted. Otherwise
       // GPU work can consume the flash and make every stagger launch at once.
       resultsStartedAt??=now;
       const elapsedSinceDone=now-resultsStartedAt;
       launched.forEach((at,i)=>{const flight=flights.current[i];if(flight?.dataset.phase==='flash'&&now-at>=DIE_FLASH_MS)flight.dataset.phase='flying';});
       b.frame.values.forEach((_,i)=>{
         if(launched.has(i)||elapsedSinceDone<i*80)return;
         launched.set(i,now);
         const flight=flights.current[i],box=boxes.current[i];
         if(reduced||!flight||!box){setArrived(old=>[...old,i]);return;}
         const rect=root.current!.getBoundingClientRect(),c=node.getBoundingClientRect(),dest=box.querySelector('strong')!.getBoundingClientRect(),p=renderer!.numberPosition(i);
         const source=diceFlightPoint(rect,root.current!.clientWidth,c.left+p.x*c.width,c.top+p.y*c.height);
         const destination=diceFlightPoint(rect,root.current!.clientWidth,dest.left+dest.width/2,dest.top+dest.height/2);
         const {x:sx,y:sy}=source,{x:tx,y:ty}=destination;
         flight.dataset.faceScreenX=String(c.left+p.x*c.width);flight.dataset.faceScreenY=String(c.top+p.y*c.height);
         const keyframes=diceFlightKeyframes(sx,sy,tx,ty,dieResultEmphasis(liveDieResult(b.frame,i)));
         flight.dataset.boxScreenX=String(dest.left+dest.width/2);flight.dataset.boxScreenY=String(dest.top+dest.height/2);
         flight.dataset.phase='flash';
         const animation=flight.animate(keyframes,{duration:DIE_REVEAL_MS,easing:'linear'});
         animations.push(animation);animation.finished.then(()=>{if(!stopped)setArrived(old=>[...old,i]);}).catch(()=>{});
       });
     }
    }
    raf=requestAnimationFrame(draw);
   };raf=requestAnimationFrame(draw);
  })().catch(()=>{if(!stopped){setFailed(true);useStore.getState().socket?.emit('dice:ready',{id:frame.id});}});
  return()=>{stopped=true;cancelAnimationFrame(raf);animations.forEach(a=>a.cancel());renderer?.dispose();};
 },[frame.id]);
 const value=(i:number)=>{const v=frame.values[i];return v===null?'?':frame.percentile[i]==='tens'?String((v-1)*10).padStart(2,'0'):frame.percentile[i]==='ones'?v-1:v;};
 const tier=(i:number)=>dieResultTier(liveDieResult(frame,i));
 const saveResult=(i:number)=>{
   const save=frame.saveDice?.[i];if(!save||!frame.done||(!arrived.includes(i)&&!failed))return undefined;
   const indices=frame.saveDice!.flatMap((s,j)=>s.group===save.group?[j]:[]);
   const faces=indices.map(j=>frame.values[j]??0),face=save.mode==='dis'?Math.min(...faces):Math.max(...faces);
   if(indices.length>1&&i!==indices[faces.indexOf(face)])return {calculation:'',outcome:'Discarded'};
   const modifier=save.modifier??0,total=face+modifier;return {calculation:save.hideModifiers?'':`${face} ${modifier>=0?'+':'−'} ${Math.abs(modifier)} = ${total}`,outcome:bonusesShown?(save.rollKind==='initiative'?save.hideModifiers?'Initiative rolled':`Initiative ${total}`:(save.outcome??(!save.autoFail&&save.dc!==undefined&&total>=save.dc?'pass':'fail')).toUpperCase()):save.hideModifiers?'Resolving…':'Adding bonuses…'};
 };
 const saveBonus=(i:number)=>{
   const result=saveResult(i),save=frame.saveDice![i],visible=!!result;
   return <span className="tray-save-outcome" data-outcome={result?.outcome} data-bonus-phase={visible?(bonusesShown?'complete':'adding'):'waiting'}>
     {!save.hideModifiers&&<><small>{save.rollKind==='initiative'?'Initiative bonus':'Save bonus'} <em>{visible?`${(save.modifier??0)>=0?'+':'−'}${Math.abs(save.modifier??0)}`:'\u00a0'}</em></small>
     <span className="tray-save-equation">{bonusesShown?result?.calculation:'\u00a0'}</span></>}
     <b>{result?.outcome||'\u00a0'}</b>
     {bonusesShown&&result?.outcome!=='Discarded'&&(save.passEffect||save.failEffect)&&<small>{result?.outcome==='PASS'?save.passEffect:save.failEffect}</small>}
   </span>;
 };
 const resultStyle=(i:number)=>{
  const strength=dieResultEmphasis(liveDieResult(frame,i));
  return {'--roll-strength':strength,'--arrival-scale':1.12+strength*.5,'--arrival-glow':`${5+Math.pow(strength,3)*28}px`} as CSSProperties;
 };
 return <div className="roll-reveal-backdrop" data-live-dice="true" data-roll-id={frame.id}><div className="roll-reveal" role="status" aria-label="Live dice roll">
  <div className="roll-reveal-title">{frame.label}</div>
  <div className="roll-reveal-who">{frame.roller}{frame.target&&<span className="rr-arrow"> &rarr; {frame.target}</span>}</div>
  <div ref={root} className="physics-dice-tray" data-status={frame.done?'settled':'rolling'} data-theme={theme.id} data-entry-side={own?'bottom':'top'} data-mode={frame.mode} data-material={failed?'unavailable':!prepared?'loading':theme.id==='sorcerer'?'volumetric-glass':theme.id==='fighter'?'obsidian-gold':theme.id==='ranger'?'forest-resin':theme.id.startsWith('dm-')?'purple-resin':theme.id} role="group" aria-label="Live dice tray">
   <canvas className="dice-tray-canvas" ref={canvas} aria-label="Server dice rolling live"/>
   {frame.saveDice&&<div className="tray-save-labels" aria-hidden="true">{frame.saveDice.map((save,i)=><span key={i} ref={el=>{saveLabels.current[i]=el;}} className="tray-save-label">{save.label}{save.mode?` ${save.mode.toUpperCase()}`:''}</span>)}</div>}
   {(failed||reduced)&&<div className="dice-tray-status">{failed?'Live roll - graphics unavailable':'Live roll in progress'}</div>}
   <div className="tray-number-flights" aria-hidden="true">{frame.sides.map((_,i)=><span key={i} ref={el=>{flights.current[i]=el;}} style={resultStyle(i)} data-die-id={i} data-set={frame.sets[i]} data-strength={tier(i)} data-tone={frame.critical[i]?'critical':frame.done&&frame.mode?(frame.sets[i]===frame.kept?'kept':'discarded'):'normal'} className={`tray-flying-number${frame.critical[i]?' critical':''}`}><span className="tray-number-flash"/>{value(i)}</span>)}</div>
   <div className="dice-tray-results">{frame.sides.map((side,i)=><span ref={el=>{boxes.current[i]=el;}} className={`tray-die-result${frame.critical[i]?' critical':''}`} data-die-id={i} data-sides={side} data-value={frame.values[i]??undefined} data-set={frame.sets[i]} data-result={frame.done&&frame.mode?(frame.sets[i]===frame.kept?'kept':'discarded'):'rolling'} data-critical={!!frame.critical[i]} data-theme={theme.id} data-orientation={arrived.includes(i)||failed?'settled':'rolling'} aria-label={`d${side}: ${arrived.includes(i)||failed?value(i):'rolling'}`} data-filled={arrived.includes(i)||failed} data-strength={tier(i)} style={{...resultStyle(i),...(frame.done&&frame.mode?{borderColor:frame.sets[i]===frame.kept?'#39ef87':'#ff5365',boxShadow:`0 0 6px ${frame.sets[i]===frame.kept?'#39ef87':'#ff5365'}`} : {})}} key={i}>{frame.saveDice?.[i]&&<small className="tray-save-name">{frame.saveDice[i].label}</small>}{frame.percentile[i]?`d100 ${frame.percentile[i]}`:`d${side}`}<strong>{arrived.includes(i)||failed?value(i):'?'}</strong><small className="tray-max-label" style={{visibility:(arrived.includes(i)||failed)&&!!dieResultLabel(liveDieResult(frame,i))?'visible':'hidden'}} aria-hidden={!((arrived.includes(i)||failed)&&!!dieResultLabel(liveDieResult(frame,i)))}>{dieResultLabel(liveDieResult(frame,i))}</small>{frame.saveDice?.[i]&&saveBonus(i)}{frame.rerolls[i]>0&&<small>Rerolled {frame.rerolls[i]} times</small>}</span>)}</div>
  </div>
  <div className="muted">{frame.done?'Dice settled':frame.rerolls.some(n=>n>0)?'Rerolling unreadable dice...':'Rolling...'}</div>
 </div></div>;
}
