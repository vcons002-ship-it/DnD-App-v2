import {it,expect} from 'vitest';
import {Vector3} from 'three';
import {dieMesh,faceForwardMesh} from '../../../shared/diceGeometry';
import {fractureDie} from './diceFracture';
import {createShatterWorld} from './diceShatterPhysics';

it('partitions every die into closed irregular chunks without losing its volume or exterior faces',()=>{
 for(const sides of [4,6,8,10,12,20]){
  const source=faceForwardMesh(dieMesh(sides)),faces=source.faces.map(f=>f.map(i=>new Vector3(...source.vertices[i]))),cells=fractureDie(faces);
  let volume=0;for(const face of faces)for(let j=1;j<face.length-1;j++)volume+=face[0].dot(new Vector3().crossVectors(face[j],face[j+1]))/6;
  expect(cells).toHaveLength(11);expect(cells.every(c=>c.volume>.00001&&c.faces.length>=4)).toBe(true);
  expect(cells.reduce((sum,c)=>sum+c.volume,0)).toBeCloseTo(Math.abs(volume),5);
  const sources=new Set(cells.flatMap(c=>c.faces.filter(f=>f.source>=0).map(f=>f.source)));
  expect(sources.size).toBe(faces.length);
  for(const cell of cells){
   const edges=new Map<string,number>();
   for(const face of cell.indices)for(let i=0;i<face.length;i++){const pair=[face[i],face[(i+1)%face.length]].sort((a,b)=>a-b).join(':');edges.set(pair,(edges.get(pair)??0)+1);}
   expect([...edges.values()].every(n=>n===2)).toBe(true);
  }
 }
});

it('uses contact physics for floor, wall and fragment collisions, with gravity converted from SI',()=>{
 const world=createShatterWorld(.85),cube=faceForwardMesh(dieMesh(6)),cells=fractureDie(cube.faces.map(f=>f.map(i=>new Vector3(...cube.vertices[i]))));
 const bodies=cells.map((cell,i)=>{
  const b=world.addChunk(cell.vertices.map(v=>v.clone().multiplyScalar(.5).toArray()),cell.indices,cell.volume*.125);
  b.position.set(6.2+cell.center.x*.5,cell.center.y*.5,1.2+cell.center.z*.5);b.velocity.set(12+(i%3)*3,(i%2?1:-1)*3,4);b.angularVelocity.set(10,15,5);return b;
 });
 for(let tick=0;tick<=480;tick++)world.advance(tick*1000/120);
 const stats=world.stats();expect(stats.wallHits).toBeGreaterThan(0);expect(stats.fragmentHits).toBeGreaterThan(0);expect(stats.collisions).toBeGreaterThan(10);
 expect(bodies.every(b=>Number.isFinite(b.position.x)&&b.position.z>-.15)).toBe(true);
 expect(world.metresPerUnit).toBeGreaterThan(.01);expect(world.metresPerUnit).toBeLessThan(.03);
 bodies.forEach(b=>world.remove(b));expect(world.stats().bodies).toBe(0);world.dispose();
});
