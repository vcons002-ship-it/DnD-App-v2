import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('physical roll prepares raster behind the tray without releasing impact, and skip remains immediate',async({page})=>{
 const bundle=await build({write:false,bundle:true,loader:{'.css':'empty'},format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {useStore} from './client/src/state/socket';import {RollRevealOverlay} from './client/src/components/RollRevealOverlay';
 import {rollBackgroundBudget,reduceRollBackground} from './client/src/lib/rollBackgroundBudget';
 const container=document.createElement('div');document.body.append(container);window.store=useStore;
 window.startRoll=(id)=>{useStore.setState({snapshot:null,liveDice:null,hiddenRollReview:null,hpFx:[],showRollAnim:true,rollFx:{id,rollId:'roll-'+id,reveal:{kind:'damage',physical:true,attacker:'Druk',title:'Damage',outcome:'none',damage:4,damageDice:[{label:'1d6',value:4,faces:[4]}]}}});};
 window.read=()=>{const s=useStore.getState(),reduced=reduceRollBackground(s);return {prepared:!!s.rollFx?.backgroundPrepared,ready:!!s.rollFx?.impactReady,present:!!s.rollFx,budget:rollBackgroundBudget(1,reduced,!!s.rollFx?.backgroundPrepared)};};
 window.events=[];useStore.subscribe(()=>window.events.push(window.read()));
 const root=createRoot(container);window.unmount=()=>root.unmount();flushSync(()=>root.render(React.createElement(RollRevealOverlay)));
 `}});
 await page.goto('/api/health');await page.evaluate(()=>document.body.replaceChildren());await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>(window as any).startRoll(1));
 await expect.poll(()=>page.evaluate(()=>(window as any).read())).toEqual({prepared:false,ready:false,present:true,budget:{pixelRatio:.65,fps:12}});

 // Early preparation must not count as completion or unlock the impact.
 await expect.poll(()=>page.evaluate(()=>(window as any).read())).toEqual({prepared:true,ready:true,present:true,budget:{pixelRatio:1,fps:60}});
 const events=await page.evaluate(()=>(window as any).events),prepared=events.findIndex((e:any)=>e.prepared&&!e.ready);
 expect(prepared).toBeGreaterThanOrEqual(0);
 expect(events[prepared]).toEqual({prepared:true,ready:false,present:true,budget:{pixelRatio:1,fps:12}});
 expect(events.findIndex((e:any)=>e.ready)).toBeGreaterThan(prepared);
 await page.evaluate(()=>{(window as any).startRoll(2);(window as any).store.getState().prepareRollBackground('roll-1');});
 expect((await page.evaluate(()=>(window as any).read())).prepared).toBe(false);
 await page.keyboard.press('Escape');
 expect((await page.evaluate(()=>(window as any).read())).present).toBe(false);
 // A cancelled old sequence cannot prepare its successor.
 await page.evaluate(()=>(window as any).startRoll(3));
 await page.waitForTimeout(300);
 expect((await page.evaluate(()=>(window as any).read())).prepared).toBe(false);
 await page.evaluate(()=>{(window as any).unmount();const s=(window as any).store;s.setState({rollFx:null,hiddenRollReview:{id:'private'}});s.getState().prepareRollBackground('roll-3');});
 expect(await page.evaluate(()=>(window as any).read())).toEqual({prepared:false,ready:false,present:false,budget:{pixelRatio:.65,fps:12}});
});
