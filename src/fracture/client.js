// Main-thread side of the fracture worker.

import * as THREE from 'three';

export function createFractureClient() {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const pending = new Map();
  let nextId = 1;

  worker.onmessage = ({ data }) => {
    const resolve = pending.get(data.id);
    pending.delete(data.id);
    resolve?.({
      shards: data.shards.map((s) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(s.attrs.position, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(s.attrs.normal, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(s.attrs.uv, 2));
        g.setAttribute('color', new THREE.BufferAttribute(s.attrs.color, 3));
        g.setIndex(new THREE.BufferAttribute(s.index, 1));
        for (const { start, count, materialIndex } of s.groups) g.addGroup(start, count, materialIndex);
        g.computeBoundingSphere();
        return { geometry: g, rest: new THREE.Vector3().fromArray(s.rest), hulls: s.hulls };
      }),
      cracks: data.cracks,
    });
  };

  return {
    // Hands the worker the intact pot's grid (and lets it warm up on it).
    setPot(geometry) {
      const msg = { type: 'pot', grid: geometry.userData.grid };
      for (const name of ['position', 'normal', 'uv', 'color']) msg[name] = geometry.attributes[name].array.slice();
      worker.postMessage(msg);
    },

    fracture({ count, impact, seed }) {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ type: 'fracture', id, count, impact: impact.toArray(), seed });
      });
    },
  };
}
