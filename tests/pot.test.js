import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPotShape, buildPotGeometry, getProfileLUT } from '../src/pot/buildPot.js';
import { PROFILE_ORDER } from '../src/pot/profiles.js';

const small = { segU: 48, segV: 32, segT: 4 };

describe('pot geometry', () => {
  it('is deterministic for a type + seed', () => {
    const a = buildPotGeometry(createPotShape('chatti', 42), small);
    const b = buildPotGeometry(createPotShape('chatti', 42), small);
    const c = buildPotGeometry(createPotShape('chatti', 43), small);
    expect(Array.from(a.attributes.position.array)).toEqual(Array.from(b.attributes.position.array));
    expect(Array.from(a.attributes.position.array)).not.toEqual(Array.from(c.attributes.position.array));
  });

  for (const type of PROFILE_ORDER) {
    describe(type, () => {
      const shape = createPotShape(type, 7);
      const geometry = buildPotGeometry(shape, small);

      it('has no NaNs', () => {
        for (const name of ['position', 'normal', 'uv', 'color']) {
          for (const x of geometry.attributes[name].array) expect(Number.isFinite(x)).toBe(true);
        }
      });

      it('is a closed shell', () => {
        const positionsOnly = new THREE.BufferGeometry();
        positionsOnly.setAttribute('position', geometry.attributes.position.clone());
        positionsOnly.setIndex(geometry.index.clone());
        const merged = mergeVertices(positionsOnly, 1e-5);
        const index = merged.index.array;
        const edges = new Map();
        for (let i = 0; i < index.length; i += 3) {
          const tri = [index[i], index[i + 1], index[i + 2]];
          if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue; // pole
          for (let e = 0; e < 3; e++) {
            const a = tri[e], b = tri[(e + 1) % 3];
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            edges.set(key, (edges.get(key) || 0) + 1);
          }
        }
        const open = [...edges.values()].filter((count) => count !== 2);
        expect(open.length).toBe(0);
      });

      it('faces point the same way as their normals', () => {
        const pos = geometry.attributes.position;
        const nrm = geometry.attributes.normal;
        const index = geometry.index.array;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const face = new THREE.Vector3(), vn = new THREE.Vector3();
        let agree = 0, total = 0;
        for (let i = 0; i < index.length; i += 3) {
          a.fromBufferAttribute(pos, index[i]);
          b.fromBufferAttribute(pos, index[i + 1]);
          c.fromBufferAttribute(pos, index[i + 2]);
          face.subVectors(b, a).cross(c.sub(a));
          if (face.lengthSq() < 1e-16) continue;
          vn.fromBufferAttribute(nrm, index[i]);
          total++;
          if (face.dot(vn) > 0) agree++;
        }
        expect(agree / total).toBeGreaterThan(0.995);
      });

      it('rests flat on its base', () => {
        geometry.computeBoundingBox();
        expect(geometry.boundingBox.min.y).toBeCloseTo(0, 3);
      });
    });
  }

  it('chatti is widest at about 45% of its height', () => {
    const lut = getProfileLUT('chatti');
    const ratio = lut.maxRadiusHeight / lut.height;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.5);
    // Height ≈ 0.9 × belly width.
    expect(lut.height / (lut.maxRadius * 2)).toBeCloseTo(0.9, 1);
  });

  it('inner wall stays inside the outer wall', () => {
    for (const type of PROFILE_ORDER) {
      const shape = createPotShape(type, 3);
      const o = new THREE.Vector3(), i = new THREE.Vector3();
      for (let v = 0.1; v < 0.98; v += 0.02) {
        shape.surfacePoint(0.3, v, 0, o);
        shape.surfacePoint(0.3, v, 1, i);
        const ro = Math.hypot(o.x, o.z), ri = Math.hypot(i.x, i.z);
        expect(ri).toBeLessThanOrEqual(ro + 1e-6);
      }
    }
  });
});
