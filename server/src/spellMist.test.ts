import {describe,it,expect} from 'vitest';
import {createMistFlow} from '../../client/src/canvas/mistFlow.js';
import {spellMistImpulse,spellMistEnabled,MAX_SPELL_MIST_IMPULSES,type SpellMistImpulse} from '../../client/src/canvas/spellMist.js';

const settings={mapWidth:1000,mapHeight:700,scenery:false,mistInteraction:true};
const fire=()=>spellMistImpulse({id:'fire',x:500,y:350,diameter:400,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell:'Fireball',areaPosition:{mapId:'m',x:500,y:350,radiusFt:20}}},'fireball',10,1)!;
function field(){const f=createMistFlow();f.update(settings);f.tick(1);return f;}
function pixel(f:ReturnType<typeof field>,x:number,y:number){const {data,width,height}=f.texture.image;const i=(Math.floor(y/700*height)*width+Math.floor(x/1000*width))*4;return Array.from((data as Uint8Array).slice(i,i+4));}

describe('spell mist displacement',()=>{
 it('uses High/Balanced and respects disabled mist, interaction and reduced motion',()=>{
  expect(spellMistEnabled('high',true,true,false)).toBe(true);
  expect(spellMistEnabled('balanced',true,true,false)).toBe(true);
  for(const q of ['low','off',undefined])expect(spellMistEnabled(q,true,true,false)).toBe(false);
  expect(spellMistEnabled('high',false,true,false)).toBe(false);expect(spellMistEnabled('high',true,false,false)).toBe(false);expect(spellMistEnabled('high',true,true,true)).toBe(false);
 });
 it('waits for the Fireball projectile, pushes noisy banks, then refills without a persistent hole',()=>{
  const f=field();f.setSpells([fire()],true);f.tick(1.4);expect(pixel(f,500,350)).toEqual([128,128,255,0]);
  f.tick(2.4);expect(pixel(f,500,350)[2]).toBeLessThan(70);
  const left=pixel(f,320,350),right=pixel(f,680,350);expect(left[0]).toBeGreaterThan(128);expect(right[0]).toBeLessThan(128);
  expect(left[3]+right[3]).toBeGreaterThan(50);expect(pixel(f,950,350)).toEqual([128,128,255,0]);
  expect(f.state.spellSamples).toBeGreaterThan(0);expect(Math.max(...f.heightTexture.image.data as Uint8Array)*f.heightScale/255).toBeGreaterThan(120);
  f.tick(8);expect(f.state.spellImpulses).toBe(0);expect(pixel(f,500,350)).toEqual([128,128,255,0]);f.dispose();
 });
 it('keeps a narrow lightning lane, leaving unrelated mist and the space behind the caster untouched',()=>{
  const f=field(),s:SpellMistImpulse={...fire(),id:'line',shape:'line',x:100,y:350,dx:1,dy:0,size:800,width:25,born:1,duration:3,energy:.55};
  f.setSpells([s],true);f.tick(1.5);expect(pixel(f,400,350)[2]).toBeLessThan(230);expect(pixel(f,400,450)).toEqual([128,128,255,0]);expect(pixel(f,60,350)).toEqual([128,128,255,0]);f.dispose();
 });
 it('starts a directed Self cube at the caster face and rotates cone coordinates with the spell',()=>{
  const event={kind:'pc' as const,refId:'mage',delta:0,effect:'spell-area' as const,sourcePosition:{mapId:'m',x:100,y:350},areaPosition:{mapId:'m',x:175,y:350,radiusFt:7.5,end:{x:325,y:350}}};
  const s=spellMistImpulse({id:'wave',x:175,y:350,diameter:150,event},'thunder-cube',10,1)!;expect(s).toMatchObject({shape:'cube',x:100,y:350,size:150,dx:1,dy:0});
  const f=field();f.setSpells([s],true);f.tick(1.7);expect(pixel(f,200,350)[2]).toBeLessThan(200);expect(pixel(f,70,350)).toEqual([128,128,255,0]);f.dispose();
 });
 it('preserves the field under camera/settings updates, caps simultaneous fields, and removes work when disabled',()=>{
  const f=field();f.setSpells(Array.from({length:20},(_,id)=>({...fire(),id})),true);expect(f.state.spellImpulses).toBe(MAX_SPELL_MIST_IMPULSES);
  f.tick(2.2);const bytes=(f.texture.image.data as Uint8Array).slice();f.update(settings);f.tick(2.19);expect(f.texture.image.data).toEqual(bytes);
  f.setSpells([],false);f.tick(2.4);expect(f.state).toMatchObject({spellImpulses:0,spellEnabled:false,spellSamples:0});expect(pixel(f,500,350)).toEqual([128,128,255,0]);f.dispose();
 });
 it('does not create air disturbances for marks, healing/status art or weapon flashes',()=>{
  for(const kind of ['mark','shield','chains','pattern','weapon-slash','aura'])expect(spellMistImpulse({id:kind,x:0,y:0,diameter:50,event:{kind:'pc',refId:'p',delta:0}},kind,10,1)).toBeNull();
 });
});
