import { expect, it } from 'vitest';
import { add, center, cross, dieMesh, dot, faceForwardMesh, normal, percentileFaces, scale } from '../../shared/diceGeometry.js';
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
