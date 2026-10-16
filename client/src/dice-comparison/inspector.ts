import './inspector.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {createMaterialDie,getDiceStage,type MaterialDieHandle} from '../lib/materialDice';
import {diceReviewNames as names,diceReviewThemes as themes} from '../lib/diceReviewCatalog';


/** Lazy inspector shares the app's material renderer; it never rolls campaign dice. */
export function openDiceInspector(initial:{character:number;sides:number;gold:boolean}){
 return new Promise<void>(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='dice-inspector';
  dialog.setAttribute('aria-labelledby','inspector-title');
  dialog.innerHTML=`<header><h2 id="inspector-title">3D dice inspector</h2><button class="inspector-close" aria-label="Close dice inspector">Close</button></header>
   <p>Drag to rotate. Pinch or scroll to zoom. Preview the roll-strength effects without rolling.</p>
   <div class="inspector-controls">
    <label>Character <select aria-label="Inspector character">${names.map((name,i)=>`<option value="${i}">${name}</option>`).join('')}</select></label>
    <label>Die <select aria-label="Inspector die">${[4,6,8,10,12,20,100].map(n=>`<option value="${n}">d${n}${n===100?' pair':''}</option>`).join('')}</select></label>
    <label><input type="checkbox" aria-label="Inspector gold dice"> Gold dice</label>
    <label>Lighting <select aria-label="Inspector lighting"><option value="tray">Dice tray</option><option value="studio">Studio</option></select></label>
   </div>
   <div class="inspector-view" aria-label="Rotate inspected dice"><canvas></canvas></div>
   <div class="inspector-controls">
    <label>Result <input type="range" aria-label="Inspector result" min="0" max="20" step="1" value="0"><output>Unrolled</output></label>
    <label><input type="checkbox" aria-label="Inspector auto rotate" checked>Auto rotate</label>
    <button class="inspector-reset">Reset view</button><button class="inspector-replay">Replay effect</button>
   </div>`;
  document.body.append(dialog);dialog.showModal();
  const character=dialog.querySelector<HTMLSelectElement>('[aria-label="Inspector character"]')!;
  const die=dialog.querySelector<HTMLSelectElement>('[aria-label="Inspector die"]')!;
  const gold=dialog.querySelector<HTMLInputElement>('[aria-label="Inspector gold dice"]')!;
  const lighting=dialog.querySelector<HTMLSelectElement>('[aria-label="Inspector lighting"]')!;
  const result=dialog.querySelector<HTMLInputElement>('[aria-label="Inspector result"]')!;
  const rotate=dialog.querySelector<HTMLInputElement>('[aria-label="Inspector auto rotate"]')!;
  character.value=String(initial.character);die.value=String(initial.sides);gold.checked=initial.gold;
  const view=dialog.querySelector<HTMLDivElement>('.inspector-view')!,canvas=view.querySelector('canvas')!,ctx=canvas.getContext('2d')!;
  const stage=getDiceStage(),scene=new THREE.Scene();scene.environment=stage.scene.environment;scene.background=new THREE.Color('#101620');
  const camera=new THREE.PerspectiveCamera(35,1,.1,30);camera.up.set(0,0,1);
  const controls=new OrbitControls(camera,view);controls.enableDamping=true;controls.dampingFactor=.1;controls.enablePan=false;
  controls.minDistance=2.4;controls.maxDistance=8;controls.autoRotateSpeed=.65;
  const planeGeo=new THREE.PlaneGeometry(16,16),planeMat=new THREE.MeshStandardMaterial({color:'#17202c',roughness:.85});
  const floor=new THREE.Mesh(planeGeo,planeMat);floor.position.z=-1.1;scene.add(floor);
  let handles:MaterialDieHandle[]=[],frame=0,last=performance.now(),closed=false;
  const resetView=()=>{camera.position.set(2.1,-3.3,2.5);controls.target.set(0,0,0);controls.update();};
  controls.addEventListener('start',()=>{rotate.checked=false;});
  function changeLighting(){
   scene.children.filter(o=>o instanceof THREE.Light).forEach(o=>scene.remove(o));
   if(lighting.value==='studio')stage.scene.children.filter(o=>o instanceof THREE.Light).forEach(o=>scene.add(o.clone()));
   else{
    scene.add(new THREE.HemisphereLight(0xf4ead9,0x172324,.45));
    const light=new THREE.DirectionalLight(0xfff3dd,1.5);light.position.set(-9,3,6);scene.add(light);
   }
   handles.forEach(h=>h.setTrayLighting(lighting.value==='tray'));
  }
  function showResult(){
   const n=Number(die.value),value=Number(result.value);
   dialog.querySelector('output')!.textContent=value?`${value} / ${n}${value===n?' · Max':''}`:'Unrolled';
   handles.forEach(h=>h.setRollResult(value?(n===100?1:value):null,n===100&&value?value:undefined));
  }
  function choose(){
   handles.forEach(h=>{scene.remove(h.object);h.dispose();});
   const n=Number(die.value);result.max=String(n);result.value=String(Math.min(n,Number(result.value)));
   handles=(n===100?[true,false]:[false]).map((tens,i)=>{
    const h=createMaterialDie(n===100?10:n,themes[Number(character.value)],gold.checked,tens,n===100&&!tens);
    h.setFaceValues(Array.from({length:n===100?10:n},(_,j)=>n===100?(tens?j*10:j):j+1),true);
    if(n===100){h.object.scale.setScalar(.72);h.object.position.x=i===0?-.75:.75;}
    h.setTrayLighting(lighting.value==='tray');scene.add(h.object);return h;
   });
   view.dataset.character=names[Number(character.value)];view.dataset.sides=String(n);view.dataset.gold=String(gold.checked);
   showResult();
  }
  function draw(now:number){
   if(closed)return;
   const r=view.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
   if(w>0&&h>0){
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
    controls.autoRotate=rotate.checked;controls.update(Math.min(.08,(now-last)/1000));
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    handles.forEach(h=>{h.setReducedMotion(reduced);h.updatePose(camera,now);});
    stage.renderer.setSize(w,h,false);stage.renderer.render(scene,camera);ctx.drawImage(stage.renderer.domElement,0,0,w,h);
    view.dataset.camera=camera.position.toArray().map(v=>v.toFixed(3)).join(',');
   }
   last=now;frame=requestAnimationFrame(draw);
  }
  character.addEventListener('change',choose);die.addEventListener('change',choose);gold.addEventListener('change',choose);
  result.addEventListener('input',showResult);lighting.addEventListener('change',changeLighting);
  dialog.querySelector('.inspector-reset')!.addEventListener('click',resetView);
  dialog.querySelector('.inspector-replay')!.addEventListener('click',choose);
  dialog.querySelector('.inspector-close')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
   closed=true;cancelAnimationFrame(frame);controls.dispose();handles.forEach(h=>h.dispose());planeGeo.dispose();planeMat.dispose();scene.clear();dialog.remove();resolve();
  },{once:true});
  resetView();choose();changeLighting();frame=requestAnimationFrame(draw);
 });
}
