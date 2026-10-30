import {afterEach,it,expect} from 'vitest';
import sharp from 'sharp';
import {dirtyRegions} from '../../shared/dirtyRegions.js';
import {sameBoardSnapshot} from '../../shared/boardSnapshot.js';
import {applySnapshotDelta,diffSnapshot} from '../../shared/stateDelta.js';
import {legacyMaskSvg} from '../../shared/legacyMaskSvg.js';
import type {StateSnapshot} from '../../shared/types.js';
import {visibilityWorkers} from './visibilityWorkers.js';
import {visionTiles} from './visionTiles.js';
import {renderAssetFor,resetRenderAssets} from './renderAssets.js';
import {deliverState,resetDelivery} from './stateDelivery.js';
afterEach(async()=>{resetRenderAssets('tiles');resetDelivery('tiles');await visibilityWorkers.close();});
it('keeps distant movement regions separate and clips padded edges to the viewport',()=>{
 expect(dirtyRegions([{x:-4,y:-2,width:10,height:10},{x:90,y:90,width:20,height:20}],100,100)).toEqual([{x:0,y:0,width:9,height:11},{x:87,y:87,width:13,height:13}]);
 expect(dirtyRegions([{x:NaN,y:0,width:1,height:1},null,{x:200,y:0,width:4,height:4}],100,100)).toEqual([]);
 expect(dirtyRegions([{x:0,y:0,width:10,height:10},{x:25,y:0,width:10,height:10},{x:12,y:0,width:12,height:10}],100,100)).toEqual([{x:0,y:0,width:38,height:13}]);
});
it('isolates feed changes while preserving board and visibility invalidation',()=>{
 const a={tokens:[],chat:[],rollLog:[],playerVision:{}} as unknown as StateSnapshot;
 expect(sameBoardSnapshot(a,{...a,chat:[{}],rollLog:[{}]} as StateSnapshot)).toBe(true);
 expect(sameBoardSnapshot(a,{...a,tokens:[]})).toBe(false);
 expect(sameBoardSnapshot(a,{...a,playerVision:undefined})).toBe(false);
});
it('patches changed tiles and removals without replacing unchanged tile references, including DM party views',()=>{
 const tile={key:'same',x:0,y:0,width:512,height:512,scale:1},bounds=tile;
 const a={tokens:[],visionTiles:{key:'old',bounds,tiles:{'0:0':tile,'1:0':{...tile,key:'remove'}}}} as unknown as StateSnapshot;
 const b={...a,visionTiles:{key:'new',bounds,tiles:{'0:0':{...tile},'2:0':{...tile,key:'added'}}}};
 const patch=diffSnapshot(a,b),next=applySnapshotDelta(a,JSON.parse(JSON.stringify(patch)));
 expect(next).toEqual(b);expect(next.visionTiles!.tiles['0:0']).toBe(tile);
 expect(patch.maskTiles?.set).not.toHaveProperty('0:0');expect(patch.maskTiles?.remove).toEqual(['1:0']);
 const dm={...a,partyView:a},updated={...dm,partyView:b};
 expect(applySnapshotDelta(dm,diffSnapshot(dm,updated))).toEqual(updated);
 expect(applySnapshotDelta(a,diffSnapshot(a,{...a,visionTiles:undefined}))).not.toHaveProperty('visionTiles');
});
it('tiles have identical pixels to the full mask and unchanged areas keep their private content keys',async()=>{
 const snapshot={map:{id:'tile-map',mapVisionEnabled:true},mapImages:[],tokens:[],playerVision:{radius:100,heavy:false,daylight:true,origins:[{id:'pc',x:100,y:100}]},legacyGeometry:{sight:['M0 0H200V400H0Z'],near:[],lights:[],memory:[],affinity:[]}} as unknown as StateSnapshot;
 const first=(await visionTiles('tiles',snapshot,{width:1024,height:512}))!;
 const whole=await sharp(Buffer.from(legacyMaskSvg(snapshot.legacyGeometry!,{...first.bounds,wallFog:true,heavy:false,daylight:true,keepRevealed:false}))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(const asset of Object.values(first.tiles)){
  expect(renderAssetFor('unauthorized',asset.key)).toBeUndefined();
  const tile=await sharp(renderAssetFor('tiles',asset.key)!).ensureAlpha().raw().toBuffer();
  const x=Math.round((asset.x-first.bounds.x)*asset.scale),y=Math.round((asset.y-first.bounds.y)*asset.scale);
  const expected=await sharp(whole.data,{raw:whole.info}).extract({left:x,top:y,width:asset.width,height:asset.height}).raw().toBuffer();
  expect(tile.equals(expected)).toBe(true);
 }
 const moved=(await visionTiles('tiles',{...snapshot,legacyGeometry:{...snapshot.legacyGeometry!,sight:['M50 0H250V400H50Z']}},{width:1024,height:512}))!;
 expect(moved.bounds).toEqual(first.bounds);expect(moved.tiles['0:0'].key).not.toBe(first.tiles['0:0'].key);expect(moved.tiles['1:0'].key).toBe(first.tiles['1:0'].key);
});
it('reuses prepared geometry and images for feed-only updates and regenerates after visibility changes',async()=>{
 const snapshot={role:'player',map:{id:'reuse',gridSizePx:50,feetPerSquare:5,mapVisionEnabled:true},tokens:[],characters:[],monsters:[],chat:[],rollLog:[],serverRendering:{enabled:true},playerVision:{radius:100,rangeFt:60,heavy:false,daylight:false,walls:[],lights:[],origins:[{id:'pc',x:100,y:100}]}} as unknown as StateSnapshot;
 const events:any[]=[],warmed:string[][]=[];const io={to:()=>({emit:(event:string,payload:any)=>{if(event==='state:frame')events.push(payload);if(event==='render:warm')warmed.push(payload.keys);}})};
 const options={stateProtocol:1 as const,renderProtocol:2 as const,legacyRendering:true,serverRendering:true};
 deliverState(io,'tiles',snapshot,options);await expect.poll(()=>events.length,{timeout:10000}).toBe(1);
 const jobs=visibilityWorkers.metrics.jobs;
 deliverState(io,'tiles',{...snapshot,chat:[{id:'message',text:'hello'} as any]},options);await expect.poll(()=>events.length).toBe(2);
 expect(visibilityWorkers.metrics.jobs).toBe(jobs);expect(events[1].delta).not.toHaveProperty('maskTiles');
 deliverState(io,'tiles',{...snapshot,playerVision:{...snapshot.playerVision!,heavy:true,origins:[{id:'pc',x:150,y:100}]}},options);await expect.poll(()=>events.length).toBe(3);
 expect(visibilityWorkers.metrics.jobs).toBeGreaterThan(jobs);expect(warmed.flat().length).toBeGreaterThan(0);
});
