import * as THREE from 'three';

/** Curved, veined leaves shared by the rolling wake and maximum-roll swirls. */
export function createDiceLeafArt(){
 const positions:number[]=[],uv:number[]=[],faces:number[]=[];
 for(let j=0;j<=10;j++)for(const side of [-1,0,1]){
  const t=j/10,w=Math.pow(Math.sin(t*Math.PI),.85)*.24*(j%2?.94:1);
  positions.push(side*w,t-.5,.11*Math.sin(t*Math.PI)-Math.abs(side)*.07*Math.sin(t*Math.PI)+side*.035*Math.sin(t*6));uv.push((side+1)/2,t);
 }
 for(let j=0;j<10;j++)for(let k=0;k<2;k++){const a=j*3+k,b=a+3;faces.push(a,b,a+1,a+1,b,b+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(faces);geometry.computeVertexNormals();
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
 const ctx=canvas.getContext('2d')!,image=ctx.createImageData(128,256);
 for(let y=0;y<256;y++)for(let x=0;x<128;x++){
  const spine=Math.exp(-Math.pow((x-64)/2.1,2)),branch=Math.exp(-Math.pow(Math.sin((y-Math.abs(x-64)*1.15)*.16)*9,2));
  const grain=Math.sin(x*13.1+y*7.3)*Math.sin(x*3.9-y*12.1),v=88+spine*65+branch*24+grain*8;
  image.data.set([v*.83,v,v*.67,255],(y*128+x)*4);
 }
 ctx.putImageData(image,0,0);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 return {geometry,map};
}
