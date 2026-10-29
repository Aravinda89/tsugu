// Runs the fracture off the main thread, so the pot never hangs in the air
// while it is being cut.

import * as THREE from 'three';
import { fracturePot } from './shatter.js';

let geometry = null;

self.onmessage = ({ data }) => {
  if (data.type === 'pot') {
    geometry = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
      geometry.setAttribute(name, new THREE.BufferAttribute(data[name], size));
    }
    geometry.userData.grid = data.grid;
    // Warm up the JIT so the real break is quick.
    fracturePot(geometry, { count: 12, impact: new THREE.Vector3(), seed: 1 });
    return;
  }

  if (data.type === 'fracture') {
    const { id, count, impact, seed } = data;
    const { shards, cracks } = fracturePot(geometry, {
      count,
      impact: new THREE.Vector3().fromArray(impact),
      seed,
    });
    const transfer = [];
    const out = shards.map((s) => {
      const g = s.geometry;
      const attrs = {};
      for (const name of ['position', 'normal', 'uv', 'color']) {
        attrs[name] = g.attributes[name].array;
        transfer.push(attrs[name].buffer);
      }
      transfer.push(g.index.array.buffer, ...s.hulls.map((h) => h.buffer));
      return {
        attrs,
        index: g.index.array,
        groups: g.groups,
        rest: s.rest.toArray(),
        hulls: s.hulls,
      };
    });
    for (const line of [...cracks.outer, ...cracks.inner, ...cracks.rim]) {
      transfer.push(line.points.buffer, line.normals.buffer);
    }
    self.postMessage({ id, shards: out, cracks }, transfer);
  }
};
