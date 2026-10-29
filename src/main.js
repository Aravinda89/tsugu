// 継ぐ Tsugu: app start and state machine.
// choose → lift → fall → shatter → still → gather → gold → trace → keep

import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createScene, frameCamera } from './scene.js';
import { createStand, STAND_TOP } from './scene/stand.js';
import { createDust } from './scene/dust.js';
import { createPot } from './pot/buildPot.js';
import { PROFILE_ORDER } from './pot/profiles.js';
import { createFractureClient } from './fracture/client.js';
import { loadPhysics } from './physics.js';
import { createDrop } from './drop.js';
import { createMend } from './mend.js';
import { createGold, createGoldPatch } from './gold.js';
import { createTrace } from './trace.js';
import { meiFor } from './mei.js';
import { savePNG } from './save.js';
import { createUI } from './ui.js';
import { audio } from './audio.js';
import { STRINGS, getLang, saveLang, meiLine } from './i18n.js';
import { tween, updateTweens, ease, lerp } from './utils/tween.js';
import { hashSeed } from './utils/random.js';

export const STATES = ['choose', 'lift', 'fall', 'shatter', 'still', 'gather', 'gold', 'trace', 'keep'];

const startedAt = performance.now();

// English or 日本語: follows the browser until the visitor chooses.
let lang = getLang();
const words = () => STRINGS[lang];
// Hints are worded for fingers or a mouse.
const device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';

const view = createScene(document.getElementById('app'));
const { renderer, scene, camera } = view;
const ui = createUI(document.body, { label: (key) => words().labels[key] });
const dust = createDust(view.key);
scene.add(dust.points);

const drop = createDrop({
  scene,
  fracture: createFractureClient(),
  onImpact: () => setState('shatter'),
  onSettled: still,
});
const mend = createMend({ camera, canvas: renderer.domElement, drop, onHome: () => audio.home(), onAllHome: whole });
const trace = createTrace({ camera, canvas: renderer.domElement });

// Moving the camera is allowed only in Gather, Trace and Keep (see enableOrbit).
// One finger (left mouse) turns around the pot, two fingers (right mouse)
// slide, pinch or wheel zooms toward the pointer.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.rotateSpeed = 0.75;
controls.zoomSpeed = 1;
controls.zoomToCursor = true;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.panSpeed = 0.7;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
// Right-drag turns anywhere (even over the pot while tracing); shift- or
// middle-drag slides.
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.minPolarAngle = THREE.MathUtils.degToRad(35);
controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
const orbitHome = { position: new THREE.Vector3(), target: new THREE.Vector3() };
const viewButtons = ui.viewControls({
  zoomIn: () => zoomBy(0.72),
  zoomOut: () => zoomBy(1.38),
  turnLeft: () => turnBy(Math.PI / 4),
  turnRight: () => turnBy(-Math.PI / 4),
  recentre,
});

// --- Words: each step's line and its how-to, in the chosen language --------------

let step = null; // the step whose words are showing

function lineFor(s) {
  return s === 'keep' ? meiLine(lang, meiFor(chosen.seed)) : words().prompts[s];
}

function say(s, promptDelay = 0, hintDelay = promptDelay + 0.3) {
  step = s;
  ui.setPrompt(lineFor(s), promptDelay);
  ui.setHint(words().hints[device][s], hintDelay);
}

function hush() {
  step = null;
  ui.setPrompt(null);
  ui.setHint(null);
}

function applyLanguage() {
  document.documentElement.lang = lang;
  ui.setSubtitle(words().subtitle);
  ui.relabel();
  if (step) ui.swapText(lineFor(step), words().hints[device][step]);
  nameStations();
}

// Each pot's name under its stand while choosing: 壺 · storage jar, or 壺 · つぼ.
const placards = ui.placards(PROFILE_ORDER.length);

function nameStations() {
  stations.forEach((s, i) => placards.name(i, s.shape.profile.kanji, words().pots[s.type], lang));
}

const below = new THREE.Vector3();
function placePlacards() {
  const rect = renderer.domElement.getBoundingClientRect();
  stations.forEach((s, i) => {
    // Just in front of the foot of the stand.
    below.set(s.group.position.x, 0, s.depth / 2 + 0.06).project(camera);
    placards.place(i, rect.left + ((below.x + 1) / 2) * rect.width, rect.top + ((1 - below.y) / 2) * rect.height + 10);
  });
}

// Top right: sound on/off and the language switch.
ui.cornerControls({
  muted: audio.muted,
  onMute: () => audio.toggleMute(),
  languageName: () => STRINGS[lang === 'en' ? 'ja' : 'en'].name,
  onLanguage: () => {
    lang = lang === 'en' ? 'ja' : 'en';
    saveLang(lang);
    applyLanguage();
  },
});

// Sound may only start from a gesture: the first touch, click or key.
for (const type of ['pointerdown', 'keydown']) {
  document.addEventListener(type, () => audio.unlock(), { capture: true });
}

let gold = null;
let goldPatch = null;
let finishTimer = 0;

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
  nameStations();
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

// After the break: everything that fell, and the place above the stand where
// the pot will be put back together, seen a little more from above.
function shardsFraming() {
  const box = drop.shardBounds();
  box.union(new THREE.Box3().setFromObject(chosen.stand));
  chosen.pot.geometry.computeBoundingBox();
  box.union(chosen.pot.geometry.boundingBox.clone().applyMatrix4(mend.assemblyMatrix()));
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
  hush();
  placards.hide();

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
  say('lift', -0.6);
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
  setState('gather');
  mend.begin(chosen.seed);
  // Walk around the pieces to find them all; a tap still picks one.
  enableOrbit({ minPolar: 12 });
  say('gather', -0.6);
  againButton.show();
}

// --- Moving the camera (Gather, Trace and Keep) ---------------------------------

// Orbit around the current look target; the current view becomes "home".
function enableOrbit({ minPolar = 30, zoomIn = 0.3, zoomOut = 2.2 } = {}) {
  controls.target.copy(look);
  const d = camera.position.distanceTo(look);
  controls.minDistance = d * zoomIn;
  controls.maxDistance = d * zoomOut;
  controls.minPolarAngle = THREE.MathUtils.degToRad(minPolar);
  orbitHome.position.copy(camera.position);
  orbitHome.target.copy(look);
  controls.enabled = true;
  controls.update();
  viewButtons.show();
}

function disableOrbit() {
  controls.enabled = false;
  viewButtons.hide();
}

// Sliding the view is held near the pot, so it can never be lost.
function clampTarget() {
  const t = controls.target, h = orbitHome.target;
  const before = t.clone();
  t.x = THREE.MathUtils.clamp(t.x, h.x - 1.1, h.x + 1.1);
  t.y = THREE.MathUtils.clamp(t.y, 0.05, h.y + 0.9);
  t.z = THREE.MathUtils.clamp(t.z, h.z - 1.1, h.z + 1.1);
  camera.position.add(before.sub(t).negate());
}

// The zoom buttons: ease closer or further along the line of sight.
function zoomBy(factor) {
  if (!controls.enabled) return;
  const dir = camera.position.clone().sub(controls.target);
  const from = dir.length();
  const to = THREE.MathUtils.clamp(from * factor, controls.minDistance, controls.maxDistance);
  dir.normalize();
  tween({
    duration: 0.45,
    easing: ease.inOutSine,
    onUpdate: (k) => camera.position.copy(controls.target).addScaledVector(dir, lerp(from, to, k)),
  });
}

// The turn buttons and arrow keys: walk around the pot.
const UP = new THREE.Vector3(0, 1, 0);
function turnBy(angle) {
  if (!controls.enabled) return;
  const offset = camera.position.clone().sub(controls.target);
  let turned = 0;
  tween({
    duration: 0.7,
    easing: ease.inOutSine,
    onUpdate: (k) => {
      offset.applyAxisAngle(UP, angle * k - turned);
      turned = angle * k;
      camera.position.copy(controls.target).add(offset);
    },
  });
}

// Up and down arrows: look more from above, or more from the side.
function tiltBy(delta) {
  if (!controls.enabled) return;
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const from = s.phi;
  const to = THREE.MathUtils.clamp(from + delta, controls.minPolarAngle, controls.maxPolarAngle);
  const v = new THREE.Vector3();
  tween({
    duration: 0.5,
    easing: ease.inOutSine,
    onUpdate: (k) => {
      s.phi = lerp(from, to, k);
      camera.position.copy(controls.target).add(v.setFromSpherical(s));
    },
  });
}

window.addEventListener('keydown', (e) => {
  if (!controls.enabled || e.altKey || e.ctrlKey || e.metaKey) return;
  const keys = {
    ArrowLeft: () => turnBy(Math.PI / 8),
    ArrowRight: () => turnBy(-Math.PI / 8),
    ArrowUp: () => tiltBy(-0.18),
    ArrowDown: () => tiltBy(0.18),
    '+': () => zoomBy(0.8),
    '=': () => zoomBy(0.8),
    '-': () => zoomBy(1.25),
    0: recentre,
  };
  const action = keys[e.key];
  if (!action) return;
  e.preventDefault();
  action();
});

// Back to the view this step began with.
async function recentre() {
  if (!controls.enabled || cameraMoving) return;
  const enabledStates = state;
  controls.enabled = false;
  look.copy(controls.target);
  await moveCamera({ position: orbitHome.position.clone(), target: orbitHome.target.clone() }, 1.1);
  if (state !== enabledStates) return;
  controls.target.copy(look);
  controls.enabled = true;
  controls.update();
}

// --- Gold, trace and keep -------------------------------------------------------

// Every piece is home: swap them for the intact pot (no hairline gaps), let
// it settle onto its stand, then the dark lacquer runs along every crack and
// fills the lost piece's place, which turns to solid gold. Then the visitor
// lays the gold on the seams.
async function whole() {
  setState('gold');
  disableOrbit();
  hush();
  againButton.hide();
  const pot = drop.pot;
  for (const s of drop.shards) s.mesh.visible = false;
  mend.assembly.decompose(pot.position, pot.quaternion, pot.scale);
  pot.visible = true;

  gold = createGold(drop.cracks, { envMap: view.envMap, seed: chosen.seed });
  gold.flow = 0;
  gold.gild = 0;
  pot.add(gold.mesh);
  const lost = drop.shards.find((s) => s.lost);
  if (lost) {
    goldPatch = createGoldPatch(lost.geometry, { envMap: view.envMap });
    goldPatch.mesh.position.copy(lost.rest);
    pot.add(goldPatch.mesh);
  }

  const fromY = pot.position.y;
  const restY = new THREE.Vector3().setFromMatrixPosition(drop.restMatrix).y;
  await Promise.all([
    tween({ duration: 1.8, easing: ease.joHaKyu, onUpdate: (k) => (pot.position.y = lerp(fromY, restY, k)) }),
    moveCamera(heroFraming(chosen), 2.4),
  ]);
  if (state !== 'gold') return;
  audio.settle();

  await tween({
    duration: 2.4,
    easing: ease.outCubic,
    onUpdate: (k) => {
      gold.flow = k;
      if (goldPatch) goldPatch.show = k;
    },
  });
  if (state !== 'gold') return;
  if (goldPatch) await tween({ duration: 2, easing: ease.joHaKyu, onUpdate: (k) => (goldPatch.fill = k) });
  if (state !== 'gold') return;

  setState('trace');
  enableOrbit({ minPolar: 20 });
  say('trace', -0.6);
  gildButton.show();
  doneButton.show();
}

// A stroke on the pot lays gold; anywhere else turns the view.
function startTrace(e) {
  // Only the main button (or a finger) paints; right-drag always turns.
  if (state !== 'trace' || e.target !== renderer.domElement || !e.isPrimary || e.button !== 0) return;
  if (!trace.start(e, drop.pot, gold)) return;
  clearTimeout(finishTimer);
  controls.enabled = false; // this press paints; OrbitControls must not see it
  ui.setPrompt(null);
}

function endTrace() {
  if (!trace.active) return;
  trace.end();
  controls.enabled = true;
  // Nearly all of it gilded by hand: let it rest, then move on.
  if (gold.coverage() > 0.9) {
    finishTimer = setTimeout(() => state === 'trace' && !trace.active && finishTrace(), 1400);
  }
}

// ✦ The rest takes the gold by itself, grain by grain.
async function gildRest() {
  if (state !== 'trace') return;
  setState('gold');
  hideTraceButtons();
  hush();
  await tween({ duration: 2.8, easing: ease.inOutSine, onUpdate: (k) => (gold.gild = k) });
  if (state === 'gold') keep();
}

// ✓ Whatever is gilded now stays as it is; the rest remains lacquer.
function finishTrace() {
  if (state !== 'trace') return;
  hideTraceButtons();
  keep();
}

function hideTraceButtons() {
  clearTimeout(finishTimer);
  gildButton.hide();
  doneButton.hide();
}

// The pot turns slowly on its stand; the visitor may walk around it.
function keep() {
  setState('keep');
  chosen.group.attach(drop.pot);
  enableOrbit();
  say('keep', -0.4, -0.1);
  audio.rin();
  saveButton.show();
  againButton.show();
}

async function save() {
  const { kanji } = meiFor(chosen.seed);
  await savePNG({ renderer, scene, camera, seed: chosen.seed, filename: `tsugu-${chosen.type}-${kanji}.png` });
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

const gildButton = ui.button('gild', 'gild', gildRest);
const doneButton = ui.button('done', 'done', finishTrace);
const saveButton = ui.button('save', 'save', save);
const againButton = ui.button('again', 'again', again);

async function again() {
  if (busy) return;
  busy = true;
  againButton.hide();
  saveButton.hide();
  hush();
  await ui.close();
  disableOrbit();
  trace.end();
  hideTraceButtons();
  mend.reset();
  gold?.dispose();
  gold = null;
  goldPatch?.dispose();
  goldPatch = null;
  drop.reset();
  baseSeed = freshSeed();
  chosen = null;
  buildStations();
  setCamera(chooseFraming());
  setState('choose');
  ui.open();
  say('choose', 0.4, 0.7);
  placards.show();
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
let lastBackgroundTap = null;

// Capture phase on the document: decides whether a press paints before
// OrbitControls (listening on the canvas) can treat it as an orbit.
document.addEventListener('pointerdown', startTrace, { capture: true });

// Double-tap (or double-click) the background to recentre the view.
function backgroundTap(e) {
  const now = performance.now();
  const prev = lastBackgroundTap;
  lastBackgroundTap = { x: e.clientX, y: e.clientY, t: now };
  if (prev && now - prev.t < 380 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
    lastBackgroundTap = null;
    recentre();
  }
}

canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (state === 'lift' && !busy && pick(e) === chosen && drop.grab(e, worldPerPixel())) {
    hush();
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
    say('lift', 0.6);
  }
}

canvas.addEventListener('pointercancel', () => {
  down = null;
  if (drop.dragging) endDrag();
  endTrace();
});

canvas.addEventListener('pointerup', (e) => {
  if (drop.dragging) {
    down = null;
    endDrag();
    return;
  }
  if (trace.active) {
    down = null;
    endTrace();
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
  } else if (state === 'gather' && !busy && mend.tap(e)) {
    ui.setPrompt(null);
  } else if (controls.enabled) {
    backgroundTap(e);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (drop.dragging) {
    drop.move(e);
    return;
  }
  if (trace.active) {
    trace.move(e);
    return;
  }
  if (e.pointerType !== 'mouse' || busy) return;
  if (state === 'choose') {
    hovered = pick(e);
    canvas.style.cursor = hovered ? 'pointer' : '';
  } else if (state === 'gather') {
    canvas.style.cursor = mend.hovering(e) ? 'pointer' : 'grab';
  } else if (state === 'trace') {
    canvas.style.cursor = trace.hovering(e, drop.pot) ? 'crosshair' : 'grab';
  } else if (state === 'keep') {
    canvas.style.cursor = 'grab';
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
  } else if (chosen && !controls.enabled && state !== 'gold') {
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
    placePlacards();
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
  // Gather, Trace and Keep: the visitor's own view; in Keep, a slow turntable too.
  if (state === 'keep') chosen.group.rotation.y += dt * 0.14;
  if (controls.enabled) {
    controls.update();
    clampTarget();
    look.copy(controls.target);
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
applyLanguage();
setState('choose');
setCamera(chooseFraming());
if (import.meta.env.DEV) console.debug(`[tsugu] scene built in ${Math.round(performance.now() - startedAt)} ms`);
requestAnimationFrame(() => {
  ui.open();
  say('choose', 0.8);
  placards.show();
  // Fetch the physics engine quietly while the visitor chooses.
  setTimeout(loadPhysics, 1200);
});

if (import.meta.env.DEV) {
  window.__tsugu = { scene, camera, renderer, drop, mend, audio, stations: () => stations, state: () => state, gold: () => gold };
}
