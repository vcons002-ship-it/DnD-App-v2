import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {createMaterialDie,getDiceStage} from '../lib/materialDice';
import {diceThemeForRoll} from '../../../shared/diceThemes';

const viewer=document.querySelector<HTMLDivElement>('#viewer')!;
const status=document.querySelector<HTMLParagraphElement>('#status')!;
const select=document.querySelector<HTMLSelectElement>('#die')!;
const spin=document.querySelector<HTMLInputElement>('#spin')!;
const energy=document.querySelector<HTMLInputElement>('#energy')!;

try {
  const {renderer,scene,camera}=getDiceStage();
  renderer.setClearColor(0x14101c,1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';
  viewer.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.09;
  controls.enablePan=false;controls.minDistance=2.6;controls.maxDistance=7;
  controls.autoRotateSpeed=1;
  let handle:ReturnType<typeof createMaterialDie>;
  let energyTime=0,previous=performance.now();

  function reset(){camera.position.set(2.4,1.6,3.5);controls.target.set(0,0,0);controls.update();}
  function choose(){
    handle?.dispose();
    const sides=Number(select.value);
    handle=createMaterialDie(sides,diceThemeForRoll('',true),false,false,false);
    handle.setFaceValues(Array.from({length:sides},(_,i)=>i+1),true);
    handle.object.rotation.set(.15,.35,0);
    scene.add(handle.object);
    viewer.dataset.die=String(sides);
    status.textContent=`d${sides} · Deep purple semi-transparent resin · Metallic gold inlays`;
  }
  function resize(){
    const {width,height}=viewer.getBoundingClientRect();
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  select.addEventListener('change',choose);
  document.querySelector('#reset')!.addEventListener('click',reset);
  controls.addEventListener('start',()=>{spin.checked=false;});
  new ResizeObserver(resize).observe(viewer);
  reset();choose();resize();
  renderer.setAnimationLoop((now:number)=>{
    const dt=Math.min(.05,(now-previous)/1000);previous=now;
    if(energy.checked)energyTime+=dt*1000;
    controls.autoRotate=spin.checked;controls.update(dt);
    handle.updatePose(camera,energyTime);renderer.render(scene,camera);
    // Observable camera state for checking drag/reset in the mobile preview.
    viewer.dataset.camera=camera.position.toArray().map(v=>v.toFixed(3)).join(',');
    viewer.dataset.energyTime=String(Math.round(energyTime));
  });
} catch(error) {
  status.textContent='The 3D viewer could not start. Try a browser with WebGL enabled.';
  console.error(error);
}
