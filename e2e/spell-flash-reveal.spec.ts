import {test,expect} from './helpers/test';
import {build} from 'esbuild';

const bundle=async(contents:string)=>(await build({write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),contents}})).outputFiles[0].text;

// Fire, lightning and radiant area spells light the ground only while they
// animate, and that light follows the animation itself.
test('flashing area spells light their animation where it is, and only while it plays',async({page})=>{
 const script=await bundle(`
 import {Scene} from 'three';import {createSpellImpactEffects} from './client/src/canvas/spellImpactEffects';
 const effects=createSpellImpactEffects(new Scene()),ppf=10,at=(x,y)=>()=>({x,y,visible:true,height:6});
 const area=(id,spell,areaPosition,extra={})=>({id,tokenId:'area:'+id,x:areaPosition.x,y:areaPosition.y,diameter:40,fixed:true,event:{kind:'pc',refId:'mage',delta:0,effect:'spell-area',spell,areaPosition,...extra}});
 const revealing=lights=>lights.filter(l=>l.revealsTerrain);
 // A 100 ft bolt: its light reaches only as far as the return stroke has travelled.
 effects.sync([area(1,'Lightning Bolt',{mapId:'m',x:0,y:0,radiusFt:2.5,end:{x:1000,y:0}})],0);
 const early=revealing(effects.tick(130,ppf,false,at(0,0))),full=revealing(effects.tick(500,ppf,false,at(0,0)));
 const strength=t=>revealing(effects.tick(t,ppf,false,at(0,0))).reduce((n,l)=>n+l.strength,0);
 const dim=strength(340),strike=strength(450);
 const over=revealing(effects.tick(1400,ppf,false,at(0,0)));effects.sync([],1400);
 // A Fireball's light travels with the ball, then bursts at the target.
 effects.sync([area(2,'Fireball',{mapId:'m',x:0,y:0,radiusFt:20},{sourcePosition:{mapId:'m',x:-600,y:0}})],0);
 const flight=[150,300,450].map(t=>revealing(effects.tick(t,ppf,false,at(0,0))));
 const burst=revealing(effects.tick(900,ppf,false,at(0,0)));effects.sync([],2200);
 // Cold and thunder light stays cosmetic.
 effects.sync([area(3,'Ice Storm',{mapId:'m',x:0,y:0,radiusFt:20}),area(4,'Thunderwave',{mapId:'m',x:300,y:0,radiusFt:7.5,end:{x:450,y:0}})],0);
 const cold=effects.tick(600,ppf,false,at(0,0));
 const xs=lights=>lights.map(l=>Math.round(l.x));
 window.flash={dim,strike,early:xs(early),full:xs(full),over:over.length,flight:flight.map(l=>({count:l.length,x:l.length?l.reduce((s,p)=>s+p.x,0)/l.length:null})),
  burst:burst.length,burstSpread:burst.length?Math.max(...burst.map(l=>Math.hypot(l.x,l.y))):null,coldLights:cold.length,coldRevealing:revealing(cold).length};
 effects.dispose();`);
 await page.goto('about:blank');await page.addScriptTag({content:script});
 const r=await page.evaluate(()=>(window as any).flash);
 // About every 12 ft along all 100 ft once the stroke arrives; only the first half before.
 expect(r.full.length).toBe(9);expect(Math.min(...r.full)).toBeLessThan(80);expect(Math.max(...r.full)).toBeGreaterThan(920);
 expect(r.early.length).toBeGreaterThan(0);expect(Math.max(...r.early)).toBeLessThanOrEqual(520);
 expect(r.over).toBe(0);
 expect(r.strike).toBeGreaterThan(r.dim*4);
 // Lit throughout the flight, moving toward the target.
 for(const f of r.flight)expect(f.count).toBeGreaterThan(0);
 expect(r.flight[0].x).toBeLessThan(r.flight[1].x);expect(r.flight[1].x).toBeLessThan(r.flight[2].x);
 expect(r.flight[0].x).toBeLessThan(-250);
 expect(r.burst).toBeGreaterThan(0);expect(r.burstSpread).toBeLessThan(250);
 expect(r.coldLights).toBeGreaterThan(0);expect(r.coldRevealing).toBe(0);
});

// In magical darkness the flash opens the terrain cover inside the player's
// line of sight. It never opens anything past the sight boundary, and the
// cover returns exactly to its dark state when the flash ends.
test('a spell flash shows terrain only inside line of sight, only while it shines',async({page})=>{
 const script=await bundle(`
 import * as T from 'three';
 import {createMiniatureVisionComposite} from './client/src/canvas/miniatureVisionComposite';
 const size=200,renderer=new T.WebGLRenderer({alpha:true,preserveDrawingBuffer:true});renderer.setSize(size,size);renderer.setPixelRatio(1);renderer.setClearColor(0,0);
 const host=document.createElement('div');document.body.appendChild(host);host.appendChild(renderer.domElement);
 const body=new T.DataTexture(new Uint8Array([0,0,0,0]),1,1);body.needsUpdate=true;
 const compositor=createMiniatureVisionComposite(renderer,host,body),scene=new T.Scene();
 const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshBasicMaterial({color:'#c08040'}));floor.rotation.x=-Math.PI/2;floor.position.set(50,0,50);scene.add(floor);
 const camera=new T.OrthographicCamera(-50,50,50,-50,.1,1000);camera.up.set(0,0,-1);camera.position.set(50,100,50);camera.lookAt(50,0,50);camera.updateMatrixWorld();
 const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 // Darkvision around the PC at the left; a wall at x=60 ends the line of sight.
 const cover={enabled:true,origins:[rect(0,40,20,20)],sight:[rect(0,0,60,100)],lights:[],explored:[],memory:null,keepRevealed:false,grade:{heavy:true,daylight:false,near:[]}};
 const circle=(x,y,r)=>Array.from({length:48},(_,i)=>({x:x+Math.cos(i*Math.PI/24)*r,y:y+Math.sin(i*Math.PI/24)*r}));
 const flash=[{source:{id:'lightning',x:35,y:50,height:3,radius:8,strength:4,transient:true,beam:{ax:15,ay:50,bx:55,by:50}},polygon:circle(35,50,47)}];
 const frame=flashes=>{renderer.render(scene,camera);compositor.render(true,cover,camera,flashes);const gl=renderer.getContext(),p=new Uint8Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
 const pixel=(p,x,z)=>{const v=new T.Vector3(x,0,z).project(camera),px=Math.floor((v.x+1)/2*size),py=Math.floor((v.y+1)/2*size),i=(py*size+px)*4;return [p[i],p[i+1],p[i+2]];};
 const dark=frame([]),lit=frame(flash),after=frame([]);
 let changed=0;for(let i=0;i<dark.length;i++)if(dark[i]!==after[i])changed++;
 window.reveal={pc:pixel(dark,10,50),darkCenter:pixel(dark,52,50),litCenter:pixel(lit,52,50),litPastWall:pixel(lit,66,50),darkPastWall:pixel(dark,66,50),litFar:pixel(lit,52,95),changed,flashes:host.dataset.visionSpellFlashes};
 compositor.dispose();body.dispose();renderer.dispose();`);
 await page.goto('about:blank');await page.addScriptTag({content:script});
 const r=await page.evaluate(()=>(window as any).reveal);
 const isFog=(c:number[])=>Math.max(...c)<20;
 expect(isFog(r.pc)).toBe(false);
 expect(isFog(r.darkCenter)).toBe(true);
 expect(r.litCenter[0]).toBeGreaterThan(150);
 expect(r.litPastWall).toEqual(r.darkPastWall);expect(isFog(r.litPastWall)).toBe(true);
 expect(isFog(r.litFar)).toBe(true);
 expect(r.changed).toBe(0);expect(r.flashes).toBe('0');
});
