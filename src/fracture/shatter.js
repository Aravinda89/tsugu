// Cells → shard meshes + crack polylines.
//
// The labelled grid (see voronoi.js) is cut along the cell boundaries. Inside
// each grid quad the boundary runs through points interpolated on the quad's
// edges (where two seeds are equally near) and, where three or more cells
// meet, through a junction at the quad's centre. Every boundary point has a
// numeric key derived from the grid edge it lies on, so neighbouring shards
// share identical vertices.
//
// Each shard is: outer surface + inner surface sampled from the intact pot's
// own vertices (so mending back to the intact mesh is seamless), a strip of
// rim where the shard reaches the lip, and broken side walls along its
// boundary, with a dark fired core through the middle of the wall.

import * as THREE from 'three';
import { pickSeeds, labelSurface } from './voronoi.js';

export const MAX_SHARDS = 20;

export function fracturePot(geometry, { count = 14, impact, seed = 1 } = {}) {
  const { segU, segV, segT, repU } = geometry.userData.grid;
  const stride = segU + 1;
  const outerRows = segV + 1;
  const RIM = outerRows * stride;
  const INNER = RIM + (segT + 1) * stride;
  const pos = geometry.attributes.position.array;
  const nrm = geometry.attributes.normal.array;
  const uva = geometry.attributes.uv.array;
  const cola = geometry.attributes.color.array;

  const outerPositions = pos.subarray(0, outerRows * stride * 3);
  const seeds = pickSeeds({
    positions: outerPositions,
    segU,
    segV,
    count: Math.min(count, MAX_SHARDS),
    impact: impact ?? new THREE.Vector3(),
    seed,
  });
  const { labels, dist, count: shardCount, seedOf, vertexCount: V } = labelSurface({
    positions: outerPositions,
    segU,
    segV,
    seeds,
    seed,
  });
  const L = (i, j) => labels[j * stride + i];
  const D = (label, i, j) => dist[seedOf[label] * V + j * stride + i];

  // --- Keys: corners, edge crossings, quad centres ---------------------------
  const POLE = 0;
  const cornerKey = (i, j) => (j === 0 ? POLE : 1 + j * segU + (i % segU));
  const hKey = (i, j) => 1 + V + j * segU + (i % segU);
  const vKey = (i, j) => 1 + 2 * V + j * segU + (i % segU);
  const mKey = (i, j) => 1 + 3 * V + j * segU + i;
  const K = 4 * V + 8; // edge key = a * K + b

  const corner = (i, j) => ({ key: cornerKey(i, j), fi: i, fj: j });

  // Where along the edge lo→hi the two cells are equally near.
  function crossing(ia, ja, ib, jb) {
    const flip = ja === jb ? ia > ib : ja > jb;
    if (flip) [ia, ja, ib, jb] = [ib, jb, ia, ja];
    const la = L(ia, ja), lb = L(ib, jb);
    const fa = D(la, ia, ja) - D(lb, ia, ja);
    const fb = D(la, ib, jb) - D(lb, ib, jb);
    let s = fa < 0 && fb > 0 ? fa / (fa - fb) : 0.5;
    s = Math.min(Math.max(s, 0.12), 0.88);
    const key = ja === jb ? hKey(ia, ja) : vKey(ia, ja);
    return { key, fi: ia + s * (ib - ia), fj: ja + s * (jb - ja) };
  }

  // --- Cut every quad into per-shard pieces ----------------------------------
  // Whole quads are kept as (i, j) pairs. Mixed quads become polygons, CCW in
  // grid space: [entry crossing, corners…, exit crossing, centre]. The crack
  // inside a quad is exactly the two polygon edges that touch its centre, so
  // those are the shard's boundary (walls) — every other edge is shared with
  // a neighbouring quad of the same shard.
  const quads = Array.from({ length: shardCount }, () => []);
  const polys = Array.from({ length: shardCount }, () => []);
  const walls = Array.from({ length: shardCount }, () => []);
  const cs = [[0, 0], [0, 0], [0, 0], [0, 0]];
  const ls = [0, 0, 0, 0];
  const cross = [null, null, null, null];
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      cs[0][0] = i; cs[0][1] = j;
      cs[1][0] = i + 1; cs[1][1] = j;
      cs[2][0] = i + 1; cs[2][1] = j + 1;
      cs[3][0] = i; cs[3][1] = j + 1;
      for (let c = 0; c < 4; c++) ls[c] = L(cs[c][0], cs[c][1]);
      if (ls[0] === ls[1] && ls[1] === ls[2] && ls[2] === ls[3]) {
        quads[ls[0]].push(i, j);
        continue;
      }
      let mi = 0, mj = 0, mc = 0;
      for (let e = 0; e < 4; e++) {
        const n = (e + 1) % 4;
        cross[e] = ls[e] !== ls[n] ? crossing(cs[e][0], cs[e][1], cs[n][0], cs[n][1]) : null;
        if (cross[e]) {
          mi += cross[e].fi;
          mj += cross[e].fj;
          mc++;
        }
      }
      const m = { key: mKey(i, j), fi: mi / mc, fj: mj / mc };
      // Walk the runs of equal labels around the quad.
      let e = 0;
      while (ls[(e + 3) % 4] === ls[e]) e++;
      let walked = 0;
      while (walked < 4) {
        const label = ls[e];
        const pts = [cross[(e + 3) % 4]];
        let k = e;
        for (;;) {
          pts.push(corner(cs[k][0], cs[k][1]));
          walked++;
          const nk = (k + 1) % 4;
          if (ls[nk] !== label) {
            pts.push(cross[k]);
            e = nk;
            break;
          }
          k = nk;
        }
        pts.push(m);
        polys[label].push(pts);
        walls[label].push({ a: pts[pts.length - 2], b: m }, { a: m, b: pts[0] });
      }
    }
  }

  // The lip: each top-row edge belongs to one shard, or is split between two
  // where a crack reaches the rim. Segments run right to left (CCW order).
  const rims = Array.from({ length: shardCount }, () => []);
  const rimCracks = new Map(); // crossing key → fi
  for (let i = 0; i < segU; i++) {
    const la = L(i, segV), lb = L(i + 1, segV);
    if (la === lb) {
      rims[la].push(i + 1, i);
    } else {
      const x = crossing(i, segV, i + 1, segV);
      rims[lb].push(i + 1, x.fi);
      rims[la].push(x.fi, i);
      rimCracks.set(x.key, x.fi);
    }
  }

  // --- Sampling the intact pot's attributes at a grid point -----------------
  // patch: 0 outer, 1 inner (rows mirrored), 2 rim (fj is the rim row).
  const sample = { p: [0, 0, 0], n: [0, 0, 0], uv: [0, 0], c: 0 };
  function sampleAt(patch, fi, fj) {
    const rows = patch === 2 ? segT : segV;
    const i0 = Math.min(Math.max(Math.floor(fi), 0), segU - 1);
    const j0 = Math.min(Math.max(Math.floor(fj), 0), rows - 1);
    const a = Math.min(Math.max(fi - i0, 0), 1);
    const b = Math.min(Math.max(fj - j0, 0), 1);
    const row = (j) => (patch === 0 ? j : patch === 1 ? INNER / stride + (segV - j) : RIM / stride + j);
    const v00 = row(j0) * stride + i0, v10 = v00 + 1;
    const v01 = row(j0 + 1) * stride + i0, v11 = v01 + 1;
    const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
    for (let x = 0; x < 3; x++) {
      sample.p[x] = pos[v00 * 3 + x] * w00 + pos[v10 * 3 + x] * w10 + pos[v01 * 3 + x] * w01 + pos[v11 * 3 + x] * w11;
      sample.n[x] = nrm[v00 * 3 + x] * w00 + nrm[v10 * 3 + x] * w10 + nrm[v01 * 3 + x] * w01 + nrm[v11 * 3 + x] * w11;
    }
    for (let x = 0; x < 2; x++) {
      sample.uv[x] = uva[v00 * 2 + x] * w00 + uva[v10 * 2 + x] * w10 + uva[v01 * 2 + x] * w01 + uva[v11 * 2 + x] * w11;
    }
    sample.c = cola[v00 * 3] * w00 + cola[v10 * 3] * w10 + cola[v01 * 3] * w01 + cola[v11 * 3] * w11;
    return sample;
  }
  const point3 = (patch, pt) => {
    const s = sampleAt(patch, pt.fi, pt.fj);
    return new THREE.Vector3(s.p[0], s.p[1], s.p[2]);
  };

  // --- Build each shard ------------------------------------------------------
  const crackEdges = new Map(); // undirected edge key → { a, b }
  const shards = [];

  for (let label = 0; label < shardCount; label++) {
    const P = [], N = [], UV = [], C = [], I = [];
    // Surface vertices are shared within a shard: grid corners through a flat
    // lookup table, points between corners through a map.
    const shared = new Map();
    const cornerIndex = new Int32Array(3 * stride * (segV + 1)).fill(-1);
    const vertex = (patch, fi, fj) => {
      const whole = (fi | 0) === fi && (fj | 0) === fj;
      const slot = whole ? (patch * (segV + 1) + fj) * stride + fi : -1;
      let idx = whole ? cornerIndex[slot] : shared.get(patch * 1e12 + Math.round(fi * 1000) * 1e6 + Math.round(fj * 1000));
      if (idx !== undefined && idx >= 0) return idx;
      const s = sampleAt(patch, fi, fj);
      idx = P.length / 3;
      P.push(s.p[0], s.p[1], s.p[2]);
      const l = Math.sqrt(s.n[0] * s.n[0] + s.n[1] * s.n[1] + s.n[2] * s.n[2]) || 1;
      N.push(s.n[0] / l, s.n[1] / l, s.n[2] / l);
      UV.push(s.uv[0], s.uv[1]);
      C.push(s.c, s.c, s.c);
      if (whole) cornerIndex[slot] = idx;
      else shared.set(patch * 1e12 + Math.round(fi * 1000) * 1e6 + Math.round(fj * 1000), idx);
      return idx;
    };
    // Triangles CCW in grid space, as vertex-index triples for a given patch.
    // Outer faces are wound the other way so they face out, like the intact mesh.
    const outer = [], inner = [];
    const triangle = (a, b, c) => {
      outer.push(vertex(0, a.fi, a.fj), vertex(0, c.fi, c.fj), vertex(0, b.fi, b.fj));
      inner.push(vertex(1, a.fi, a.fj), vertex(1, b.fi, b.fj), vertex(1, c.fi, c.fj));
    };
    const q0 = { fi: 0, fj: 0 }, q1 = { fi: 0, fj: 0 }, q2 = { fi: 0, fj: 0 }, q3 = { fi: 0, fj: 0 };
    const list = quads[label];
    for (let k = 0; k < list.length; k += 2) {
      const i = list[k], j = list[k + 1];
      q0.fi = i; q0.fj = j;
      q1.fi = i + 1; q1.fj = j;
      q2.fi = i + 1; q2.fj = j + 1;
      q3.fi = i; q3.fj = j + 1;
      // Same diagonal as the intact mesh; the first triangle collapses at the base centre.
      if (j > 0) triangle(q0, q1, q3);
      triangle(q1, q2, q3);
    }
    for (const p of polys[label]) {
      const m = p[p.length - 1];
      for (let k = 0; k < p.length - 2; k++) {
        if (p[k].key === POLE && p[k + 1].key === POLE) continue;
        triangle(m, p[k], p[k + 1]);
      }
    }
    const outerTriangles = outer.length / 3;
    for (let k = 0; k < outer.length; k++) I.push(outer[k]);
    for (let k = 0; k < inner.length; k++) I.push(inner[k]);

    // Rim strips where the shard meets the lip.
    const rim = rims[label];
    for (let k = 0; k < rim.length; k += 2) {
      const fa = rim[k], fb = rim[k + 1];
      for (let r = 0; r < segT; r++) {
        const A = vertex(2, fa, r), B = vertex(2, fb, r);
        const Cc = vertex(2, fb, r + 1), Dd = vertex(2, fa, r + 1);
        I.push(B, Cc, A, A, Cc, Dd);
      }
    }
    const clayIndices = I.length;

    // Broken side walls along every crack.
    const wallBoundary = walls[label];
    const o = new THREE.Vector3(), q = new THREE.Vector3(), ip = new THREE.Vector3(), iq = new THREE.Vector3();
    const mp = new THREE.Vector3(), mq = new THREE.Vector3(), face = new THREE.Vector3(), out = new THREE.Vector3();
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    const wallVertex = (v, n, fi, t, c) => {
      P.push(v.x, v.y, v.z);
      N.push(n.x, n.y, n.z);
      UV.push((fi / segU) * repU, t * 0.12);
      C.push(c, c, c);
      return P.length / 3 - 1;
    };
    for (const edge of wallBoundary) {
      let { a, b } = edge;
      const undirected = Math.min(a.key, b.key) * K + Math.max(a.key, b.key);
      if (!crackEdges.has(undirected)) crackEdges.set(undirected, { a, b });

      // Which side is outside the shard: the shard lies to the left in grid space.
      let dx = b.fi - a.fi, dy = b.fj - a.fj;
      const dl = Math.hypot(dx, dy) || 1;
      const inside = {
        fi: ((((a.fi + b.fi) / 2 - (dy / dl) * 0.35) % segU) + segU) % segU,
        fj: Math.min(Math.max((a.fj + b.fj) / 2 + (dx / dl) * 0.35, 0), segV),
      };
      o.copy(point3(0, a));
      q.copy(point3(0, b));
      out.addVectors(o, q).multiplyScalar(0.5).sub(point3(0, inside));
      ip.copy(point3(1, a));
      face.subVectors(q, o).cross(t1.subVectors(ip, o));
      if (face.dot(out) < 0) [a, b] = [b, a];

      o.copy(point3(0, a));
      q.copy(point3(0, b));
      ip.copy(point3(1, a));
      iq.copy(point3(1, b));
      mp.lerpVectors(o, ip, 0.5);
      mq.lerpVectors(q, iq, 0.5);
      // Outer half, then inner half, each with a flat normal.
      for (const [A, B, Cc, Dd, ca, cb] of [
        [o, q, mq, mp, 1, 0.5],
        [mp, mq, iq, ip, 0.5, 0.92],
      ]) {
        face.subVectors(B, A).cross(t2.subVectors(Dd, A)).normalize();
        const va = wallVertex(A, face, a.fi, 0, ca);
        const vb = wallVertex(B, face, b.fi, 0, ca);
        const vc = wallVertex(Cc, face, b.fi, 1, cb);
        const vd = wallVertex(Dd, face, a.fi, 1, cb);
        I.push(va, vb, vd, vb, vc, vd);
      }
    }

    // Centre the shard on its (area-weighted) outer centroid.
    const centroid = new THREE.Vector3();
    let area = 0;
    for (let t = 0; t < outerTriangles; t++) {
      const k0 = I[t * 3] * 3, k1 = I[t * 3 + 1] * 3, k2 = I[t * 3 + 2] * 3;
      t1.set(P[k1] - P[k0], P[k1 + 1] - P[k0 + 1], P[k1 + 2] - P[k0 + 2]);
      t2.set(P[k2] - P[k0], P[k2 + 1] - P[k0 + 1], P[k2 + 2] - P[k0 + 2]);
      const ta = t1.cross(t2).length() / 2;
      area += ta;
      centroid.x += ((P[k0] + P[k1] + P[k2]) / 3) * ta;
      centroid.y += ((P[k0 + 1] + P[k1 + 1] + P[k2 + 1]) / 3) * ta;
      centroid.z += ((P[k0 + 2] + P[k1 + 2] + P[k2 + 2]) / 3) * ta;
    }
    centroid.divideScalar(area || 1);
    const positions = new Float32Array(P.length);
    for (let k = 0; k < P.length; k += 3) {
      positions[k] = P[k] - centroid.x;
      positions[k + 1] = P[k + 1] - centroid.y;
      positions[k + 2] = P[k + 2] - centroid.z;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(UV), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(I), 1));
    g.addGroup(0, clayIndices, 0);
    g.addGroup(clayIndices, I.length - clayIndices, 1);
    g.computeBoundingSphere();

    shards.push({
      label,
      geometry: g,
      rest: centroid,
      hulls: splitHulls(positions),
      outerTriangles,
      outerArea: area,
      boundaryKeys: wallBoundary.map(({ a, b }) => [a.key, b.key]),
    });
  }

  return { shards, cracks: buildCracks(crackEdges, rimCracks, sampleAt, segT), seeds };
}

// A single convex hull of a curved shard fills the hollow under its curve, so
// pieces would rest on invisible lids. Splitting the shard into up to four
// parts along its longest extents gives hulls that hug the shell.
function splitHulls(positions, maxPoints = 90) {
  const count = positions.length / 3;
  let parts = [Array.from({ length: count }, (_, k) => k)];
  for (let round = 0; round < 2; round++) {
    const next = [];
    for (const part of parts) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const k of part) {
        for (let a = 0; a < 3; a++) {
          min[a] = Math.min(min[a], positions[k * 3 + a]);
          max[a] = Math.max(max[a], positions[k * 3 + a]);
        }
      }
      const extents = max.map((m, a) => m - min[a]);
      const axis = extents.indexOf(Math.max(...extents));
      if (extents[axis] < 0.22) {
        next.push(part);
        continue;
      }
      // Halves overlap slightly so the compound has no seam to catch on.
      const mid = (min[axis] + max[axis]) / 2;
      const margin = extents[axis] * 0.04;
      next.push(part.filter((k) => positions[k * 3 + axis] <= mid + margin));
      next.push(part.filter((k) => positions[k * 3 + axis] >= mid - margin));
    }
    parts = next;
  }
  return parts
    .filter((part) => part.length >= 8)
    .map((part) => {
      const step = Math.max(1, Math.floor(part.length / maxPoints));
      const pts = [];
      for (let p = 0; p < part.length; p += step) {
        const k = part[p];
        pts.push(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
      }
      return new Float32Array(pts);
    });
}

// Chains crack edges into polylines on the outer and inner surfaces, plus a
// short line across the lip wherever a crack reaches the rim.
function buildCracks(crackEdges, rimCracks, surfaceAt, segT) {
  const adjacency = new Map();
  const edges = [...crackEdges.values()];
  edges.forEach((e, idx) => {
    for (const p of [e.a, e.b]) {
      if (!adjacency.has(p.key)) adjacency.set(p.key, []);
      adjacency.get(p.key).push(idx);
    }
  });
  const used = new Uint8Array(edges.length);
  const chains = [];
  const walk = (startIdx, from) => {
    const chain = [from];
    let idx = startIdx;
    let at = from;
    while (idx !== -1 && !used[idx]) {
      used[idx] = 1;
      const e = edges[idx];
      const next = e.a.key === at.key ? e.b : e.a;
      chain.push(next);
      at = next;
      const options = adjacency.get(at.key);
      idx = options.length === 2 ? options.find((o) => !used[o]) ?? -1 : -1;
    }
    return chain;
  };
  // Open chains start at ends and junctions; what is left are closed loops.
  for (const [key, list] of adjacency) {
    if (list.length === 2) continue;
    for (const idx of list) {
      if (used[idx]) continue;
      const e = edges[idx];
      chains.push(walk(idx, e.a.key === key ? e.a : e.b));
    }
  }
  edges.forEach((e, idx) => {
    if (!used[idx]) chains.push(walk(idx, e.a));
  });

  // Each line keeps the surface normal at every point, so the gold can sit on it.
  const line = (patch, pts) => {
    const points = new Float32Array(pts.length * 3);
    const normals = new Float32Array(pts.length * 3);
    pts.forEach((pt, k) => {
      const s = surfaceAt(patch, pt.fi, pt.fj);
      const l = Math.hypot(s.n[0], s.n[1], s.n[2]) || 1;
      for (let x = 0; x < 3; x++) {
        points[k * 3 + x] = s.p[x];
        normals[k * 3 + x] = s.n[x] / l;
      }
    });
    return { points, normals };
  };
  const rim = [...rimCracks.values()].map((fi) =>
    line(2, Array.from({ length: segT + 1 }, (_, r) => ({ fi, fj: r }))),
  );
  return {
    outer: chains.map((c) => line(0, c)),
    inner: chains.map((c) => line(1, c)),
    rim,
  };
}
