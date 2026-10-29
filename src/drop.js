// Lift, drop, shatter, settle.
// One finger lifts the pot; letting go drops it. The higher the lift, the
// harder the impact and the more pieces (10–20). The pot is cut in a worker
// while it falls, and swapped for its shards on the first hard contact.

import * as THREE from 'three';
import { loadPhysics, createWorld } from './physics.js';
import { STAND_TOP } from './scene/stand.js';
import { createRandom, hashSeed } from './utils/random.js';
import { MAX_SHARDS } from './fracture/shatter.js';
import { audio } from './audio.js';

export const MAX_LIFT = 1.6;
const MIN_LIFT = 0.22;
const GRAVITY = 12;
const BREAK_SPEED = 2;

export function createDrop({ scene, fracture, edgeMaterial, onImpact, onSettled }) {
  let station = null;
  let pot = null;
  let phase = 'idle'; // idle → lift → waiting → fall → broken → settled
  let drag = null;
  let lift = 0, liftTarget = 0;
  let sway = 0, swayTarget = 0;
  let world = null;
  let potEntry = null;
  let fractureResult = null;
  let impact = null;
  let shards = [];
  let brokenTime = 0, stillTime = 0;
  let contactsOn = false;
  let clock = 0;
  let drops = 0;
  let rng = createRandom(1);

  const restMatrix = new THREE.Matrix4();
  const baseRotationY = { value: 0 };

  function begin(chosen) {
    station = chosen;
    pot = chosen.pot;
    phase = 'lift';
    lift = liftTarget = sway = swayTarget = 0;
    baseRotationY.value = pot.rotation.y;
    rng = createRandom(hashSeed(chosen.seed, 'drop'));
    pot.updateMatrixWorld(true);
    restMatrix.copy(pot.matrixWorld);
    fracture.setPot(pot.geometry);
    loadPhysics();
  }

  // --- Gesture -------------------------------------------------------------

  function grab(e, worldPerPixel) {
    if (phase !== 'lift') return false;
    drag = { x: e.clientX, y: e.clientY, worldPerPixel, base: lift };
    return true;
  }

  function move(e) {
    if (!drag) return;
    const raw = Math.max(0, drag.base + (drag.y - e.clientY) * drag.worldPerPixel);
    // Saturates softly towards the ceiling instead of stopping dead.
    liftTarget = MAX_LIFT * Math.tanh(raw / MAX_LIFT);
    swayTarget = THREE.MathUtils.clamp((e.clientX - drag.x) * drag.worldPerPixel * 0.3, -0.3, 0.3);
  }

  function release() {
    if (!drag) return null;
    drag = null;
    if (liftTarget < MIN_LIFT) {
      liftTarget = 0;
      swayTarget = 0;
      return 'settle-back';
    }
    drop();
    return 'drop';
  }

  // --- Drop ------------------------------------------------------------------

  async function drop() {
    phase = 'waiting';
    // A quick flick can let go before the pot has caught up with the finger.
    const strength = THREE.MathUtils.clamp((Math.max(lift, liftTarget * 0.8) - MIN_LIFT) / (MAX_LIFT - MIN_LIFT), 0, 1);
    const count = Math.min(MAX_SHARDS, Math.round(10 + 10 * strength));

    // A small tip as it leaves the hand, so it lands on an edge, not flat.
    const tipAxis = new THREE.Vector3(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize();
    pot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(tipAxis, rng.range(0.05, 0.14)));
    pot.updateMatrixWorld(true);

    // The lowest point of the tipped pot is where it will strike first.
    const local = lowestPoint(pot);
    fractureResult = null;
    const seed = hashSeed(station.seed, 'break', drops++);
    fracture.fracture({ count, impact: local, seed }).then((r) => {
      fractureResult = r;
      if (impact) shatter();
    });

    const RAPIER = await loadPhysics();
    if (phase !== 'waiting') return;
    scene.attach(pot);
    world = createWorld(RAPIER, { gravity: GRAVITY, boxes: groundBoxes() });
    potEntry = world.addBody(pot, hullOf(pot.geometry), {
      kind: 'pot',
      restitution: 0.04,
      linvel: new THREE.Vector3((swayTarget - sway) * 3, 0, 0),
      angvel: tipAxis.clone().multiplyScalar(rng.range(0.3, 0.9)),
    });
    phase = 'fall';
  }

  function groundBoxes() {
    const standPos = new THREE.Vector3();
    station.stand.getWorldPosition(standPos);
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    // Invisible walls keep pieces on screen; the hero framing shows about this much.
    const W = Math.max(1.35, station.width * 0.95);
    return [
      { center: v(0, -0.5, 0), half: v(20, 0.5, 20) },
      { center: v(standPos.x, STAND_TOP / 2, standPos.z), half: v(station.width / 2, STAND_TOP / 2, station.depth / 2) },
      { center: v(-W - 0.1, 1, 0), half: v(0.1, 2, 4) },
      { center: v(W + 0.1, 1, 0), half: v(0.1, 2, 4) },
      { center: v(0, 1, -1.3), half: v(4, 2, 0.1) },
      { center: v(0, 1, 1.25), half: v(4, 2, 0.1) },
    ];
  }

  // The first contact after letting go always breaks it (there is no way to
  // fail); a gentle landing still breaks with at least BREAK_SPEED.
  function onContact(entry, isGround) {
    if (entry !== potEntry || !isGround || impact) return;
    const velocity = new THREE.Vector3().copy(entry.velocity);
    if (entry.speed < BREAK_SPEED) velocity.set(0, -BREAK_SPEED, 0);
    impact = { velocity, speed: Math.max(entry.speed, BREAK_SPEED) };
    if (fractureResult) shatter();
  }

  function shatter() {
    if (phase !== 'fall') return;
    phase = 'broken';
    brokenTime = 0;
    stillTime = 0;
    contactsOn = false;
    pot.updateMatrixWorld(true);
    const impactWorld = lowestPoint(pot).applyMatrix4(pot.matrixWorld);
    world.removeBody(potEntry);
    potEntry = null;
    pot.visible = false;

    const strength = THREE.MathUtils.clamp(impact.speed / Math.sqrt(2 * GRAVITY * MAX_LIFT), 0, 1);
    const toPiece = new THREE.Vector3();
    for (const data of fractureResult.shards) {
      const mesh = new THREE.Mesh(data.geometry, [pot.material, edgeMaterial]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(data.rest).applyMatrix4(pot.matrixWorld);
      mesh.quaternion.copy(pot.quaternion);
      scene.add(mesh);

      // Keep a little of the pot's momentum, burst outward from the strike, spin.
      toPiece.subVectors(mesh.position, impactWorld);
      toPiece.y = Math.max(toPiece.y, 0) * 0.6 + 0.25;
      toPiece.normalize();
      const linvel = impact.velocity
        .clone()
        .multiplyScalar(0.18)
        .addScaledVector(toPiece, impact.speed * rng.range(0.16, 0.34));
      const angvel = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(2 + 4 * strength);
      const entry = world.addBody(mesh, data.hulls, { linvel, angvel, restitution: 0.1, density: 2 });
      shards.push({ mesh, entry, rest: data.rest });
    }
    onImpact?.(strength);
    audio.impact(strength);
  }

  // --- Per frame -------------------------------------------------------------

  function update(dt) {
    clock += dt;
    if (phase === 'waiting') return; // held where it was let go until physics is ready
    if (phase === 'lift') {
      const k = 1 - Math.exp(-dt * 9);
      lift += (liftTarget - lift) * k;
      const prevSway = sway;
      sway += (swayTarget - sway) * k;
      const lifted = Math.min(lift / 0.3, 1);
      pot.position.set(sway, STAND_TOP + lift, 0);
      // It hangs a touch behind the hand, and breathes a little while held.
      pot.rotation.set(
        Math.sin(clock * 1.1) * 0.012 * lifted,
        baseRotationY.value,
        -((sway - prevSway) / Math.max(dt, 1e-3)) * 0.05 + Math.sin(clock * 1.7) * 0.01 * lifted,
      );
      return;
    }
    if (!world || phase === 'settled') return;

    world.step(dt, onContact);
    if (phase === 'broken') {
      brokenTime += dt;
      if (brokenTime > 0.25 && !contactsOn) {
        world.enableShardContacts();
        contactsOn = true;
      }
      // After the first tumble, friction of the floor takes over.
      world.calm(THREE.MathUtils.smoothstep(brokenTime, 1.8, 4.5));
      stillTime = world.settled(brokenTime > 4 ? 4 : 1) ? stillTime + dt : 0;
      if ((brokenTime > 1 && stillTime > 0.5) || brokenTime > 6.5) {
        phase = 'settled';
        onSettled?.();
      }
    }
  }

  function shardBounds() {
    const box = new THREE.Box3();
    for (const s of shards) box.expandByObject(s.mesh);
    return box;
  }

  function reset() {
    for (const s of shards) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    shards = [];
    // Once dropped, the pot lives in the scene rather than on its stand.
    if (pot?.parent === scene) {
      scene.remove(pot);
      pot.geometry.dispose();
    }
    world?.dispose();
    world = null;
    potEntry = null;
    impact = null;
    fractureResult = null;
    drag = null;
    phase = 'idle';
  }

  return {
    begin,
    grab,
    move,
    release,
    update,
    reset,
    shardBounds,
    get lift() {
      return lift;
    },
    get dragging() {
      return !!drag;
    },
    get phase() {
      return phase;
    },
    get shards() {
      return shards;
    },
    restMatrix,
  };
}

// Lowest outer vertex of the pot in world space, returned in pot-local space.
function lowestPoint(pot) {
  const pos = pot.geometry.attributes.position.array;
  const { segU, segV } = pot.geometry.userData.grid;
  const count = (segU + 1) * (segV + 1);
  const v = new THREE.Vector3();
  const best = new THREE.Vector3();
  let bestY = Infinity;
  for (let k = 0; k < count; k += 3) {
    v.fromArray(pos, k * 3).applyMatrix4(pot.matrixWorld);
    if (v.y < bestY) {
      bestY = v.y;
      best.fromArray(pos, k * 3);
    }
  }
  return best;
}

// A few hundred outer vertices are plenty for the falling pot's hull.
function hullOf(geometry) {
  const pos = geometry.attributes.position.array;
  const { segU, segV } = geometry.userData.grid;
  const count = (segU + 1) * (segV + 1);
  const pts = [];
  for (let k = 0; k < count; k += 17) pts.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  return new Float32Array(pts);
}
