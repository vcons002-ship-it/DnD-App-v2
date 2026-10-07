import {createTrayRenderer,loadTrayTexture} from '../lib/diceTrayRenderer';
import {diceThemeForClass,diceThemeForRoll} from '../../../shared/diceThemes';
import {createLiveWorld} from '../../../shared/liveDicePhysics';
import {LIVE_DICE_PRESENTATION_RATE} from '../../../shared/liveDiceTypes';
import {physicalDice,type Toss} from '../../../shared/diceTrayTypes';
import {metresPerUnitFor} from '../../../shared/diceImpacts';

const names=['Druk','Varis','Vanec','DM'];
const materials=['Molten obsidian & gold','Forest resin, wood & bronze','Red glass, lightning & silver','Purple resin, flowing ink & gold'];
const themes=[diceThemeForClass('Fighter'),diceThemeForClass('Ranger'),diceThemeForClass('Sorcerer'),diceThemeForRoll('',true)];
const tray=document.querySelector<HTMLDivElement>('#tray')!;
const canvas=tray.querySelector('canvas')!,ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLSpanElement>('#status')!;
const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];
const roller=document.querySelector<HTMLSelectElement>('#roller')!;
const count=document.querySelector<HTMLInputElement>('#count')!;
const rangerLook=document.querySelector<HTMLSelectElement>('#ranger-look')!;
const requestedLook=new URLSearchParams(location.search).get('ranger');
rangerLook.value=requestedLook&&['vine','amber','moss','resin'].includes(requestedLook)?requestedLook:'resin';
const results=document.querySelector<HTMLDivElement>('.results')!;
let sides=6,seed=2026100600,epoch=0;
let renderer:ReturnType<typeof createTrayRenderer>|undefined;
let world:ReturnType<typeof createLiveWorld>|undefined;
let toss:Toss|undefined;
let labels:HTMLDivElement[]=[],last=performance.now(),done=true;

async function roll(next=sides){
 count.max=String(next===100?20:40);
 if(!count.reportValidity())return;
 const quantity=Number(count.value),player=Number(roller.value),current=++epoch;
 const moss=rangerLook.value==='moss',amber=rangerLook.value==='amber';
 materials[1]=amber?'Enchanted amber, fern inclusions, wood & bronze | Woodland wake':moss?'Moss agate, wood & bronze | Windblown woodland wake':rangerLook.value==='resin'?'Original forest resin, wood & bronze | Woodland wake':'Forest resin, wood & bronze | Vine trail';
 sides=next;done=false;tray.dataset.state='preparing';
 buttons.forEach(b=>{b.disabled=true;if(b.dataset.sides)b.setAttribute('aria-pressed',String(Number(b.dataset.sides)===sides));});
 roller.disabled=count.disabled=rangerLook.disabled=true;
 status.textContent=`Preparing ${names[player]}'s ${quantity}d${sides}...`;
 renderer?.dispose();renderer=undefined;world=undefined;
 labels.forEach(l=>l.remove());
 results.innerHTML=`<div class="result"><span class="value">?</span><div class="name">${names[player]} - ${quantity}d${sides}</div><div class="material">${materials[player]}</div><div class="individual" aria-label="Individual dice results"></div></div>`;
 try{
 const dice=physicalDice(Array.from({length:quantity},(_,index)=>({sides,value:1,index,set:player})));
 const nextWorld=createLiveWorld(dice,++seed,'bottom');
 const snapshot=nextWorld.snapshot();
 tray.dataset.dieRadius=String(snapshot.radius);tray.dataset.trayScale=String(snapshot.trayScale);
 const cm=metresPerUnitFor(snapshot.radius)*snapshot.trayScale*100;
 results.querySelector('.material')!.textContent=`${materials[player]} | Tray bed ${(14.4*cm).toFixed(1)} x ${(9.4*cm).toFixed(1)} cm | Fixed 17.6 mm d6 reference`;
 toss={radius:snapshot.radius,trayScale:snapshot.trayScale,frames:new Float32Array(snapshot.poses),frameCount:1,step:1,topFaces:dice.map(()=>0),duration:Infinity,settleTimes:[],wallHits:0};
 const art=await loadTrayTexture(themes[player].id);
 if(current!==epoch){art?.dispose();return;}
 const nextRenderer=createTrayRenderer(dice,toss,themes[player],undefined,art,true,undefined,{molten:true,lightning:true,liquidInk:true,dmGlow:.65,denseDm:true,varisTrail:true,mossAgate:moss,enchantedAmber:amber,woodlandWake:rangerLook.value!=='vine'});
 labels=dice.map(d=>{const l=document.createElement('div');l.className='die-label';l.textContent=`#${d.index+1}${d.tens?' tens':d.ones?' ones':''}`;l.hidden=true;tray.append(l);return l;});
 const r=tray.getBoundingClientRect();
 await nextRenderer.prepare(r.width,r.height,Math.min(devicePixelRatio,1.5));
 if(current!==epoch){nextRenderer.dispose();return;}
 renderer=nextRenderer;world=nextWorld;last=performance.now();
 status.textContent=`${names[player]} rolling ${quantity}d${sides}`;tray.dataset.state='rolling';tray.dataset.sides=String(sides);tray.dataset.roller=names[player];tray.dataset.diceCount=String(dice.length);
 buttons.forEach(b=>b.disabled=false);roller.disabled=count.disabled=rangerLook.disabled=false;
 function frame(now:number){
  if(current!==epoch||!renderer||!world||!toss)return;
  const snapshot=done?world.snapshot():world.advance(Math.min(.04,Math.max(.001,(now-last)/1000))*LIVE_DICE_PRESENTATION_RATE);last=now;
  toss.frames.set(snapshot.poses);
  const r=tray.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);
  if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
  renderer.draw(ctx,r.width,r.height,dpr,0,now);
  canvas.dataset.trailPoints=String(renderer.trailPointCount());canvas.dataset.trailBranches=String(renderer.trailBranchCount());
  labels.forEach((l,i)=>{const p=renderer!.numberPosition(i);l.hidden=!done||p.x<.05||p.x>.95||p.y<.05||p.y>.88;l.style.left=`${p.x*100}%`;l.style.top=`calc(${p.y*100}% + ${sides===100?25:38}px)`;});
  if(snapshot.done&&!done){
   done=true;tray.dataset.state='settled';
   const values=Array.from({length:quantity},(_,i)=>sides===100?(((snapshot.values[i*2]!-1)*10+snapshot.values[i*2+1]!-1)||100):snapshot.values[i]!);
   results.querySelector('.value')!.textContent=String(values.reduce((sum,v)=>sum+v,0));
   results.querySelector('.individual')!.textContent=values.map((v,i)=>`#${i+1}: ${v}`).join(' | ');
   status.textContent=`${names[player]}'s ${quantity}d${sides} settled`;
  }
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 }catch(error){
  if(current!==epoch)return;
  status.textContent=error instanceof Error?error.message:'Could not prepare the dice';
  buttons.forEach(b=>b.disabled=false);roller.disabled=count.disabled=rangerLook.disabled=false;
 }
}
buttons.forEach(b=>b.addEventListener('click',()=>void roll(b.dataset.sides?Number(b.dataset.sides):sides)));
rangerLook.addEventListener('change',()=>{roller.value='1';void roll();});
count.addEventListener('keydown',event=>{if(event.key==='Enter')void roll();});
await roll();
