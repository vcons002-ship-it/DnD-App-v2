import {CanvasTexture,Group,Mesh,MeshBasicMaterial,PlaneGeometry,SRGBColorSpace,type Scene} from 'three';
import {BOOT_SHAPE,BOOT_TREAD,type FootprintMark} from './FootprintTrails';

/** Ground impressions share miniature depth, above the darkness terrain pass. */
export function createMiniatureFootprints(scene:Scene){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const c=canvas.getContext('2d')!;c.translate(64,64);c.scale(96,96);
  c.fillStyle='#fff3d8';c.strokeStyle='#181b20';c.lineWidth=.085;
  const shape=new Path2D(BOOT_SHAPE);c.fill(shape);c.stroke(shape);
  c.strokeStyle='#514c43';c.lineWidth=.055;c.globalAlpha=.8;c.stroke(new Path2D(BOOT_TREAD));
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  const geometry=new PlaneGeometry(128/96,128/96),root=new Group();root.name='ground-footprints';scene.add(root);
  const pool:Mesh<PlaneGeometry,MeshBasicMaterial>[]=[];
  return {sync(marks:FootprintMark[]){
    while(pool.length<marks.length){
      const mesh=new Mesh(geometry,new MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
      mesh.rotation.x=-Math.PI/2;mesh.renderOrder=4;root.add(mesh);pool.push(mesh);
    }
    pool.forEach((mesh,i)=>{
      const m=marks[i];mesh.visible=!!m;if(!m)return;
      mesh.position.set(m.x,.04,m.y);mesh.rotation.z=-m.angle*Math.PI/180;
      mesh.scale.set(m.foot,m.foot*m.side,1);mesh.material.opacity=m.opacity;
    });
  },dispose(){scene.remove(root);pool.forEach(m=>m.material.dispose());geometry.dispose();texture.dispose();}};
}
