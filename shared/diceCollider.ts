import { ConvexPolyhedron, Vec3 } from 'cannon-es';
import { dieCollisionMesh } from './diceGeometry.js';

export function diceCollider(sides: number, radius: number): ConvexPolyhedron {
  const mesh = dieCollisionMesh(sides);
  const vertices = mesh.vertices.map(v => new Vec3(v[0] * radius, v[1] * radius, v[2] * radius));
  const faces = mesh.faces.map(indices => {
    const [a, b, c] = indices.map(i => vertices[i]);
    return b.vsub(a).cross(c.vsub(a)).dot(a) < 0 ? [...indices].reverse() : [...indices];
  });
  const shape = new ConvexPolyhedron({ vertices, faces });
  if (sides === 6) {
    // Opposite/parallel directions test the same separating axis. Retain every
    // distinct direction while avoiding repeated SAT work on the rounded hull.
    const unique = (directions: Vec3[]) => directions.filter((v, i) =>
      !directions.slice(0, i).some(other => Math.abs(v.dot(other)) > 1 - 1e-10));
    shape.uniqueAxes = unique(shape.faceNormals);
    shape.uniqueEdges = unique(shape.uniqueEdges);
  }
  return shape;
}
