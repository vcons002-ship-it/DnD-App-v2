import {Vector3} from 'three';

export type FracturePlane={normal:Vector3;distance:number};
export type FractureFace={points:Vector3[];source:number};
export type DieFragment={faces:FractureFace[];planes:FracturePlane[];center:Vector3;vertices:Vector3[];indices:number[][];volume:number};
const EPS=1e-6;
export function clipFracturePolygon(points:Vector3[],plane:FracturePlane){
 const result:Vector3[]=[],cuts:Vector3[]=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],da=plane.normal.dot(a)-plane.distance,db=plane.normal.dot(b)-plane.distance;
  if(da<=EPS)result.push(a.clone());
  if((da< -EPS&&db>EPS)||(da>EPS&&db< -EPS)){
   const p=a.clone().lerp(b,da/(da-db));result.push(p);cuts.push(p);
  }
 }
 return {points:result,cuts};
}
const unique=(points:Vector3[])=>points.filter((p,i)=>points.findIndex(q=>p.distanceToSquared(q)<EPS*EPS)===i);
function clipSolid(faces:FractureFace[],plane:FracturePlane){
 const result:FractureFace[]=[],cut:Vector3[]=[];
 for(const face of faces){const clipped=clipFracturePolygon(face.points,plane);if(clipped.points.length>=3)result.push({points:clipped.points,source:face.source});cut.push(...clipped.cuts);}
 const cap=unique(cut);
 if(cap.length>=3){
  const center=cap.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/cap.length);
  const u=cap[0].clone().sub(center).normalize(),v=new Vector3().crossVectors(plane.normal,u).normalize();
  cap.sort((a,b)=>Math.atan2(a.clone().sub(center).dot(v),a.clone().sub(center).dot(u))-Math.atan2(b.clone().sub(center).dot(v),b.clone().sub(center).dot(u)));
  result.push({points:cap,source:-1});
 }
 return result;
}

/** Voronoi cells partition the actual polyhedron into irregular convex chunks.
 * Exterior polygons retain their source face; only newly exposed cuts are lava. */
export function fractureDie(source:Vector3[][]):DieFragment[]{
 const faces=source.map((face,i)=>{
  const points=face.map(p=>p.clone()),n=new Vector3().crossVectors(points[1].clone().sub(points[0]),points[2].clone().sub(points[0]));
  if(n.dot(points[0])<0)points.reverse();return {points,source:i};
 });
 const room=Math.min(...faces.map(f=>new Vector3().crossVectors(f.points[1].clone().sub(f.points[0]),f.points[2].clone().sub(f.points[0])).normalize().dot(f.points[0])));
 const seeds=[new Vector3(.04,-.06,.025).multiplyScalar(room)];
 for(let i=0;i<10;i++){
  const z=1-2*(i+.5)/10,a=i*2.399963+.19*Math.sin(i*3.17),r=Math.sqrt(1-z*z);
  seeds.push(new Vector3(Math.cos(a)*r,Math.sin(a)*r,z).multiplyScalar(room*(.57+.10*Math.sin(i*7.3))));
 }
 return seeds.map((seed,i)=>{
  const planes=seeds.flatMap((other,j)=>j===i?[]:[{normal:other.clone().sub(seed).normalize(),distance:(other.lengthSq()-seed.lengthSq())/(2*other.distanceTo(seed))}]);
  const cell=planes.reduce(clipSolid,faces),vertices=unique(cell.flatMap(f=>f.points));
  const center=vertices.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/vertices.length);
  const indices=cell.map(f=>f.points.map(p=>vertices.findIndex(v=>p.distanceToSquared(v)<EPS*EPS)));
  let volume=0;
  for(const face of indices)for(let j=1;j<face.length-1;j++)volume+=vertices[face[0]].clone().sub(center).dot(new Vector3().crossVectors(vertices[face[j]].clone().sub(center),vertices[face[j+1]].clone().sub(center)))/6;
  return {faces:cell,planes,center,vertices:vertices.map(p=>p.clone().sub(center)),indices,volume:Math.abs(volume)};
 });
}
