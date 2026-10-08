import * as THREE from 'three';
import {DICE_TABLE_PAN_MS,DICE_TABLE_ZOOM_MS,diceTableCameraPose,type DiceTableSeat} from './diceTableCamera';

/** Decorative trays share the active tray's geometry; only their materials and
 * nameplates are additional. No inactive dice or physics worlds are created. */
export function createDiceTableScene(scene:THREE.Scene,tray:THREE.Group,camera:THREE.PerspectiveCamera,scale:number,seats:readonly DiceTableSeat[],activeId:string,fromId:string|undefined,art:ReadonlyMap<string,THREE.Texture>){
 const active=seats.find(s=>s.id===activeId)??seats[0],from=seats.find(s=>s.id===fromId);
 const group=new THREE.Group();scene.add(group);
 const materials:THREE.Material[]=[],textures:THREE.Texture[]=[],geometry:THREE.BufferGeometry[]=[];
 const bed=tray.children.find(c=>c.name==='tray-bed') as THREE.Mesh;
 const minX=Math.min(...seats.map(s=>s.x))-10,maxX=Math.max(...seats.map(s=>s.x))+10;
 const minY=Math.min(...seats.map(s=>s.y))-8,maxY=Math.max(...seats.map(s=>s.y))+8;
 const wood=document.createElement('canvas');wood.width=512;wood.height=256;
 const ctx=wood.getContext('2d')!;ctx.fillStyle='#2e1c13';ctx.fillRect(0,0,512,256);
 for(let y=0;y<256;y++){
  const tone=42+Math.sin(y*.57)*8+Math.sin(y*.17)*5;ctx.strokeStyle=`rgb(${tone+18},${tone},${tone*.65})`;
  ctx.beginPath();for(let x=0;x<=512;x+=4){const yy=y+Math.sin(x*.018+y*.03)*1.8; x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}ctx.stroke();
 }
 for(let y=0;y<256;y+=64){ctx.fillStyle='#120b08';ctx.fillRect(0,y,512,2);}
 const grain=new THREE.CanvasTexture(wood);grain.colorSpace=THREE.SRGBColorSpace;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(3,3);textures.push(grain);
 const tableGeometry=new THREE.BoxGeometry((maxX-minX)*scale,(maxY-minY)*scale,.5),tableMaterial=new THREE.MeshStandardMaterial({map:grain,color:0x6b4430,roughness:.83,metalness:0,envMapIntensity:.12,bumpMap:grain,bumpScale:.012});
 geometry.push(tableGeometry);materials.push(tableMaterial);
 const table=new THREE.Mesh(tableGeometry,tableMaterial);table.position.set(((minX+maxX)/2-active.x)*scale,((minY+maxY)/2-active.y)*scale,-.82);table.receiveShadow=true;group.add(table);
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
 const duration=from?.id===active.id?DICE_TABLE_ZOOM_MS:DICE_TABLE_PAN_MS;
 return {
  run(){running=true;},
  state(){return {from:from?.id??'overview',to:active.id,side:active.side,progress,done:progress>=1,duration};},
  update(now:number){
   if(running&&started===undefined)started=now;
   progress=started===undefined?0:Math.min(1,(now-started)/duration);
   const point=diceTableCameraPose(from,active,progress);
   camera.position.set(point.x,point.y-8,25+point.lift).multiplyScalar(scale);
   camera.lookAt(point.x*scale,point.y*scale,.25);
  },
  dispose(){scene.remove(group);geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());},
 };
}
