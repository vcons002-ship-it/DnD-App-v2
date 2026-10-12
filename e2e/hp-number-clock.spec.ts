import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
// This clock harness intentionally disables RAF; screenshot stabilization cannot run.
test.use({screenshot:'off',trace:'off'});

test('damage numbers keep their scheduled order across a blocked frame and late mounting',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {Stage,Layer} from 'react-konva';import Konva from 'konva';
 import {HpNumberLayer} from './client/src/canvas/HpFx';
 let now=500;Object.defineProperty(performance,'now',{value:()=>now,configurable:true});window.requestAnimationFrame=()=>0;
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const token={id:'enemy',kind:'monster',refId:'enemy',x:200,y:200,widthFt:5};
 const event={id:1,kind:'monster',refId:'enemy',delta:-18,damageParts:[{amount:8,damageType:'slashing'},{amount:4,damageType:'force',spell:"Hunter's Mark"},{amount:6,damageType:'piercing',spell:'Hail of Thorns'}],numberStartAt:500,componentStarts:[500,1940,3380]};
 let head={x:300,y:180};const props={floaters:[event],tokens:[token],pxPerFoot:10,gridSizePx:50,view:{x:0,y:0,scale:1},width:600,height:400,tilt:45,rotation:0,headPosition:()=>head};
 const tree=()=>React.createElement(Stage,{width:600,height:400},React.createElement(Layer,null,React.createElement(HpNumberLayer,props)));
 const read=t=>{now=t;Konva.Animation._runFrames();Konva.Animation._runFrames();return Konva.stages[0].find('.hp-floater-number').filter(n=>n.getAbsoluteOpacity()>.01).map(n=>({text:n.text(),total:n.hasName('hp-floater-total'),y:n.getParent().y()}));};
 flushSync(()=>root.render(tree()));const first=read(500),mid=read(800),afterStall=read(2000),third=read(3420),ended=read(4900);
 root.unmount();now=6000;const lateRoot=createRoot(container);flushSync(()=>lateRoot.render(tree()));
 Konva.Animation._runFrames();Konva.Animation._runFrames();
 const late=Konva.stages.filter(Boolean).flatMap(s=>s.find('.hp-floater-component')).filter(n=>n.getAbsoluteOpacity()>.01).length;
 const layer=Konva.stages.filter(Boolean)[0].getLayers()[0];let redraws=0;layer.batchDraw=()=>{redraws++;return layer;};Konva.autoDrawEnabled=false;
 // Late mounting has already stopped all component animations. Hold the total
 // stationary, then move its head anchor and finally enter its fade.
 now=6050;Konva.Animation._runFrames();Konva.Animation._runFrames();const cached=layer.find('.hp-floater-total')[0].isCached();const settledRedraws=redraws;
 now=6100;Konva.Animation._runFrames();const heldRedraws=redraws-settledRedraws;
 head={x:340,y:160};
 now=6150;Konva.Animation._runFrames();const moved=layer.find('.hp-floater-total')[0].getParent().getParent().x();
 now=7000;Konva.Animation._runFrames();const fading=layer.find('.hp-floater-total')[0].getAbsoluteOpacity();
 window.numberClock={first,mid,afterStall,third,ended,late,cached,heldRedraws,moved,fading};lateRoot.unmount();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).numberClock);const components=(a:any[])=>a.filter(n=>!n.total);
 expect(components(r.first).map(n=>n.text)).toEqual(['−8']);
 expect(components(r.mid)[0].y).toBeLessThan(components(r.first)[0].y);
 expect(components(r.afterStall).map(n=>n.text)).toEqual(['−4']);
 expect(components(r.third).map(n=>n.text)).toEqual(['−6']);
 expect(components(r.ended)).toEqual([]);expect(r.ended.some((n:any)=>n.total&&n.text==='−18')).toBe(true);
 expect(r.late).toBe(0);expect(r.cached).toBe(true);expect(r.heldRedraws).toBe(0);expect(r.moved).toBe(340);expect(r.fading).toBeGreaterThan(0);expect(r.fading).toBeLessThan(1);
});
