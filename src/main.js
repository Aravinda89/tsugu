// 継ぐ Tsugu: app start and state machine.
// choose → lift → fall → shatter → still → gather → gold → keep
// Phases 1–2 wire up choose through still; gather, gold and keep arrive with Phase 3.

import './style.css';
import * as THREE from 'three';
import { createScene, frameCamera } from './scene.js';
import { createStand, STAND_TOP } from './scene/stand.js';
import { createDust } from './scene/dust.js';
import { createPot, createEdgeMaterial } from './pot/buildPot.js';
import { PROFILE_ORDER } from './pot/profiles.js';
import { createFractureClient } from './fracture/client.js';
import { loadPhysics } from './physics.js';
import { createDrop } from './drop.js';
import { createUI } from './ui.js';
import { tween, updateTweens, ease, lerp } from './utils/tween.js';
import { hashSeed } from './utils/random.js';

export const STATES = ['choose', 'lift', 'fall', 'shatter', 'still', 'gather', 'gold', 'keep'];

const startedAt = performance.now();

const view = createScene(document.getElementById('app'));
const { renderer, scene, camera } = view;
const ui = createUI(document.body);
const dust = createDust(view.key);
scene.add(dust.points);

const drop = createDrop({
  scene,
  fracture: createFractureClient(),
  edgeMaterial: createEdgeMaterial(),
  onImpact: () => setState('shatter'),
  onSettled: still,
});

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const look = new THREE.Vector3();

let state = null;
let stations = [];
let chosen = null;
let hovered = null;
let busy = false;
let cameraMoving = false;

const params = new URLSearchParams(location.search);
let baseSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : freshSeed();

function freshSeed() {
  return (Math.random() * 2 ** 32) >>> 0;
}

function setState(next) {
  state = next;
  document.body.dataset.state = next;
}

const isPortrait = () => camera.aspect < 0.9;

// --- Stations: a pot on its stand -----------------------------------------------

function buildStations() {
  for (const s of stations) {
    scene.remove(s.group);
    dispose(s.group);
  }
  stations = PROFILE_ORDER.map((type) => {
    const seed = hashSeed(baseSeed, type);
    const { mesh, shape } = createPot(type, seed);
    const width = shape.maxRadius * 2 * shape.profile.standMargin;
    const depth = shape.maxRadius * 2 * 1.15;
    const stand = createStand(width, depth, seed);
    mesh.position.y = STAND_TOP;
    mesh.rotation.y = (seed % 6283) / 1000;
    const group = new THREE.Group();
    group.add(stand, mesh);
    scene.add(group);
    return { type, seed, shape, pot: mesh, stand, group, width, depth, lift: 0 };
  });
  layoutStations();
}

function layoutStations() {
  const gap = isPortrait() ? 0.08 : 0.42;
  const total = stations.reduce((sum, s) => sum + s.width, 0) + gap * (stations.length - 1);
  let x = -total / 2;
  for (const s of stations) {
    s.group.position.set(x + s.width / 2, 0, 0);
    x += s.width + gap;
  }
}

function chooseFraming() {
  const total = stations.reduce((sum, s) => sum + s.width, 0) + (isPortrait() ? 0.16 : 0.84);
  const tallest = Math.max(...stations.map((s) => s.shape.height)) + STAND_TOP;
  const target = new THREE.Vector3(0, tallest * 0.46, 0);
  return isPortrait()
    ? frameCamera(camera, target, total, tallest, 0.94, 0.3)
    : frameCamera(camera, target, total, tallest, 0.74, 0.5);
}

// The mockup framing: the pot alone on its stand, about a third of the frame.
// `lifted` makes room above it while it is being raised.
function heroFraming(station, lifted = 0) {
  const h = station.shape.height + STAND_TOP + lifted;
  const target = new THREE.Vector3(0, h * 0.5, 0);
  return isPortrait()
    ? frameCamera(camera, target, station.width, h, 0.82, 0.4)
    : frameCamera(camera, target, station.width, h, 0.46, 0.5);
}

// After the break: everything that fell, seen a little more from above.
function shardsFraming() {
  const box = drop.shardBounds();
  box.union(new THREE.Box3().setFromObject(chosen.stand));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const target = new THREE.Vector3(center.x * 0.6, 0.15, center.z * 0.5);
  const height = Math.max(size.y, 0.4) + size.z * 0.4;
  const pitch = THREE.MathUtils.degToRad(24);
  return isPortrait()
    ? frameCamera(camera, target, size.x + 0.3, height, 0.9, 0.42, pitch)
    : frameCamera(camera, target, size.x + 0.5, height, 0.62, 0.5, pitch);
}

function setCamera(framing) {
  camera.position.copy(framing.position);
  look.copy(framing.target);
  camera.lookAt(look);
  fitFog();
}

// Fog starts just behind the subject, however far the camera sits.
function fitFog() {
  const d = camera.position.distanceTo(look);
  scene.fog.near = d + 2.5;
  scene.fog.far = d + 15;
}

function moveCamera(framing, duration) {
  const fromPos = camera.position.clone();
  const fromLook = look.clone();
  cameraMoving = true;
  return tween({
    duration,
    easing: ease.joHaKyu,
    onUpdate: (k) => {
      camera.position.lerpVectors(fromPos, framing.position, k);
      look.lerpVectors(fromLook, framing.target, k);
      camera.lookAt(look);
      fitFog();
    },
    onComplete: () => (cameraMoving = false),
  });
}

// --- Choose -------------------------------------------------------------------

async function choose(station) {
  busy = true;
  chosen = station;
  hovered = null;
  renderer.domElement.style.cursor = '';
  ui.setPrompt(null);

  for (const other of stations) {
    if (other !== station) fadeAway(other, Math.sign(other.group.position.x - station.group.position.x));
  }

  const fromX = station.group.position.x;
  tween({
    duration: 2.6,
    easing: ease.joHaKyu,
    onUpdate: (k) => (station.group.position.x = lerp(fromX, 0, k)),
  });
  await moveCamera(heroFraming(station), 2.9);

  setState('lift');
  drop.begin(station);
  ui.setPrompt('Lift the pot', -0.6);
  againButton.show();
  busy = false;
}

// --- Lift, fall, stillness ------------------------------------------------------

// World units per screen pixel at the pot's distance, so the pot follows the finger.
function worldPerPixel() {
  const d = camera.position.distanceTo(look);
  return (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
}

// The pieces have come to rest. A pause, the camera settles over them, then
// the next line.
async function still() {
  setState('still');
  await moveCamera(shardsFraming(), 3.2);
  await new Promise((r) => setTimeout(r, 900));
  if (state !== 'still') return;
  // Phase 3 makes the pieces tappable.
  setState('gather');
  ui.setPrompt('Gather the pieces', -0.6);
  againButton.show();
}

// The pots not chosen drift back into the dark.
function fadeAway(station, dir) {
  const materials = new Set();
  station.group.traverse((o) => {
    if (o.isMesh) materials.add(o.material);
  });
  for (const m of materials) m.transparent = true;
  const from = station.group.position.clone();
  return tween({
    duration: 1.9,
    easing: ease.inOutSine,
    onUpdate: (k) => {
      for (const m of materials) m.opacity = 1 - k;
      station.group.position.set(from.x + dir * 0.5 * k, from.y, from.z - 0.9 * k);
      if (k > 0.5) station.group.traverse((o) => (o.castShadow = false));
    },
    onComplete: () => (station.group.visible = false),
  });
}

const againButton = ui.button('again', 'Again', again);

async function again() {
  if (busy) return;
  busy = true;
  againButton.hide();
  ui.setPrompt(null);
  await ui.close();
  drop.reset();
  baseSeed = freshSeed();
  chosen = null;
  buildStations();
  setCamera(chooseFraming());
  setState('choose');
  ui.open();
  ui.setPrompt('Choose a pot', 0.4);
  busy = false;
}

// --- Pointer: one finger taps; hover only for a mouse -------------------------

function pick(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(
    stations.filter((s) => s.group.visible).map((s) => s.group),
    true,
  );
  if (!hits.length) return null;
  return stations.find((s) => {
    let o = hits[0].object;
    while (o && o !== s.group) o = o.parent;
    return o === s.group;
  });
}

const canvas = renderer.domElement;
let down = null;

canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (state === 'lift' && !busy && pick(e) === chosen && drop.grab(e, worldPerPixel())) {
    ui.setPrompt(null);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may already be gone (a very quick tap); the drag still works.
    }
  }
});

function endDrag() {
  const result = drop.release();
  if (result === 'drop') {
    setState('fall');
    againButton.hide();
  } else if (result === 'settle-back') {
    ui.setPrompt('Lift the pot', 0.6);
  }
}

canvas.addEventListener('pointercancel', () => {
  down = null;
  if (drop.dragging) endDrag();
});

canvas.addEventListener('pointerup', (e) => {
  if (drop.dragging) {
    down = null;
    endDrag();
    return;
  }
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 700;
  down = null;
  if (moved > 12 || !quick) return;
  if (state === 'choose' && !busy) {
    const station = pick(e);
    if (station) choose(station);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (drop.dragging) {
    drop.move(e);
    return;
  }
  if (e.pointerType !== 'mouse' || busy) return;
  if (state === 'choose') {
    hovered = pick(e);
    canvas.style.cursor = hovered ? 'pointer' : '';
  } else {
    canvas.style.cursor = state === 'lift' && pick(e) === chosen ? 'grab' : '';
  }
});

canvas.addEventListener('pointerleave', () => {
  hovered = null;
  canvas.style.cursor = '';
});

// --- Loop -------------------------------------------------------------------------

window.addEventListener('resize', () => {
  view.resize();
  if (cameraMoving) return;
  if (state === 'choose') {
    layoutStations();
    setCamera(chooseFraming());
  } else if (state === 'gather') {
    setCamera(shardsFraming());
  } else if (chosen) {
    setCamera(heroFraming(chosen, drop.lift));
  }
});

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  updateTweens(now);
  if (state === 'choose') {
    for (const s of stations) {
      const target = s === hovered && !busy ? 0.05 : 0;
      s.lift += (target - s.lift) * (1 - Math.exp(-dt * 6));
      s.pot.position.y = STAND_TOP + s.lift;
    }
  }
  drop.update(dt);
  // While the pot is raised, the camera eases back to keep it in frame.
  if (state === 'lift' && !cameraMoving) {
    const framing = heroFraming(chosen, drop.lift);
    const k = 1 - Math.exp(-dt * 3);
    camera.position.lerp(framing.position, k);
    look.lerp(framing.target, k);
    camera.lookAt(look);
    fitFog();
  }
  dust.update(now / 1000, renderer.getPixelRatio());
  renderer.render(scene, camera);
});

function dispose(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const tex of [o.material.map, o.material.bumpMap]) {
      if (tex?.userData.owned) tex.dispose();
    }
    o.material.dispose();
  });
}

buildStations();
setState('choose');
setCamera(chooseFraming());
if (import.meta.env.DEV) console.debug(`[tsugu] scene built in ${Math.round(performance.now() - startedAt)} ms`);
requestAnimationFrame(() => {
  ui.open();
  ui.setPrompt('Choose a pot', 0.8);
  // Fetch the physics engine quietly while the visitor chooses.
  setTimeout(loadPhysics, 1200);
});

if (import.meta.env.DEV) {
  window.__tsugu = { scene, camera, renderer, drop, stations: () => stations, state: () => state };
}
