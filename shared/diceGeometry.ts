/** Shared numbered faces and convex surfaces for rendering and live dice physics. */
export type V3 = [number, number, number];
export type DieMesh = { vertices: V3[]; faces: number[][] };
export const add = (a: V3, b: V3): V3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const scale = (v: V3, s: number): V3 => [v[0] * s, v[1] * s, v[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const normal = (v: V3): V3 => scale(v, 1 / (Math.hypot(...v) || 1));
export const center = (vs: V3[]): V3 =>
  scale(vs.reduce(add, [0, 0, 0]), 1 / vs.length);

/** Hull with coplanar faces merged: preserves square/pentagon/kite faces. */
function hull(vertices: V3[]): DieMesh {
  const faces: number[][] = [],
    keys = new Set<string>();
  for (let i = 0; i < vertices.length; i++)
    for (let j = i + 1; j < vertices.length; j++)
      for (let k = j + 1; k < vertices.length; k++) {
        let n = cross(
          add(vertices[j], scale(vertices[i], -1)),
          add(vertices[k], scale(vertices[i], -1)),
        );
        if (Math.hypot(...n) < 1e-6) continue;
        n = normal(n);
        let d = dot(n, vertices[i]);
        if (d < 0) {
          n = scale(n, -1);
          d = -d;
        }
        if (vertices.some((v) => dot(n, v) > d + 1e-5)) continue;
        const face = vertices
          .map((v, id) => (Math.abs(dot(n, v) - d) < 1e-5 ? id : -1))
          .filter((id) => id >= 0);
        const key = face.join(',');
        if (keys.has(key)) continue;
        keys.add(key);
        const c = center(face.map((id) => vertices[id]));
        const u = normal(add(vertices[face[0]], scale(c, -1)));
        const v = cross(n, u);
        face.sort(
          (a, b) =>
            Math.atan2(
              dot(add(vertices[a], scale(c, -1)), v),
              dot(add(vertices[a], scale(c, -1)), u),
            ) -
            Math.atan2(
              dot(add(vertices[b], scale(c, -1)), v),
              dot(add(vertices[b], scale(c, -1)), u),
            ),
        );
        faces.push(face);
      }
  return { vertices, faces };
}
function dual(mesh: DieMesh): DieMesh {
  const vs = mesh.faces.map((f) => {
    const a = mesh.vertices[f[0]],
      b = mesh.vertices[f[1]],
      c = mesh.vertices[f[2]];
    let n = normal(cross(add(b, scale(a, -1)), add(c, scale(a, -1))));
    if (dot(n, a) < 0) n = scale(n, -1);
    return scale(n, 1 / dot(n, a));
  });
  return hull(vs);
}
const cache = new Map<number, DieMesh>();
export function dieMesh(sides: number): DieMesh {
  const cached = cache.get(sides);
  if (cached) return cached;
  let mesh: DieMesh;
  if (sides === 4)
    mesh = hull([
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ]);
  else if (sides === 6)
    mesh = hull(
      [-1, 1].flatMap((x) =>
        [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as V3)),
      ),
    );
  else if (sides === 8)
    mesh = hull([
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]);
  else if (sides === 10 || sides === 100) {
    // The polar dual of a pentagonal antiprism is the standard d10
    // pentagonal trapezohedron: ten kite faces, not a d20 stand-in.
    const ring: V3[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      ring.push([Math.cos(a), Math.sin(a), i % 2 ? 0.5 : -0.5]);
    }
    mesh = dual(hull(ring));
  } else {
    const p = (1 + Math.sqrt(5)) / 2;
    const vs: V3[] = [];
    for (const a of [-1, 1])
      for (const b of [-p, p]) vs.push([0, a, b], [a, b, 0], [b, 0, a]);
    mesh = hull(vs);
    if (sides === 12) mesh = dual(mesh);
  }
  const radius = Math.max(...mesh.vertices.map((v) => Math.hypot(...v)));
  mesh = { ...mesh, vertices: mesh.vertices.map((v) => scale(v, 1 / radius)) };
  cache.set(sides, mesh);
  return mesh;
}

export function percentileFaces(value: number): [number, number] {
  const n = value === 100 ? 0 : value;
  return [Math.floor(n / 10) * 10, n % 10];
}

/** The result face (face 0) looks straight at the camera, with an upright
 * engraving basis. This is a presentation pose, never a source of roll values.
 * Using a face-local orthonormal frame also handles faces opposite the camera
 * without a degenerate rotation axis. */
export function faceForwardMesh(mesh: DieMesh): DieMesh {
  const face = mesh.faces[0].map((i) => mesh.vertices[i]);
  const c = center(face);
  let n = normal(cross(add(face[1], scale(face[0], -1)), add(face[2], scale(face[0], -1))));
  if (dot(n, c) < 0) n = scale(n, -1);
  let u: V3;
  if (mesh.faces.length === 6) {
    // Square dice land with horizontal/vertical edges, not a diamond silhouette.
    u = normal(add(face[1], scale(face[0], -1)));
  } else {
    // A triangle/pentagon points up; a d10's longest kite corner points up.
    const top = face.reduce((best, v) =>
      Math.hypot(...add(v, scale(c, -1))) > Math.hypot(...add(best, scale(c, -1))) + 1e-8 ? v : best,
    );
    const up = normal(add(top, scale(c, -1)));
    u = normal(cross(up, n));
  }
  const v = normal(cross(n, u));
  return { ...mesh, vertices: mesh.vertices.map((p) => [dot(p, u), dot(p, v), dot(p, n)]) };
}

// About a 1 mm edge radius on a 16 mm d6; the flat faces retain 88% of their width.
export const D6_EDGE_ROUNDING = .12;
export type RoundedDieMesh = DieMesh & { normals: V3[] };
const roundedD6Cache = new Map<number, RoundedDieMesh>();

/** A cube with cylindrical edges and spherical corners. The first six faces
 * keep the numbered cube's original ordering. The remaining faces only form
 * the rounded surface; they must never be interpreted as additional results.
 * Two arc segments keep collisions inexpensive; rendering uses finer arcs. */
export function roundedD6Mesh(segments = 2): RoundedDieMesh {
  if (!Number.isInteger(segments) || segments < 1 || segments > 8)
    throw new Error('Rounded d6 segments must be an integer from 1 to 8');
  const cached = roundedD6Cache.get(segments);
  if (cached) return cached;
  const base = faceForwardMesh(dieMesh(6));
  const half = 1 / Math.sqrt(3), radius = half * D6_EDGE_ROUNDING, core = half - radius;
  const vertices: V3[] = [], normals: V3[] = [], faces: number[][] = [];
  const ids = new Map<string, number>();
  const corners = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z] as V3)));
  const key = (corner: V3, direction: V3) => `${corner.join(',')}:${direction.join(',')}`;
  const vertexId = (corner: V3, direction: V3) => ids.get(key(corner, direction))!;
  for (const corner of corners) for (let i = 0; i <= segments; i++) for (let j = 0; j <= segments - i; j++) {
    const direction: V3 = [i, j, segments - i - j];
    const n = normal(direction.map((v, axis) => v * corner[axis]) as V3);
    ids.set(key(corner, direction), vertices.length);
    vertices.push(corner.map((sign, axis) => sign * core + radius * n[axis]) as V3);
    normals.push(n);
  }
  const face = (indices: number[]) => {
    const points = indices.map(i => vertices[i]);
    const n = cross(add(points[1], scale(points[0], -1)), add(points[2], scale(points[0], -1)));
    faces.push(dot(n, center(points)) < 0 ? indices.reverse() : indices);
  };
  for (const numbered of base.faces) {
    const c = center(numbered.map(i => base.vertices[i]));
    const axis = c.findIndex(v => Math.abs(v) > half * .9);
    const direction: V3 = [0, 0, 0]; direction[axis] = segments;
    face(numbered.map(i => vertexId(base.vertices[i].map(Math.sign) as V3, direction)));
  }
  for (let axis = 0; axis < 3; axis++) for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const low: V3 = [0, 0, 0]; low[axis] = -1; low[u] = a; low[v] = b;
    const high = [...low] as V3; high[axis] = 1;
    for (let j = 0; j < segments; j++) {
      const start: V3 = [0, 0, 0]; start[u] = j; start[v] = segments - j;
      const end = [...start] as V3; end[u]++; end[v]--;
      face([vertexId(low, start), vertexId(high, start), vertexId(high, end), vertexId(low, end)]);
    }
  }
  for (const corner of corners) for (let i = 0; i < segments; i++) for (let j = 0; j < segments - i; j++) {
    const at = (x: number, y: number) => vertexId(corner, [x, y, segments - x - y]);
    face([at(i, j), at(i + 1, j), at(i, j + 1)]);
    if (i + j < segments - 1) face([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  }
  const mesh = { vertices, normals, faces };
  roundedD6Cache.set(segments, mesh);
  return mesh;
}

/** Collision surface in the same local coordinates as the numbered faces. */
export function dieCollisionMesh(sides: number): DieMesh {
  return sides === 6 ? roundedD6Mesh() : faceForwardMesh(dieMesh(sides));
}
