import {test,expect} from './helpers/test';
import {build} from 'esbuild';

// Spell art is clipped per pixel to what a player can see: revealed map-fog
// cells (by ground position) and the live vision cover (screen space). A
// hidden caster's area spell then shows only where it reaches open view.
test('spell art is clipped to revealed map fog and the live vision cover',async({page})=>{
 const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {Scene,PerspectiveCamera,WebGLRenderer,DataTexture,RGBAFormat,NearestFilter} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const size=256,scene=new Scene(),effects=createSpellImpactEffects(scene),renderer=new WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(size,size);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
 const camera=new PerspectiveCamera(45,1,.1,1000);camera.layers.set(7);camera.position.set(0,60,.01);camera.lookAt(0,0,0);
 const texture=(w,h,on)=>{const data=new Uint8Array(w*h*4);for(let j=0;j<h;j++)for(let i=0;i<w;i++)data[(j*w+i)*4]=on(i,j)?255:0;const t=new DataTexture(data,w,h,RGBAFormat);t.magFilter=t.minFilter=NearestFilter;t.needsUpdate=true;return t;};
 effects.sync([{id:1,tokenId:'area',x:0,y:0,diameter:40,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell:'Fireball',areaPosition:{mapId:'map',x:0,y:0,radiusFt:20}}}],0);
 effects.tick(1800,1,false,()=>({x:0,y:0,visible:true,height:6}));
 const colored=()=>{renderer.clear();renderer.render(scene,camera);const gl=renderer.getContext(),px=new Uint8Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,px);
  let left=0,right=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(px[(y*size+x)*4+3]>5){if(x<size/2)left++;else right++;}return {left,right,error:gl.getError()};};
 const r={};r.plain=colored();
 // Map fog: 10 px cells from (-3,-3); reveal none, then only cells west of x=0.
 const fog=(on)=>({texture:texture(6,6,on),originX:-3,originY:-3,cols:6,rows:6,grid:10});
 effects.setFogClip(fog(()=>false));r.fogged=colored();
 effects.setFogClip(fog(i=>i<3));r.halfRevealed=colored();
 effects.setFogClip(fog(()=>true));r.revealed=colored();
 effects.setFogClip(null);
 // Vision cover in screen space: nothing in sight, then everything.
 effects.setCoverClip({texture:texture(size,size,()=>false),width:size,height:size});r.unseen=colored();
 effects.setCoverClip({texture:texture(size,size,()=>true),width:size,height:size});r.seen=colored();
 effects.setCoverClip(null);
 window.result=r;effects.dispose();renderer.dispose();
 `}});
 await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>(window as any).result);
 expect(errors).toEqual([]);
 const total=(v:{left:number;right:number})=>v.left+v.right;
 expect(r.plain.error).toBe(0);expect(total(r.plain)).toBeGreaterThan(500);
 expect(total(r.fogged)).toBe(0);
 expect(total(r.revealed)).toBe(total(r.plain));
 // Half the cells revealed: one screen half keeps its art, the other loses it.
 const kept=Math.max(r.halfRevealed.left,r.halfRevealed.right),lost=Math.min(r.halfRevealed.left,r.halfRevealed.right);
 expect(kept).toBeGreaterThan(total(r.plain)*.3);expect(lost).toBeLessThan(total(r.plain)*.05);
 expect(total(r.unseen)).toBe(0);
 expect(total(r.seen)).toBe(total(r.plain));
});
