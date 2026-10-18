import{it,expect}from'vitest';
import{Box3,BoxGeometry,CylinderGeometry,Group,LatheGeometry,Mesh,MeshStandardMaterial,Vector2}from'three';
import{refitPewterPedestal}from'../../client/src/canvas/miniatureBasePlacement.js';

const pedestal=()=>new LatheGeometry([[0,-.0275],[.47,-.0275],[.5,0],[.485,.075],[.465,.1025],[.44,.1025],[.425,.085],[0,.085]].map(([x,y])=>new Vector2(x,y)),32);
function fixture(baked=false,wrapped=false,zUp=false){
 const scene=new Group(),parent=new Group();scene.add(parent);
 const base=new Mesh(new CylinderGeometry(.5,.5,.055,32),new MeshStandardMaterial());base.name='test_round_base';
 const body=new Mesh(new BoxGeometry(.3,1,.3),new MeshStandardMaterial());body.name='body';
 if(baked){base.geometry.translate(0,.0275,0);body.geometry.translate(0,.555,0);}else{base.position.y=.0275;body.position.y=.555;}
 if(zUp){base.geometry.rotateX(Math.PI/2);body.geometry.rotateX(Math.PI/2);base.position.set(0,0,base.position.y);body.position.set(0,0,body.position.y);parent.rotation.x=-Math.PI/2;}
 parent.add(base,body);if(wrapped){const wrapper=new Group();scene.add(wrapper);wrapper.add(parent);wrapper.position.set(2,0,-3);}
 return{scene,base,body};
}
for(const [name,baked,wrapped,zUp]of [
 ['ordinary mesh origins',false,false,false],['baked generated geometry',true,false,false],
 ['uploaded nested hierarchy',true,true,false],['Z-up uploaded hierarchy',true,true,true],
]as const)it('seats feet on the inner top for '+name,()=>{
 const{scene,body,base}=fixture(baked,wrapped,zUp);scene.updateWorldMatrix(true,true);const oldFloor=new Box3().setFromObject(base).min.y;
 refitPewterPedestal(scene,1,pedestal);
 expect(new Box3().setFromObject(body).min.y).toBeCloseTo(oldFloor+.1125,6);
 expect(new Box3().setFromObject(base).min.y).toBeCloseTo(oldFloor,6);
 expect(new Box3().setFromObject(base).max.x-new Box3().setFromObject(base).min.x).toBeCloseTo(1,6);
 const before=body.matrixWorld.clone();refitPewterPedestal(scene,1,pedestal);expect(body.matrixWorld.equals(before)).toBe(true);
});
it('preserves intentional hovering, nested attachments, and baseless models',()=>{
 const{scene,body}=fixture(true,true);body.position.y=.2;
 const attachment=new Mesh(new BoxGeometry(.1,.1,.1));attachment.position.y=1;body.add(attachment);scene.updateMatrixWorld(true);
 const relative=new Box3().setFromObject(attachment).min.y-new Box3().setFromObject(body).min.y;
 refitPewterPedestal(scene,1,pedestal);expect(new Box3().setFromObject(body).min.y).toBeCloseTo(.3125,6);
 expect(new Box3().setFromObject(attachment).min.y-new Box3().setFromObject(body).min.y).toBeCloseTo(relative,6);
 const empty=new Group(),mesh=new Mesh(new BoxGeometry(1,1,1));empty.add(mesh);const y=mesh.position.y;expect(refitPewterPedestal(empty,1,pedestal)).toEqual([]);expect(mesh.position.y).toBe(y);
});
it('keeps support contact when the source hierarchy and base diameter are scaled',()=>{
 const{scene,body,base}=fixture(true,true);scene.children[0].scale.setScalar(2);
 refitPewterPedestal(scene,2,()=>pedestal().scale(2,2,2));
 expect(new Box3().setFromObject(body).min.y).toBeCloseTo(.225,6);
 const bounds=new Box3().setFromObject(base);expect(bounds.min.y).toBeCloseTo(0,6);expect(bounds.max.x-bounds.min.x).toBeCloseTo(2,6);
});
