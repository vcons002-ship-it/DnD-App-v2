import {createTrayRenderer,loadTrayTexture,waitForDiceGraphics} from '../lib/diceTrayRenderer';
import {DICE_THEMES,diceThemeForRoll} from '../../../shared/diceThemes';
import {physicalDice,type Toss,type TrayDie} from '../../../shared/diceTrayTypes';

const tray=document.querySelector<HTMLDivElement>('#tray')!,canvas=tray.querySelector('canvas')!,ctx=canvas.getContext('2d')!;
const sides=document.querySelector<HTMLSelectElement>('#sides')!,critical=document.querySelector<HTMLInputElement>('#critical')!;
const focus=document.querySelector<HTMLInputElement>('#focus')!;
const descriptions:Record<string,string>={fighter:'Higher rolls light branching cracks while keeping gold numbers readable. A maximum holds an unstable molten charge, then bursts into solid obsidian shards. A smaller lava pool flickers with flames and outward splatter as the shards settle and fade.',sorcerer:'A higher value charges more frequent internal lightning. A maximum fires crimson lightning throughout the glass, with occasional branching bolts escaping from changing points on its surface.',ranger:'The enclosed mote grows brighter with the value. On a maximum, the mote swings into the center, lights the deep green resin locally and sends gentle rotating beams through its faces while textured leaves swirl around the die.'};
const reviewParams=new URLSearchParams(location.search);
const requestedSides=reviewParams.get('sides');
if(requestedSides&&['4','6','8','10','12','20','100'].includes(requestedSides))sides.value=requestedSides;
let theme=reviewParams.get('character')??'fighter',renderer:ReturnType<typeof createTrayRenderer>|undefined,epoch=0;
if(!['fighter','sorcerer','ranger','dm'].includes(theme))theme='fighter';
focus.checked=reviewParams.get('closeup')==='1';
critical.checked=reviewParams.get('gold')==='1';
descriptions.dm='Soft red light glows behind black swirls of ink inside purple resin. Higher natural results build stronger, more frequent swells. A maximum holds a strong red inner glow, with the dark ink still moving in front of it.';
async function show(){
 const controls=[...document.querySelectorAll<HTMLButtonElement|HTMLSelectElement|HTMLInputElement>('nav button,nav select,nav input')];
 controls.forEach(c=>c.disabled=true);tray.dataset.state='preparing';
 const current=++epoch;renderer?.dispose();renderer=undefined;
 const n=Number(sides.value),values=focus.checked?[n]:[1,Math.max(2,Math.ceil(n*.75)),n];
 document.querySelector('#description')!.textContent=critical.checked?({fighter:'Gold critical dice carry intensifying warm sparks around their heated metal. A maximum still shudders and bursts into obsidian shards and lava.',sorcerer:'Gold critical dice carry red lightning across their outer shell, with more frequent bursts and red-tinted sparkles on stronger rolls. A maximum occasionally throws branching lightning into the air.',ranger:'Gold critical dice carry a green magical sheen and intensifying green-gold sparkles. A maximum sends gentle rotating rays and swirling leaves outside the gold shell.',dm:'Gold critical dice carry intensifying red-gold sparkles around them, keeping the gold face and dark numerals clear.'}[theme])+ ' Low, strong and maximum results use the same natural-face strength as ordinary dice.':descriptions[theme];
 const labels=document.querySelector<HTMLElement>('#labels')!;labels.style.gridTemplateColumns=`repeat(${values.length},1fr)`;
 labels.innerHTML=values.map((v,i)=>`<div><strong>${v} / ${n}</strong><span>${focus.checked?'Maximum — close-up':['Low','Strong','Maximum'][i]}</span></div>`).join('');
 document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)));
 const dice=physicalDice(values.map((value,index)=>({sides:n,value,index,set:0,crit:critical.checked} as TrayDie)));
 const frames=new Float32Array(dice.length*7);
 dice.forEach((d,i)=>{const x=(focus.checked?0:(d.index-1)*3.8)+(n===100?(d.tens?-.65:.65):0);frames.set([x,0,.68,0,0,0,1],i*7);});
 const toss:Toss={frames,frameCount:1,step:1,radius:.85,topFaces:dice.map(()=>0),duration:0,settleTimes:dice.map(()=>0),wallHits:0};
 const art=await loadTrayTexture(theme);await waitForDiceGraphics();if(current!==epoch){art?.dispose();return;}
 const next=createTrayRenderer(dice,toss,theme==='dm'?diceThemeForRoll('',true):DICE_THEMES[theme as keyof typeof DICE_THEMES],undefined,art);
 next.setReviewZoom(focus.checked?(theme==='ranger'?3:1.5):1);
 const rect=tray.getBoundingClientRect();await next.prepare(rect.width,rect.height,Math.min(devicePixelRatio,1.5));
 if(current!==epoch){next.dispose();return;}renderer=next;
 tray.dataset.theme=theme;tray.dataset.sides=String(n);
 tray.dataset.state='ready';controls.forEach(c=>c.disabled=false);
 function draw(now:number){
  if(current!==epoch)return;
  const r=tray.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);
  if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
  renderer!.draw(ctx,r.width,r.height,dpr,0,now);
  canvas.dataset.rollPower=JSON.stringify(renderer!.powerStates().map(p=>({known:p.known,age:p.age,strength:+p.strength.toFixed(2),maximum:p.maximum,dmCharge:p.dmCharge,dmPulseFrequency:p.dmPulseFrequency,goldCharge:p.goldCharge,goldSparkles:p.goldSparkles,leaves:p.leaves,leafPosition:p.leafPosition,escapingBolts:p.escapingBolts,lightningBursts:p.lightningBursts,particles:p.particles,broken:p.broken,shudder:p.shudder,lavaDrop:p.lavaDrop,fragments:p.fragments,frozenFragments:p.frozenFragments,lava:p.lava,pools:p.pools,melting:p.melting,preservedSurfaces:p.preservedSurfaces,physics:p.physics,mote:p.mote})));
  requestAnimationFrame(draw);
 }
 requestAnimationFrame(draw);
}
document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(b=>b.addEventListener('click',()=>{theme=b.dataset.theme!;void show();}));
sides.addEventListener('change',()=>void show());critical.addEventListener('change',()=>void show());document.querySelector('#replay')!.addEventListener('click',()=>void show());
focus.addEventListener('change',()=>void show());
await show();
