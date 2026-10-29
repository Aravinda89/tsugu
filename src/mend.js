// Tap-to-return. Each tapped piece leaves the floor and floats home along a
// gentle arc to its place in the pot, which reassembles a little above its
// stand (so pieces still lying on the stand are never in the way).
// No dragging, no rotating: the visitor only chooses the order.

import * as THREE from 'three';
import { tween, ease } from './utils/tween.js';
import { createRandom, hashSeed } from './utils/random.js';

export const HOVER = 0.32;
const RETURN_TIME = 1.25;
const TAP_SLOP = 56; // px: a near miss on a small piece still counts

export function createMend({ camera, canvas, drop, onAllHome }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const assembly = new THREE.Matrix4();
  const assemblyQuat = new THREE.Quaternion();
  const active = new Set();
  let pieces = [];
  let home = 0;
  let rng = createRandom(1);

  // Where the pot is put back together: its resting place, lifted by HOVER.
  function assemblyMatrix() {
    return assembly.makeTranslation(0, HOVER, 0).multiply(drop.restMatrix);
  }

  function begin(seed) {
    assemblyMatrix();
    assemblyQuat.setFromRotationMatrix(assembly);
    rng = createRandom(hashSeed(seed, 'mend'));
    pieces = drop.shards.map((shard) => ({ shard, state: 'waiting' }));
    home = 0;
    drop.beginGather();
  }

  function pick(e) {
    const waiting = pieces.filter((p) => p.state === 'waiting');
    if (!waiting.length) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(waiting.map((p) => p.shard.mesh), false)[0];
    if (hit) return waiting.find((p) => p.shard.mesh === hit.object);
    // Otherwise the nearest piece on screen, if the tap was close.
    const v = new THREE.Vector3();
    let best = null, bestD = TAP_SLOP;
    for (const p of waiting) {
      v.copy(p.shard.mesh.position).project(camera);
      const d = Math.hypot(((v.x + 1) / 2) * rect.width - x, ((1 - v.y) / 2) * rect.height - y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  function tap(e) {
    const piece = pick(e);
    if (!piece) return false;
    send(piece);
    return true;
  }

  function send(piece) {
    piece.state = 'returning';
    drop.takeShard(piece.shard);
    const mesh = piece.shard.mesh;
    const fromPos = mesh.position.clone();
    const fromQuat = mesh.quaternion.clone();
    // Home, give or take a hair: pieces never return quite perfectly.
    const toPos = piece.shard.rest.clone().applyMatrix4(assembly);
    toPos.add(new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(0.0008));
    const toQuat = assemblyQuat
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-1, 1) * 0.003, rng.range(-1, 1) * 0.003, 0)));

    // A gentle upward arc: a quadratic curve through a raised midpoint.
    const dist = fromPos.distanceTo(toPos);
    const ctrl = fromPos.clone().lerp(toPos, 0.5);
    ctrl.y = Math.max(fromPos.y, toPos.y) + 0.18 + 0.22 * dist;
    const a = new THREE.Vector3(), b = new THREE.Vector3();

    const t = tween({
      duration: RETURN_TIME + 0.2 * dist,
      easing: ease.joHaKyu,
      onUpdate: (k) => {
        a.lerpVectors(fromPos, ctrl, k);
        b.lerpVectors(ctrl, toPos, k);
        mesh.position.lerpVectors(a, b, k);
        mesh.quaternion.slerpQuaternions(fromQuat, toQuat, k);
      },
      onComplete: () => {
        active.delete(t);
        piece.state = 'home';
        if (++home === pieces.length) onAllHome?.();
      },
    });
    active.add(t);
  }

  function reset() {
    for (const t of active) t.cancel();
    active.clear();
    pieces = [];
    home = 0;
  }

  return {
    begin,
    tap,
    hovering: (e) => !!pick(e),
    reset,
    assemblyMatrix,
    assembly,
  };
}
