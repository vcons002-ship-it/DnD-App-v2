import * as THREE from 'three';
import {DICE_TABLE_PAN_MS,diceTableCameraPose,type DiceTableSeat} from './diceTableCamera';
import {createDiceTableMap} from './diceTableMap';
import type {StateSnapshot} from '../../../shared/types';

// The lacquer grain is identical for every seat and throw. Keep one browser-
// session texture instead of rasterizing and uploading 263,000 points per roll.
let tableGrain:THREE.CanvasTexture|undefined;
let tableWarmup:Promise<void>|undefined;
let tableBackground='';
export const diceTableBackground=()=>tableBackground;
export function preloadDiceTableTexture(){
 return tableWarmup??= (async()=>{
  const started=performance.now();
  const wood=document.createElement('canvas');wood.width=2048;wood.height=1024;
  const ctx=wood.getContext('2d')!;ctx.fillStyle='#382217';ctx.fillRect(0,0,2048,1024);
  for(let y=0;y<1024;y++){
   const tone=30+Math.sin(y*.71)*5+Math.sin(y*.033)*7;ctx.strokeStyle=`rgb(${tone+28},${tone+5},${tone*.65})`;
   ctx.beginPath();for(let x=0;x<=2048;x+=8){const knot=Math.exp(-(((x-1270)/330)**2)-((y-610)/220)**2)*Math.sin((x-1270)*.005)*48;const yy=y+Math.sin(x*.003+y*.008)*5+knot;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}ctx.stroke();
   // Yield while preparing the first texture so map input remains responsive.
   if(y%64===63)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  for(let y=0;y<1024;y+=256){ctx.fillStyle='#080402';ctx.fillRect(0,y,2048,2);}
  tableGrain=new THREE.CanvasTexture(wood);tableGrain.colorSpace=THREE.SRGBColorSpace;
  tableBackground=wood.toDataURL('image/jpeg',.9);
  performance.measure('dice-table-texture-preparation',{start:started,end:performance.now()});
 })();
}

/** The production tray only needs the lacquered surface. No map, peer trays,
 * camera rig or inactive dice are built for this background. */
export function createPlainDiceTableSurface(scene:THREE.Scene,scale:number){
 const geometry=new THREE.PlaneGeometry(60*scale,48*scale);
 const material=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.28,metalness:0,
  envMap:scene.environment,envMapIntensity:.06,clearcoat:.3,clearcoatRoughness:.24});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='plain-dice-table';
 mesh.position.z=-.56;mesh.receiveShadow=true;scene.add(mesh);
 return {mesh,prepare(){if(material.map===tableGrain)return false;material.map=tableGrain??null;material.needsUpdate=true;return true;},
  dispose(){scene.remove(mesh);geometry.dispose();material.dispose();}};
}

/** Decorative trays share the active tray's geometry; only their materials and
 * nameplates are additional. No inactive dice or physics worlds are created. */
export function createDiceTableScene(scene:THREE.Scene,tray:THREE.Group,camera:THREE.PerspectiveCamera,scale:number,seats:readonly DiceTableSeat[],activeId:string,fromId:string|undefined,art:ReadonlyMap<string,THREE.Texture>){
 const active=seats.find(s=>s.id===activeId)??seats[0];let from=seats.find(s=>s.id===fromId);
 const group=new THREE.Group();scene.add(group);
 const materials:THREE.Material[]=[],textures:THREE.Texture[]=[],geometry:THREE.BufferGeometry[]=[];
 const bed=tray.children.find(c=>c.name==='tray-bed') as THREE.Mesh;
 const minX=Math.min(...seats.map(s=>s.x))-10,maxX=Math.max(...seats.map(s=>s.x))+10;
 const minY=Math.min(...seats.map(s=>s.y))-8,maxY=Math.max(...seats.map(s=>s.y))+8;
 if(!tableGrain)throw new Error('Dice table texture has not been prepared');
 const grain=tableGrain;
 // An explicit map keeps the lacquer reflection independent of the brighter
 // scene environment used to make the dice inlays readable.
 const tableGeometry=new THREE.BoxGeometry((maxX-minX)*scale,(maxY-minY)*scale,.5),tableMaterial=new THREE.MeshPhysicalMaterial({map:grain,color:0xffffff,roughness:.28,metalness:0,envMap:scene.environment,envMapIntensity:.06,clearcoat:.3,clearcoatRoughness:.24});
 geometry.push(tableGeometry);materials.push(tableMaterial);
 const table=new THREE.Mesh(tableGeometry,tableMaterial);table.position.set(((minX+maxX)/2-active.x)*scale,((minY+maxY)/2-active.y)*scale,-.82);table.receiveShadow=true;group.add(table);
 const board=createDiceTableMap();textures.push(board.texture);
 const boardGeometry=new THREE.PlaneGeometry(28*scale,18*scale),boardMaterial=new THREE.MeshBasicMaterial({map:board.texture});geometry.push(boardGeometry);materials.push(boardMaterial);
 const boardMesh=new THREE.Mesh(boardGeometry,boardMaterial);boardMesh.position.set(-active.x*scale,-active.y*scale,-.54);group.add(boardMesh);
 seats.forEach(seat=>{
  if(seat.id!==active.id){
   const peer=tray.clone(true);peer.position.set((seat.x-active.x)*scale,(seat.y-active.y)*scale,0);
   const peerBed=peer.children.find(c=>c.name==='tray-bed') as THREE.Mesh;
   const material=new THREE.MeshStandardMaterial({map:art.get(seat.themeId)??(bed.material as THREE.MeshStandardMaterial).map,roughness:.94,envMapIntensity:.35});materials.push(material);peerBed.material=material;
   group.add(peer);
  }
  const label=document.createElement('canvas');label.width=512;label.height=96;
  const text=label.getContext('2d')!;text.fillStyle='#15100ddd';text.fillRect(0,0,512,96);text.strokeStyle='#9c845b';text.lineWidth=3;text.strokeRect(2,2,508,92);text.font='42px Georgia';text.textAlign='center';text.textBaseline='middle';text.fillStyle='#e9d8af';text.fillText(seat.name,256,48,480);
  const map=new THREE.CanvasTexture(label);map.colorSpace=THREE.SRGBColorSpace;textures.push(map);
  const g=new THREE.PlaneGeometry(8*scale,1.5*scale),m=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false});geometry.push(g);materials.push(m);
  const plaque=new THREE.Mesh(g,m);plaque.position.set((seat.x-active.x)*scale,(seat.y-active.y-6)*scale,-.55);group.add(plaque);
 });
 let started:number|undefined,running=false,progress=0;
 let duration=!from||from.id===active.id?0:DICE_TABLE_PAN_MS;
 return {
  restart(previousId:string|undefined){from=seats.find(s=>s.id===previousId);duration=!from||from.id===active.id?0:DICE_TABLE_PAN_MS;started=undefined;running=false;progress=0;},
  run(){running=true;started??=performance.now();},
  map(snapshot:StateSnapshot,viewerId?:string){board.update(snapshot,viewerId);},
  state(){return {from:from?.id??'overview',to:active.id,side:active.side,progress,done:progress>=1,duration};},
  update(now:number){
   if(running&&started===undefined)started=now;
   progress=duration===0?1:started===undefined?0:Math.max(0,Math.min(1,(now-started)/duration));
   const point=diceTableCameraPose(from,active,progress);
   camera.position.set(point.x,point.y-8,25+point.lift).multiplyScalar(scale);
   camera.lookAt(point.x*scale,point.y*scale,.25);
  },
  dispose(){board.dispose();scene.remove(group);geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());},
 };
}
