import {createTrayRenderer,loadTrayTexture,waitForDiceGraphics} from '../lib/diceTrayRenderer';
import {DICE_THEMES,diceThemeForRoll} from '../../../shared/diceThemes';
import {physicalDice,type Toss,type TrayDie} from '../../../shared/diceTrayTypes';

const tray=document.querySelector<HTMLDivElement>('#tray')!,canvas=tray.querySelector('canvas')!,ctx=canvas.getContext('2d')!;
const sides=document.querySelector<HTMLSelectElement>('#sides')!,critical=document.querySelector<HTMLInputElement>('#critical')!;
const focus=document.querySelector<HTMLInputElement>('#focus')!;
const descriptions:Record<string,string>={fighter:'Higher rolls light branching cracks while keeping gold numbers readable. A maximum heats to molten lava and explodes into solid obsidian shards. Lava drains from the opened center into a bright pool as the shards settle and fade.',sorcerer:'A higher value charges more frequent internal lightning. A maximum fires crimson lightning bursts from changing directions throughout the red glass.',ranger:'The enclosed mote grows brighter with the value. On a maximum, the mote swings into the center and softly illuminates the surrounding resin from within.'};
const reviewParams=new URLSearchParams(location.search);
let theme=reviewParams.get('character')??'fighter',renderer:ReturnType<typeof createTrayRenderer>|undefined,epoch=0;
if(!['fighter','sorcerer','ranger','dm'].includes(theme))theme='fighter';
focus.checked=reviewParams.get('closeup')==='1';
descriptions.dm='Active inky clouds curl through purple resin, softly lit from within. A maximum natural result turns the cloud blood red while the gold numerals remain clear.';
async function show(){
 const controls=[...document.querySelectorAll<HTMLButtonElement|HTMLSelectElement|HTMLInputElement>('nav button,nav select,nav input')];
 controls.forEach(c=>c.disabled=true);tray.dataset.state='preparing';
 const current=++epoch;renderer?.dispose();renderer=undefined;
 const n=Number(sides.value),values=focus.checked?[n]:[1,Math.max(2,Math.ceil(n*.75)),n];
 document.querySelector('#description')!.textContent=descriptions[theme];
 const labels=document.querySelector<HTMLElement>('#labels')!;labels.style.gridTemplateColumns=`repeat(${values.length},1fr)`;
 labels.innerHTML=values.map((v,i)=>`<div><strong>${v} / ${n}</strong><span>${focus.checked?'Maximum — close-up':['Low','Strong','Maximum'][i]}</span></div>`).join('');
 document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)));
 const dice=physicalDice(values.map((value,index)=>({sides:n,value,index,set:0,crit:critical.checked} as TrayDie)));
 const frames=new Float32Array(dice.length*7);
 dice.forEach((d,i)=>{const x=(focus.checked?0:(d.index-1)*3.8)+(n===100?(d.tens?-.65:.65):0);frames.set([x,0,.68,0,0,0,1],i*7);});
 const toss:Toss={frames,frameCount:1,step:1,radius:.85,topFaces:dice.map(()=>0),duration:0,settleTimes:dice.map(()=>0),wallHits:0};
 const art=await loadTrayTexture(theme);await waitForDiceGraphics();if(current!==epoch){art?.dispose();return;}
 const next=createTrayRenderer(dice,toss,theme==='dm'?diceThemeForRoll('',true):DICE_THEMES[theme as keyof typeof DICE_THEMES],undefined,art);
 next.setReviewZoom(focus.checked?1.5:1);
 const rect=tray.getBoundingClientRect();await next.prepare(rect.width,rect.height,Math.min(devicePixelRatio,1.5));
 if(current!==epoch){next.dispose();return;}renderer=next;
 tray.dataset.theme=theme;tray.dataset.sides=String(n);
 tray.dataset.state='ready';controls.forEach(c=>c.disabled=false);
 function draw(now:number){
  if(current!==epoch)return;
  const r=tray.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);
  if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
  renderer!.draw(ctx,r.width,r.height,dpr,0,now);
  canvas.dataset.rollPower=JSON.stringify(renderer!.powerStates().map(p=>({known:p.known,age:p.age,strength:+p.strength.toFixed(2),maximum:p.maximum,particles:p.particles,broken:p.broken,shudder:p.shudder,lavaDrop:p.lavaDrop,fragments:p.fragments,frozenFragments:p.frozenFragments,lava:p.lava,pools:p.pools,melting:p.melting,preservedSurfaces:p.preservedSurfaces,physics:p.physics,mote:p.mote})));
  requestAnimationFrame(draw);
 }
 requestAnimationFrame(draw);
}
document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(b=>b.addEventListener('click',()=>{theme=b.dataset.theme!;void show();}));
sides.addEventListener('change',()=>void show());critical.addEventListener('change',()=>void show());document.querySelector('#replay')!.addEventListener('click',()=>void show());
focus.addEventListener('change',()=>void show());
await show();
