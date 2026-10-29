import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPotShape, buildPotGeometry } from '../src/pot/buildPot.js';
import { fracturePot } from '../src/fracture/shatter.js';
import { buildGoldGeometry } from '../src/gold.js';
import { meiFor, MEI } from '../src/mei.js';

describe('gold seams', () => {
  const geometry = buildPotGeometry(createPotShape('chatti', 21));
  const { cracks } = fracturePot(geometry, { count: 15, impact: new THREE.Vector3(0.1, 0, 0.1), seed: 4 });
  const gold = buildGoldGeometry(cracks, 4);

  it('builds ribbons with no NaNs and arc length in 0..1', () => {
    expect(gold.attributes.position.count).toBeGreaterThan(100);
    for (const x of gold.attributes.position.array) expect(Number.isFinite(x)).toBe(true);
    for (const x of gold.attributes.normal.array) expect(Number.isFinite(x)).toBe(true);
    for (const a of gold.attributes.aArc.array) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('faces point the way of the surface (outward on the outside, inward inside)', () => {
    const pos = gold.attributes.position;
    const nrm = gold.attributes.normal;
    const index = gold.index.array;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    let agree = 0, total = 0;
    for (let i = 0; i < index.length; i += 3) {
      a.fromBufferAttribute(pos, index[i]);
      b.fromBufferAttribute(pos, index[i + 1]).sub(a);
      c.fromBufferAttribute(pos, index[i + 2]).sub(a);
      const face = b.cross(c);
      if (face.lengthSq() < 1e-16) continue;
      n.fromBufferAttribute(nrm, index[i + 1]);
      total++;
      if (face.dot(n) > 0) agree++;
    }
    expect(agree / total).toBeGreaterThan(0.97);
  });

  it('stays on the cracks', () => {
    // Every ribbon vertex lies within a few millimetres of a crack point.
    const crackPoints = [...cracks.outer, ...cracks.inner, ...cracks.rim].flatMap((l) => Array.from(l.points));
    const pos = gold.attributes.position.array;
    for (let k = 0; k < pos.length; k += 3 * 97) {
      let best = Infinity;
      for (let j = 0; j < crackPoints.length; j += 3) {
        best = Math.min(best, Math.hypot(pos[k] - crackPoints[j], pos[k + 1] - crackPoints[j + 1], pos[k + 2] - crackPoints[j + 2]));
      }
      expect(best).toBeLessThan(0.03);
    }
  });
});

describe('mei', () => {
  it('is the same for the same seed and always from the list', () => {
    expect(meiFor(123)).toEqual(meiFor(123));
    for (let s = 0; s < 50; s++) expect(MEI.map(([k]) => k)).toContain(meiFor(s).kanji);
  });
});
