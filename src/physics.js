// Rapier world wrapper. Rapier is large (WASM inlined as base64), so it is
// loaded lazily in the background after the first frame.

let rapierPromise = null;

export function loadPhysics() {
  if (!rapierPromise) {
    rapierPromise = import('@dimforge/rapier3d-compat').then(async (mod) => {
      const RAPIER = mod.default ?? mod;
      await RAPIER.init();
      return RAPIER;
    });
  }
  return rapierPromise;
}

// Collision groups: high 16 bits are membership, low 16 bits the filter.
const GROUND = 0x0001;
const SHARD = 0x0002;
const POT = 0x0004;
const groups = (member, filter) => (member << 16) | filter;

const STEP = 1 / 60;

export function createWorld(RAPIER, { gravity = 12, boxes = [] } = {}) {
  const world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
  world.timestep = STEP;
  const events = new RAPIER.EventQueue(true);
  const bodies = new Map(); // handle → { body, mesh }
  const ground = new Set();
  let accumulator = 0;

  // Fixed boxes: floor, stand, and invisible walls. Each is {center, half}.
  for (const { center, half } of boxes) {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setTranslation(center.x, center.y, center.z)
        .setFriction(0.8)
        .setRestitution(0.1)
        .setCollisionGroups(groups(GROUND, 0xffff)),
    );
    ground.add(collider.handle);
  }

  // `hulls` is one point cloud or several (a compound of convex parts).
  function addBody(mesh, hulls, { linvel, angvel, kind = 'shard', density = 2, restitution = 0.15 } = {}) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
      .setRotation({ x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w })
      .setLinearDamping(kind === 'pot' ? 0.02 : 0.2)
      .setAngularDamping(kind === 'pot' ? 0.2 : 1)
      .setCcdEnabled(true);
    if (linvel) desc.setLinvel(linvel.x, linvel.y, linvel.z);
    if (angvel) desc.setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z });
    const body = world.createRigidBody(desc);
    const entry = { body, colliders: [], mesh, kind };
    for (const points of Array.isArray(hulls) ? hulls : [hulls]) {
      const colliderDesc = RAPIER.ColliderDesc.convexHull(points);
      if (!colliderDesc) continue;
      // Shards start colliding only with the ground; neighbours' hulls overlap
      // at the moment of breaking, so shard–shard contact is enabled a moment later.
      colliderDesc
        .setDensity(density)
        .setFriction(0.75)
        .setRestitution(restitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setCollisionGroups(kind === 'pot' ? groups(POT, GROUND) : groups(SHARD, GROUND));
      const collider = world.createCollider(colliderDesc, body);
      entry.colliders.push(collider);
      bodies.set(collider.handle, entry);
    }
    if (!entry.colliders.length) throw new Error('Convex hull failed');
    return entry;
  }

  function removeBody(entry) {
    for (const c of entry.colliders) bodies.delete(c.handle);
    world.removeRigidBody(entry.body);
  }

  function enableShardContacts() {
    for (const entry of new Set(bodies.values())) {
      if (entry.kind !== 'shard') continue;
      for (const c of entry.colliders) c.setCollisionGroups(groups(SHARD, GROUND | SHARD));
    }
  }

  // Raises damping on the pieces (0..1), so they come to rest calmly.
  function calm(k) {
    for (const entry of new Set(bodies.values())) {
      if (entry.kind !== 'shard') continue;
      entry.body.setLinearDamping(0.2 + 2.8 * k);
      entry.body.setAngularDamping(1 + 5 * k);
    }
  }

  // Advances in fixed steps and calls onContact(entry, isGround) when a body
  // starts touching something.
  function step(dt, onContact) {
    accumulator = Math.min(accumulator + dt, STEP * 4);
    while (accumulator >= STEP) {
      // Speed just before the step, so impacts can be judged by it.
      for (const entry of new Set(bodies.values())) {
        const v = entry.body.linvel();
        entry.velocity = { x: v.x, y: v.y, z: v.z };
        entry.speed = Math.hypot(v.x, v.y, v.z);
      }
      world.step(events);
      events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        for (const [self, other] of [[h1, h2], [h2, h1]]) {
          const entry = bodies.get(self);
          if (entry) onContact?.(entry, ground.has(other));
        }
      });
      accumulator -= STEP;
    }
    for (const { body, mesh } of new Set(bodies.values())) {
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  // True once every body has (nearly) stopped. `tolerance` loosens the test,
  // for pieces that keep nudging each other in a pile.
  function settled(tolerance = 1) {
    for (const { body } of new Set(bodies.values())) {
      if (body.isSleeping()) continue;
      const v = body.linvel();
      const w = body.angvel();
      if (Math.hypot(v.x, v.y, v.z) > 0.03 * tolerance || Math.hypot(w.x, w.y, w.z) > 0.15 * tolerance) return false;
    }
    return true;
  }

  return {
    addBody,
    removeBody,
    enableShardContacts,
    calm,
    step,
    settled,
    bodies,
    dispose: () => {
      events.free();
      world.free();
    },
  };
}
