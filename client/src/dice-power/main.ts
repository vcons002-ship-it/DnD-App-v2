import {createTrayRenderer,loadTrayTexture,waitForDiceGraphics} from '../lib/diceTrayRenderer';
import {DICE_THEMES} from '../../../shared/diceThemes';
import {physicalDice,type Toss,type TrayDie} from '../../../shared/diceTrayTypes';

const tray=document.querySelector<HTMLDivElement>('#tray')!,canvas=tray.querySelector('canvas')!,ctx=canvas.getContext('2d')!;
const sides=document.querySelector<HTMLSelectElement>('#sides')!,critical=document.querySelector<HTMLInputElement>('#critical')!;
const descriptions:Record<string,string>={fighter:'Obsidian fissures widen and heat up with the roll. A maximum erupts, throwing molten fragments while the gold result remains readable.',sorcerer:'A higher value charges more frequent internal lightning. A maximum sustains crossing Tesla-like discharges inside the red glass.',ranger:'The enclosed mote grows brighter with the value. A maximum releases drifting green-gold light streams through the resin.'};
let theme='fighter',renderer:ReturnType<typeof createTrayRenderer>|undefined,epoch=0;
async function show(){
 const controls=[...document.querySelectorAll<HTMLButtonElement|HTMLSelectElement|HTMLInputElement>('nav button,nav select,nav input')];
 controls.forEach(c=>c.disabled=true);tray.dataset.state='preparing';
 const current=++epoch;renderer?.dispose();renderer=undefined;
 const n=Number(sides.value),values=[1,Math.max(2,Math.ceil(n*.75)),n];
 document.querySelector('#description')!.textContent=descriptions[theme];
 document.querySelector('#labels')!.innerHTML=values.map((v,i)=>`<div><strong>${v} / ${n}</strong><span>${['Low','Strong','Maximum'][i]}</span></div>`).join('');
 document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)));
 const dice=physicalDice(values.map((value,index)=>({sides:n,value,index,set:0,crit:critical.checked} as TrayDie)));
 const frames=new Float32Array(dice.length*7);
 dice.forEach((d,i)=>{const x=(d.index-1)*3.8+(n===100?(d.tens?-.65:.65):0);frames.set([x,0,.68,0,0,0,1],i*7);});
 const toss:Toss={frames,frameCount:1,step:1,radius:.85,topFaces:dice.map(()=>0),duration:0,settleTimes:dice.map(()=>0),wallHits:0};
 const art=await loadTrayTexture(theme);await waitForDiceGraphics();if(current!==epoch){art?.dispose();return;}
 const next=createTrayRenderer(dice,toss,DICE_THEMES[theme as keyof typeof DICE_THEMES],undefined,art);
 const rect=tray.getBoundingClientRect();await next.prepare(rect.width,rect.height,Math.min(devicePixelRatio,1.5));
 if(current!==epoch){next.dispose();return;}renderer=next;
 tray.dataset.theme=theme;tray.dataset.sides=String(n);
 tray.dataset.state='ready';controls.forEach(c=>c.disabled=false);
 function draw(now:number){
  if(current!==epoch)return;
  const r=tray.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);
  if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
  renderer!.draw(ctx,r.width,r.height,dpr,0,now);
  canvas.dataset.rollPower=JSON.stringify(renderer!.powerStates().map(p=>({known:p.known,strength:+p.strength.toFixed(2),maximum:p.maximum,particles:p.particles})));
  requestAnimationFrame(draw);
 }
 requestAnimationFrame(draw);
}
document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(b=>b.addEventListener('click',()=>{theme=b.dataset.theme!;void show();}));
sides.addEventListener('change',()=>void show());critical.addEventListener('change',()=>void show());document.querySelector('#replay')!.addEventListener('click',()=>void show());
await show();
