import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
// This clock harness intentionally disables RAF; screenshot stabilization cannot run.
test.use({screenshot:'off',trace:'off'});

test('damage numbers keep their scheduled order across a blocked frame and late mounting',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {Stage,Layer} from 'react-konva';import Konva from 'konva';
 import {HpNumberLayer} from './client/src/canvas/HpFx';
 import {scheduleHpFeedback,hpNumberStacks,hpStackStart,hpNumberSequence} from './client/src/lib/hpFeedback';
 let now=500;Object.defineProperty(performance,'now',{value:()=>now,configurable:true});window.requestAnimationFrame=()=>0;
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const token={id:'enemy',kind:'monster',refId:'enemy',x:200,y:200,widthFt:5};
 const event={id:1,kind:'monster',refId:'enemy',delta:-18,damageParts:[{amount:8,damageType:'slashing'},{amount:4,damageType:'force',spell:"Hunter's Mark"},{amount:6,damageType:'piercing',spell:'Hail of Thorns'}],numberStartAt:500,componentStarts:[500,1940,3380]};
 let head={x:300,y:180};const props={floaters:[event],tokens:[token],pxPerFoot:10,gridSizePx:50,view:{x:0,y:0,scale:1},width:600,height:400,tilt:45,rotation:0,headPosition:()=>head};
 const tree=()=>React.createElement(Stage,{width:600,height:400},React.createElement(Layer,null,React.createElement(HpNumberLayer,props)));
 const read=t=>{now=t;Konva.Animation._runFrames();Konva.Animation._runFrames();return Konva.stages[0].find('.hp-floater-number').filter(n=>n.getParent().getAbsoluteOpacity()>.01).map(n=>({text:n.text(),total:n.hasName('hp-floater-total'),y:n.getParent().y()}));};
 const pixels=(color)=>{const layer=Konva.stages.filter(Boolean)[0].getLayers()[0];layer.draw();const data=layer.getCanvas().getContext().getImageData(0,0,600,400).data;
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));let count=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>180&&rgb.every((v,j)=>Math.abs(data[i+j]-v)<20))count++;return count;};
 flushSync(()=>root.render(tree()));const first=read(500),firstPixels=pixels('#ff7185'),mid=read(800),afterStall=read(2000),markPixels=pixels('#d1b1ff'),third=read(3420),thornsPixels=pixels('#b4f47e'),ended=read(4900);
 root.unmount();now=6000;const lateRoot=createRoot(container);flushSync(()=>lateRoot.render(tree()));
 Konva.Animation._runFrames();Konva.Animation._runFrames();
 const late=Konva.stages.filter(Boolean).flatMap(s=>s.find('.hp-floater-component')).filter(n=>n.getParent().getAbsoluteOpacity()>.01).length;
 const layer=Konva.stages.filter(Boolean)[0].getLayers()[0];let redraws=0;layer.batchDraw=()=>{redraws++;return layer;};Konva.autoDrawEnabled=false;
 // Late mounting has already stopped all component animations. Hold the total
 // stationary, then move its head anchor and finally enter its fade.
 now=6050;Konva.Animation._runFrames();Konva.Animation._runFrames();const cached=layer.find('.hp-floater-total')[0].isCached();const settledRedraws=redraws;
 now=6100;Konva.Animation._runFrames();const heldRedraws=redraws-settledRedraws;
 head={x:340,y:160};
 now=6150;Konva.Animation._runFrames();const moved=layer.find('.hp-floater-total')[0].getParent().getParent().x();
 now=7000;Konva.Animation._runFrames();const fading=layer.find('.hp-floater-total')[0].getParent().getAbsoluteOpacity();
 const breakdowns=[];
 for(const [name,events] of [
  ['Ice Knife',[{id:11,kind:'monster',refId:'enemy',delta:-8,damageType:'piercing',spell:'Ice Knife',impact:{id:'ice'}},{id:12,kind:'monster',refId:'enemy',delta:-6,damageType:'cold',spell:'Ice Knife',impact:{id:'ice'}}]],
  ['Ice Storm',[{id:21,kind:'monster',refId:'enemy',delta:-14,damageParts:[{amount:8,damageType:'bludgeoning'},{amount:6,damageType:'cold'}]}]],
  ['Flame Tongue',[{id:31,kind:'monster',refId:'enemy',delta:-14,damageParts:[{amount:8,damageType:'slashing'},{amount:6,damageType:'fire'}]}]],
 ]){
  if(!breakdowns.length)lateRoot.unmount();now=1000;const next=createRoot(container),floaters=scheduleHpFeedback(events,now).events;
  const group=hpNumberStacks(floaters)[0],start=hpStackStart(group.numbers,now),sequence=hpNumberSequence(group.numbers);
  flushSync(()=>next.render(React.createElement(Stage,{width:600,height:400},React.createElement(Layer,null,React.createElement(HpNumberLayer,{...props,floaters})))));
  const parts=sequence.map(item=>{const nodes=read(start+item.delayMs+400);return {delay:item.delayMs,color:item.number.color,visiblePixels:pixels(item.number.color),nodes};});
  const end=read(start+sequence.at(-1).delayMs+500);breakdowns.push({name,parts,end});
  next.unmount();
 }
 window.numberClock={breakdowns,firstPixels,markPixels,thornsPixels,first,mid,afterStall,third,ended,late,cached,heldRedraws,moved,fading};
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).numberClock);const components=(a:any[])=>a.filter(n=>!n.total);
 for(const example of r.breakdowns){
  expect(example.parts.map((p:any)=>p.delay),example.name+' uses the Hail of Thorns cadence').toEqual([0,1440]);
  for(const part of example.parts)expect(part.visiblePixels,example.name+' '+part.color).toBeGreaterThan(10);
  expect(example.end.some((n:any)=>n.total&&n.text==='\u221214')).toBe(true);
 }
 expect(r.breakdowns[0].parts[1].color).toBe('#8fe4ff');expect(r.breakdowns[1].parts[1].color).toBe('#8fe4ff');
 expect(r.firstPixels,'Weapon damage actually paints colored pixels').toBeGreaterThan(10);
 expect(r.markPixels,'The second damage component is visible').toBeGreaterThan(10);
 expect(r.thornsPixels,'Hail of Thorns paints its own component').toBeGreaterThan(10);
 expect(components(r.first).map(n=>n.text)).toEqual(['−8']);
 expect(components(r.mid)[0].y).toBeLessThan(components(r.first)[0].y);
 expect(components(r.afterStall).map(n=>n.text)).toEqual(['−4']);
 expect(components(r.third).map(n=>n.text)).toEqual(['−6']);
 expect(components(r.ended)).toEqual([]);expect(r.ended.some((n:any)=>n.total&&n.text==='−18')).toBe(true);
 expect(r.late).toBe(0);expect(r.cached).toBe(true);expect(r.heldRedraws).toBe(0);expect(r.moved).toBe(340);expect(r.fading).toBeGreaterThan(0);expect(r.fading).toBeLessThan(1);
});
