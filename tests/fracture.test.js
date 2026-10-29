import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPotShape, buildPotGeometry } from '../src/pot/buildPot.js';
import { PROFILE_ORDER } from '../src/pot/profiles.js';
import { fracturePot, MAX_SHARDS } from '../src/fracture/shatter.js';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

function triangleArea(arr, offset) {
  a.fromArray(arr, offset);
  b.fromArray(arr, offset + 3);
  c.fromArray(arr, offset + 6);
  return b.sub(a).cross(c.sub(a)).length() / 2;
}

// Loads triangle t of an indexed geometry into a, b, c; returns the first vertex index.
function loadTriangle(geometry, t) {
  const pos = geometry.attributes.position.array;
  const index = geometry.index.array;
  a.fromArray(pos, index[t * 3] * 3);
  b.fromArray(pos, index[t * 3 + 1] * 3);
  c.fromArray(pos, index[t * 3 + 2] * 3);
  return index[t * 3];
}

function faceNormal(geometry, t) {
  loadTriangle(geometry, t);
  return b.sub(a).cross(c.sub(a));
}

// Outer surface area of the intact pot (its first patch of triangles).
function intactOuterArea(geometry) {
  const { segU, segV } = geometry.userData.grid;
  const pos = geometry.attributes.position.array;
  const index = geometry.index.array;
  const tri = new Float32Array(9);
  let area = 0;
  for (let t = 0; t < segU * segV * 2; t++) {
    for (let v = 0; v < 3; v++) for (let x = 0; x < 3; x++) tri[v * 3 + x] = pos[index[t * 3 + v] * 3 + x];
    area += triangleArea(tri, 0);
  }
  return area;
}

const worldVertexSet = (shard) => {
  const pos = shard.geometry.attributes.position.array;
  const set = new Set();
  for (let k = 0; k < pos.length; k += 3) {
    set.add(
      [pos[k] + shard.rest.x, pos[k + 1] + shard.rest.y, pos[k + 2] + shard.rest.z]
        .map((x) => Math.round(x * 1e5))
        .join(','),
    );
  }
  return set;
};

for (const type of PROFILE_ORDER) {
  describe(`fracture: ${type}`, () => {
    const geometry = buildPotGeometry(createPotShape(type, 11));
    const impact = new THREE.Vector3(0.2, 0, 0.05);
    const { shards, cracks } = fracturePot(geometry, { count: 16, impact, seed: 5 });

    it('makes a sensible number of shards, never more than the cap', () => {
      expect(shards.length).toBeGreaterThanOrEqual(8);
      expect(shards.length).toBeLessThanOrEqual(MAX_SHARDS);
    });

    it('covers the whole pot with no gaps or overlaps', () => {
      let sum = 0;
      for (const shard of shards) {
        for (let t = 0; t < shard.outerTriangles; t++) sum += faceNormal(shard.geometry, t).length() / 2;
      }
      const intact = intactOuterArea(geometry);
      expect(Math.abs(sum - intact) / intact).toBeLessThan(0.005);
    });

    it('neighbouring shards share identical boundary vertices', () => {
      const owners = new Map();
      shards.forEach((s, idx) => {
        for (const [ka, kb] of s.boundaryKeys) {
          const key = `${ka}>${kb}`;
          owners.set(key, [...(owners.get(key) || []), idx]);
        }
      });
      // Every crack edge is walked once in each direction, by two different shards.
      for (const [key, list] of owners) {
        expect(list.length).toBe(1);
        const [ka, kb] = key.split('>');
        const reverse = owners.get(`${kb}>${ka}`);
        expect(reverse?.length).toBe(1);
        expect(reverse[0]).not.toBe(list[0]);
      }
      // And the vertices along a shared crack coincide in space.
      const sets = shards.map(worldVertexSet);
      let shared = 0;
      for (let i = 0; i < shards.length; i++) {
        for (let j = i + 1; j < shards.length; j++) {
          for (const v of sets[i]) if (sets[j].has(v)) shared++;
        }
      }
      expect(shared).toBeGreaterThan(shards.length * 4);
    });

    it('surface faces point the same way as their normals', () => {
      let agree = 0, total = 0;
      const n = new THREE.Vector3();
      for (const shard of shards) {
        const g = shard.geometry;
        // Outer triangles first, then inner: both should agree with their normals.
        const surfaceTriangles = g.groups[0].count / 3;
        for (let t = 0; t < surfaceTriangles; t++) {
          const v0 = g.index.array[t * 3];
          const face = faceNormal(g, t);
          if (face.lengthSq() < 1e-14) continue;
          n.fromArray(g.attributes.normal.array, v0 * 3);
          total++;
          if (face.dot(n) > 0) agree++;
        }
      }
      expect(agree / total).toBeGreaterThan(0.99);
    });

    it('broken walls face away from their shard', () => {
      for (const shard of shards) {
        const g = shard.geometry;
        const wall = g.groups[1];
        let outward = 0, count = 0;
        for (let t = wall.start / 3; t < (wall.start + wall.count) / 3; t++) {
          const face = faceNormal(g, t).clone();
          if (face.lengthSq() < 1e-14) continue;
          // Compare with the direction from the shard's centre to the wall.
          loadTriangle(g, t);
          count++;
          if (face.dot(a) > 0) outward++;
        }
        if (count) expect(outward / count).toBeGreaterThan(0.75);
      }
    });

    it('is deterministic and has no NaNs', () => {
      const again = fracturePot(geometry, { count: 16, impact, seed: 5 });
      expect(again.shards.length).toBe(shards.length);
      for (let s = 0; s < shards.length; s++) {
        const p1 = shards[s].geometry.attributes.position.array;
        const p2 = again.shards[s].geometry.attributes.position.array;
        expect(p1.length).toBe(p2.length);
        expect(p1.every(Number.isFinite)).toBe(true);
        expect(p1.every((x, k) => x === p2[k])).toBe(true);
      }
    });

    it('keeps crack lines for the gold', () => {
      expect(cracks.outer.length).toBeGreaterThan(0);
      expect(cracks.inner.length).toBe(cracks.outer.length);
      for (const line of cracks.outer) expect(line.length).toBeGreaterThanOrEqual(6);
    });
  });
}
