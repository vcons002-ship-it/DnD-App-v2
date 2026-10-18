import {BufferGeometry,Float32BufferAttribute,Mesh,InstancedMesh,Matrix4,Vector3,type Object3D} from 'three';

/** Bake the loaded figure's geometry into one unlit planning silhouette.
 * Source geometry/materials are never edited. Prepare while the asset loads,
 * so starting a drag neither clones dozens of draw groups nor links a PBR
 * shader. The usual scene depth test still occludes it behind real figures. */
export function createMiniatureMovePreviewGeometry(source:Object3D):BufferGeometry {
 source.updateWorldMatrix(true,true);
 const parentInverse=source.parent?.matrixWorld.clone().invert()??new Matrix4();
 const parts:{mesh:Mesh;matrix:Matrix4;start:number;count:number}[]=[];
 let count=0;
 source.traverseVisible(node=>{
  if(!(node instanceof Mesh)||node.name==='disposition-outline')return;
  const position=node.geometry.getAttribute('position');if(!position)return;
  const range=node.geometry.drawRange,start=range.start,partCount=Math.max(0,Math.min(range.count,(node.geometry.index?.count??position.count)-start));
  const matrix=parentInverse.clone().multiply(node.matrixWorld);
  if(node instanceof InstancedMesh){for(let i=0;i<node.count;i++){const instance=new Matrix4();node.getMatrixAt(i,instance);parts.push({mesh:node,matrix:matrix.clone().multiply(instance),start,count:partCount});count+=partCount;}}
  else{parts.push({mesh:node,matrix,start,count:partCount});count+=partCount;}
 });
 const vertices=new Float32Array(count*3),vertex=new Vector3();let offset=0;
 for(const {mesh,matrix,start,count}of parts){
  for(let i=start;i<start+count;i++){
   mesh.getVertexPosition(mesh.geometry.index?.getX(i)??i,vertex).applyMatrix4(matrix);
   vertices[offset++]=vertex.x;vertices[offset++]=vertex.y;vertices[offset++]=vertex.z;
  }
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.computeBoundingSphere();return geometry;
}
