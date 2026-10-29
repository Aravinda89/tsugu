// Renderer, camera, lights, environment and floor: a low-key still life.
// One warm key light through a shōji screen, a dark room, a dark floor that
// melts into the backdrop.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTileableNoise2D, tileableFbm, hashSeed } from './utils/random.js';

export const BACKDROP = new THREE.Color(0x2a1e16);
export const FOV = 30;
export const PITCH = THREE.MathUtils.degToRad(11);

export function createScene(container) {
  const coarse = matchMedia('(pointer: coarse)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BACKDROP, 9, 22);

  // Soft reflections without an HDRI. Kept low so the room stays dark;
  // the gold (Phase 3) raises its own envMapIntensity.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100);

  // Backdrop: a far dome that is fully fogged, so floor and wall share one
  // tone-mapped colour and the horizon disappears.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 16),
    new THREE.MeshBasicMaterial({ color: BACKDROP, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(dome);

  // Key light: warm, soft, from the upper left and front, falling through a shōji screen.
  const key = new THREE.SpotLight(0xffd6a8, 175, 0, 0.62, 0.65, 2);
  key.position.set(-4.6, 5.0, 2.5);
  key.target.position.set(0.2, 0.3, 0);
  key.map = createShojiTexture();
  key.castShadow = true;
  key.shadow.mapSize.setScalar(coarse ? 1024 : 2048);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 16;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6;
  scene.add(key, key.target);

  // A faint warm rim from behind-right, no shadows, to lift the silhouette.
  const rim = new THREE.DirectionalLight(0xffc89a, 0.35);
  rim.position.set(3.5, 2.6, -3);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), createFloorMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, key, floor, resize, coarse, envMap: scene.environment };
}

// Places the camera so a box of (width × height) centred on `target` fills
// the given fractions of the screen, looking down by `pitch`.
export function frameCamera(camera, target, width, height, fillW, fillH, pitch = PITCH) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  const d = Math.max(width / 2 / (tanH * fillW), height / 2 / (tanV * fillH));
  return {
    position: new THREE.Vector3(target.x, target.y + Math.sin(pitch) * d, target.z + Math.cos(pitch) * d),
    target: target.clone(),
  };
}

// The shōji lattice as a light cookie: three by three panes of paper with
// soft-edged wooden bars. The middle pane lands on the chosen pot.
function createShojiTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const panes = 3;
  const bar = 0.01;
  const soft = 0.022;
  const smooth = (a, b, x) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) / size, fy = (y + 0.5) / size;
      const dx = Math.abs(fx * panes - Math.round(fx * panes)) / panes;
      const dy = Math.abs(fy * panes - Math.round(fy * panes)) / panes;
      const open = smooth(bar, bar + soft, Math.min(dx, dy));
      const v = Math.round(255 * (0.55 + 0.45 * open));
      const k = (y * size + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFloorMaterial() {
  const size = 256;
  const noise = createTileableNoise2D(hashSeed('floor'));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = tileableFbm(noise, (x / size) * 16, (y / size) * 16, 16, 4);
      const l = 1 + 0.07 * n;
      const k = (y * size + x) * 4;
      img.data[k] = 56 * l;
      img.data[k + 1] = 42 * l;
      img.data[k + 2] = 32 * l;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(20, 20);
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.25, roughness: 0.97, metalness: 0 });
}
