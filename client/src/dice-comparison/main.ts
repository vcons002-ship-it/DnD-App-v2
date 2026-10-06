import {createTrayRenderer,loadTrayTexture} from '../lib/diceTrayRenderer';
import {diceThemeForClass,diceThemeForRoll} from '../../../shared/diceThemes';
import {createLiveWorld} from '../../../shared/liveDicePhysics';
import {LIVE_DICE_PRESENTATION_RATE} from '../../../shared/liveDiceTypes';
import {physicalDice,type Toss} from '../../../shared/diceTrayTypes';

const names=['Druk','Varis','Vanec','DM'];
const materials=['Obsidian & gold','Forest resin, wood & bronze','Red glass & silver','Purple resin & gold'];
const themes=[diceThemeForClass('Fighter'),diceThemeForClass('Ranger'),diceThemeForClass('Sorcerer'),diceThemeForRoll('',true)];
const tray=document.querySelector<HTMLDivElement>('#tray')!;
const canvas=tray.querySelector('canvas')!,ctx=canvas.getContext('2d')!;
const status=document.querySelector<HTMLSpanElement>('#status')!;
const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];
const results=document.querySelector<HTMLDivElement>('.results')!;
results.innerHTML=names.map((name,i)=>`<div class="result"><span class="value" id="value-${i}">-</span><div class="name">${name}</div><div class="material">${materials[i]}</div></div>`).join('');
let sides=6,seed=2026100600,epoch=0;
let renderer:ReturnType<typeof createTrayRenderer>|undefined;
let world:ReturnType<typeof createLiveWorld>|undefined;
let toss:Toss|undefined;
let labels:HTMLDivElement[]=[],last=performance.now(),done=true;
const art=await loadTrayTexture('dm');
const experiment=new URLSearchParams(location.search).get('effects')==='1';
if(experiment){
 document.querySelector('h1')!.textContent='Dice power, inner light & rolling trails';
 document.querySelector('main > p')!.textContent='Druk: molten obsidian. Vanec: independent lightning flashes. DM: glossy purple resin with flowing black ink and soft interior light. Varis: branching vines, leaves and thorns.';
}

async function roll(next=sides){
 const current=++epoch;sides=next;done=false;
 buttons.forEach(b=>{b.disabled=true;if(b.dataset.sides)b.setAttribute('aria-pressed',String(Number(b.dataset.sides)===sides));});
 status.textContent=`Preparing four d${sides} styles...`;
 renderer?.dispose();renderer=undefined;world=undefined;
 labels.forEach(l=>l.remove());
 names.forEach((_,i)=>document.querySelector(`#value-${i}`)!.textContent='-');
 const dice=physicalDice(names.flatMap((_,i)=>(sides===0?[4,6,8,10,12,20,100]:[sides]).map((s,j)=>({sides:s,value:1,index:i*7+j,set:i}))));
 const nextWorld=createLiveWorld(dice,++seed,'bottom');
 const snapshot=nextWorld.snapshot();
 toss={radius:snapshot.radius,frames:new Float32Array(snapshot.poses),frameCount:1,step:1,topFaces:dice.map(()=>0),duration:Infinity,settleTimes:[],wallHits:0};
 const nextRenderer=createTrayRenderer(dice,toss,themes[3],undefined,art?.clone(),true,dice.map(d=>themes[d.set]),experiment?{liquidInk:true,molten:true,lightning:true,dmGlow:.65,denseDm:true,varisTrail:true}:undefined);
 labels=dice.map(d=>{const l=document.createElement('div');l.className='die-label';l.textContent=names[d.set]+(d.tens?' tens':d.ones?' ones':'');l.hidden=true;tray.append(l);return l;});
 const r=tray.getBoundingClientRect();
 await nextRenderer.prepare(r.width,r.height,Math.min(devicePixelRatio,1.5));
 if(current!==epoch){nextRenderer.dispose();return;}
 renderer=nextRenderer;world=nextWorld;last=performance.now();
 status.textContent=sides===0?'All four full sets - 32 dice rolling together':`Rolling d${sides} together`;tray.dataset.state='rolling';tray.dataset.sides=String(sides);
 buttons.forEach(b=>b.disabled=false);
 function frame(now:number){
  if(current!==epoch||!renderer||!world||!toss)return;
  const snapshot=done?world.snapshot():world.advance(Math.min(.04,Math.max(.001,(now-last)/1000))*LIVE_DICE_PRESENTATION_RATE);last=now;
  toss.frames.set(snapshot.poses);
  const r=tray.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);
  if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
  renderer.draw(ctx,r.width,r.height,dpr,0,now);
  canvas.dataset.trailPoints=String(renderer.trailPointCount());
  canvas.dataset.trailBranches=String(renderer.trailBranchCount());
  labels.forEach((l,i)=>{const p=renderer!.numberPosition(i);l.hidden=p.x<.05||p.x>.95||p.y<.05||p.y>.88;l.style.left=`${p.x*100}%`;l.style.top=`calc(${p.y*100}% + ${sides===100?25:38}px)`;});
  if(snapshot.done&&!done){
   done=true;tray.dataset.state='settled';
   names.forEach((_,i)=>{
    const values=dice.flatMap((d,j)=>d.set===i?[snapshot.values[j]!]:[]);
    const value=sides===100?(((values[0]-1)*10+(values[1]-1))||100):values[0];
    const result=document.querySelector<HTMLSpanElement>(`#value-${i}`)!;
    result.textContent=sides===0?'Full set':String(value);
    result.style.fontSize=sides===0?'19px':'';
   });
   status.textContent=sides===0?'All 32 dice settled':`d${sides} settled - compare the materials`;
  }
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
buttons.forEach(b=>b.addEventListener('click',()=>void roll(b.dataset.sides?Number(b.dataset.sides):sides)));
await roll();
