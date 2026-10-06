import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {createMaterialDie,getDiceStage,type MaterialDieHandle} from '../lib/materialDice';
import {diceThemeForClass,diceThemeForRoll} from '../../../shared/diceThemes';

const names=['Druk','Varis','Vanec','DM'];
const descriptions=['Smooth obsidian, gold edges and numbers','Forest resin, lacquered wood and bronze','Dark red glass, silver numbers, test lightning','Deep purple resin, cloudy interior, gold numbers'];
const themes=[diceThemeForClass('Fighter'),diceThemeForClass('Ranger'),diceThemeForClass('Sorcerer'),diceThemeForRoll('',true)];
const grid=document.querySelector<HTMLDivElement>('#models')!;
const select=document.querySelector<HTMLSelectElement>('#die')!;
const spin=document.querySelector<HTMLInputElement>('#spin')!;
const status=document.querySelector<HTMLParagraphElement>('#status')!;
const stage=getDiceStage();
const backdrop=document.createElement('canvas');backdrop.width=backdrop.height=512;
const bg=backdrop.getContext('2d')!;bg.fillStyle='#1b2330';bg.fillRect(0,0,512,512);
bg.strokeStyle='#435064';bg.lineWidth=2;
for(let i=0;i<=512;i+=64){bg.beginPath();bg.moveTo(i,0);bg.lineTo(i,512);bg.moveTo(0,i);bg.lineTo(512,i);bg.stroke();}
const map=new THREE.CanvasTexture(backdrop);map.colorSpace=THREE.SRGBColorSpace;
const views=names.map((name,i)=>{
 const panel=document.createElement('section');panel.className='panel';panel.dataset.name=name;
 panel.innerHTML=`<h2>${name}</h2><p class="description">${descriptions[i]}</p><div class="model" aria-label="Rotate ${name} dice"><canvas></canvas></div><div class="model-controls"><button class="reset">Reset</button><label><input class="rotate" type="checkbox" checked>Auto rotate</label>${i===2?'<label><input id="lightning" type="checkbox" checked>Internal lightning test</label>':''}</div>`;
 grid.append(panel);
 const element=panel.querySelector<HTMLDivElement>('.model')!,canvas=element.querySelector('canvas')!,ctx=canvas.getContext('2d')!;
 const scene=stage.scene.clone();scene.background=new THREE.Color('#121822');
 const camera=stage.camera.clone();
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(16,16),new THREE.MeshStandardMaterial({map,roughness:.8,metalness:0}));plane.position.z=-2;scene.add(plane);
 const controls=new OrbitControls(camera,element);controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=false;controls.minDistance=2.6;controls.maxDistance=8;controls.autoRotateSpeed=.65;
 const rotate=panel.querySelector<HTMLInputElement>('.rotate')!;
 const view={panel,element,canvas,ctx,scene,camera,controls,rotate,handles:[] as MaterialDieHandle[],reset(){camera.position.set(1.8,1.05,3.7);controls.target.set(0,0,0);controls.update();}};
 panel.querySelector('.reset')!.addEventListener('click',()=>view.reset());
 controls.addEventListener('start',()=>{rotate.checked=false;});
 view.reset();return view;
});
function choose(){
 const sides=Number(select.value);
 views.forEach((view,i)=>{
  view.handles.forEach(h=>{view.scene.remove(h.object);h.dispose();});
  view.handles=(sides===100?[true,false]:[false]).map((tens,j)=>{
   const h=createMaterialDie(sides===100?10:sides,themes[i],false,tens,sides===100&&!tens);
   h.setFaceValues(Array.from({length:sides===100?10:sides},(_,k)=>sides===100?(tens?k*10:k):k+1),true);
   h.object.rotation.set(.15,.35,0);
   if(sides===100){h.object.scale.setScalar(.72);h.object.position.x=j===0?-.75:.75;}
   h.setInternalLightning(i===2&&document.querySelector<HTMLInputElement>('#lightning')!.checked);
   view.scene.add(h.object);return h;
  });
  view.element.dataset.die=String(sides);
 });
 status.textContent=`All four d${sides} models ready. Rotate individually to compare reflections and materials.`;
}
select.addEventListener('change',choose);
spin.addEventListener('change',()=>views.forEach(v=>v.rotate.checked=spin.checked));
document.querySelector('#reset')!.addEventListener('click',()=>views.forEach(v=>v.reset()));
document.querySelector('#lightning')!.addEventListener('change',()=>{
 const enabled=document.querySelector<HTMLInputElement>('#lightning')!.checked;
 views[2].handles.forEach(h=>h.setInternalLightning(enabled));
 views[2].element.dataset.lightning=String(enabled);
});
choose();views[2].element.dataset.lightning='true';
let last=performance.now(),renderTime=0;
stage.renderer.setAnimationLoop((now:number)=>{
 if(now-renderTime<1000/40)return;renderTime=now;
 const dt=Math.min(.08,(now-last)/1000);last=now;
 views.forEach(view=>{
  const r=view.element.getBoundingClientRect();
  // Skip offscreen panels on phones; shader time still stays continuous.
  if(r.bottom<0||r.top>innerHeight)return;
  const dpr=Math.min(devicePixelRatio,1.5),width=Math.round(r.width*dpr),height=Math.round(r.height*dpr);
  if(view.canvas.width!==width||view.canvas.height!==height){view.canvas.width=width;view.canvas.height=height;}
  view.camera.aspect=r.width/r.height;view.camera.updateProjectionMatrix();
  view.controls.autoRotate=view.rotate.checked;view.controls.update(dt);
  view.handles.forEach(h=>h.updatePose(view.camera,now));
  stage.renderer.setSize(width,height,false);stage.renderer.render(view.scene,view.camera);
  view.ctx.drawImage(stage.renderer.domElement,0,0,width,height);
  view.element.dataset.camera=view.camera.position.toArray().map(v=>v.toFixed(3)).join(',');
 });
});
