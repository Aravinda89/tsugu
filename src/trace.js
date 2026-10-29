// Tracing the gold. A finger or mouse drawn over the pot lays gold on the
// crack nearest to it, and only on the crack. A slow, careful stroke lays it
// full and wide; a quick one leaves it thin and light. Nothing is corrected:
// the visitor's hand stays in the gold.

import * as THREE from 'three';

const SNAP = 0.05; // how far from a crack a stroke still finds it
const SLOW = { radius: 0.022, strength: 0.55 };
const FAST = { radius: 0.014, strength: 0.25 };
const FAST_SPEED = 1.6; // pot-local units per second

export function createTrace({ camera, canvas }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const snapped = new THREE.Vector3();
  const step = new THREE.Vector3();
  let pot = null, gold = null;
  let last = null; // previous pot-local point on the surface
  let lastTime = 0;
  let stroke = null;

  // Pot-local point under the pointer, or null.
  function surfaceAt(e, target) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObject(pot, false)[0];
    return h ? pot.worldToLocal(target.copy(h.point)) : null;
  }

  function brushAt(p, speed) {
    const { point, distance } = gold.nearest(p, snapped);
    if (distance > SNAP) return;
    const k = Math.min(speed / FAST_SPEED, 1);
    gold.paint(point, THREE.MathUtils.lerp(SLOW.radius, FAST.radius, k), THREE.MathUtils.lerp(SLOW.strength, FAST.strength, k));
    stroke.push(point.x, point.y, point.z);
  }

  return {
    // Begins a stroke if the pointer is on the pot.
    start(e, targetPot, targetGold) {
      pot = targetPot;
      gold = targetGold;
      const p = surfaceAt(e, hit);
      if (!p) return false;
      stroke = [];
      gold.strokes.push(stroke);
      last = p.clone();
      lastTime = performance.now();
      brushAt(p, 0);
      return true;
    },

    move(e) {
      if (!stroke) return;
      const p = surfaceAt(e, hit);
      if (!p) return;
      const now = performance.now();
      const dist = p.distanceTo(last);
      const speed = dist / Math.max((now - lastTime) / 1000, 1e-3);
      // Fill the gap between pointer samples so quick strokes stay continuous.
      const n = Math.max(1, Math.ceil(dist / (FAST.radius * 0.4)));
      for (let i = 1; i <= n; i++) brushAt(step.lerpVectors(last, p, i / n), speed);
      last.copy(p);
      lastTime = now;
    },

    end() {
      stroke = null;
      last = null;
    },

    get active() {
      return !!stroke;
    },

    hovering(e, targetPot) {
      pot = targetPot;
      return !!surfaceAt(e, hit);
    },
  };
}
