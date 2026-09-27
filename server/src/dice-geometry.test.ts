import { expect, it } from 'vitest';
import { add, center, cross, dieMesh, dot, faceForwardMesh, normal, percentileFaces, scale, roundedD6Mesh } from '../../shared/diceGeometry.js';
import { diceCollider } from '../../shared/diceCollider.js';
it('provides each real polyhedron, with ten kite faces for d10', () => {
  for (const sides of [4, 6, 8, 10, 12, 20]) {
    const mesh = dieMesh(sides);
    expect(mesh.faces.length).toBe(sides);
    expect(
      mesh.faces.every(
        (f) =>
          f.length === (sides === 6 || sides === 10 ? 4 : sides === 12 ? 5 : 3),
      ),
    ).toBe(true);
    expect(mesh.vertices.every((v) => v.every(Number.isFinite))).toBe(true);
    const edges = new Set(
      mesh.faces.flatMap((f) =>
        f.map((id, i) =>
          [id, f[(i + 1) % f.length]].sort((a, b) => a - b).join(','),
        ),
      ),
    );
    expect(mesh.vertices.length - edges.size + mesh.faces.length).toBe(2);
  }
});

it('rounds the d6 symmetrically while preserving six numbered planes and a closed convex hull', () => {
  const numbered = faceForwardMesh(dieMesh(6));
  for (const segments of [2, 5]) {
    const mesh = roundedD6Mesh(segments), edges = new Map<string, number>();
    mesh.faces.forEach((face, index) => {
      const points = face.map(i => mesh.vertices[i]);
      const n = normal(cross(add(points[1], scale(points[0], -1)), add(points[2], scale(points[0], -1))));
      const plane = dot(n, points[0]);
      expect(plane).toBeGreaterThan(0);
      expect(mesh.vertices.every(v => dot(n, v) <= plane + 1e-8)).toBe(true);
      if (index < 6) {
        center(points).forEach((v, axis) => expect(v).toBeCloseTo(center(numbered.faces[index].map(i => numbered.vertices[i]))[axis], 10));
        expect(plane).toBeCloseTo(1 / Math.sqrt(3), 10);
      }
      face.forEach((a, j) => {
        const edge = [a, face[(j + 1) % face.length]].sort((a, b) => a - b).join(',');
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      });
    });
    expect([...edges.values()].every(count => count === 2)).toBe(true);
    expect(mesh.vertices.length - edges.size + mesh.faces.length).toBe(2);
    for (const p of mesh.vertices) {
      expect(mesh.vertices.some(q => p.every((v, axis) => Math.abs(v + q[axis]) < 1e-8))).toBe(true);
      expect(Math.hypot(...p)).toBeLessThan(1);
    }
  }
});

it('retains every collision direction when eliminating duplicate d6 axes', () => {
  const shape = diceCollider(6, 1);
  for (const n of shape.faceNormals)
    expect(shape.uniqueAxes!.some(axis => Math.abs(axis.dot(n)) > 1 - 1e-10)).toBe(true);
  for (const face of shape.faces) face.forEach((a, j) => {
    const edge = shape.vertices[a].vsub(shape.vertices[face[(j + 1) % face.length]]); edge.normalize();
    expect(shape.uniqueEdges.some(axis => Math.abs(axis.dot(edge)) > 1 - 1e-10)).toBe(true);
  });
});
it('keeps d100 outcomes exact with the double-zero equals 100 convention', () => {
  expect(percentileFaces(100)).toEqual([0, 0]);
  expect(percentileFaces(1)).toEqual([0, 1]);
  expect(percentileFaces(70)).toEqual([70, 0]);
  expect(percentileFaces(99)).toEqual([90, 9]);
});

it('lands every supported die with its result face exactly parallel to the screen', () => {
  for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
    const source = dieMesh(sides);
    const before = JSON.stringify(source);
    const mesh = faceForwardMesh(source);
    const face = mesh.faces[0].map((i) => mesh.vertices[i]);
    const c = center(face);
    let n = normal(cross(add(face[1], scale(face[0], -1)), add(face[2], scale(face[0], -1))));
    if (dot(n, c) < 0) n = scale(n, -1);
    expect(n[0]).toBeCloseTo(0, 10);
    expect(n[1]).toBeCloseTo(0, 10);
    expect(n[2]).toBeCloseTo(1, 10);
    expect(c[2]).toBeGreaterThan(0);
    expect(face.every((v) => Math.abs(v[2] - c[2]) < 1e-10)).toBe(true);
    expect(mesh.vertices.every((v, i) => Math.abs(Math.hypot(...v) - Math.hypot(...source.vertices[i])) < 1e-10)).toBe(true);
    expect(JSON.stringify(source)).toBe(before); // cached geometry is not mutated
  }
});
