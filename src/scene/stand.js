// A low, weathered wooden stand: a thick slab on two runners. Dark, cracked,
// worn grain. Each pot sits on its own.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createNoise3D, createRandom, hashSeed } from '../utils/random.js';

export const SLAB_HEIGHT = 0.105;
export const FOOT_HEIGHT = 0.05;
export const STAND_TOP = SLAB_HEIGHT + FOOT_HEIGHT;

let woodTextures = null;

export function createStand(width, depth, seed = 1) {
  const rng = createRandom(hashSeed('stand', seed));
  const material = createWoodMaterial(rng);
  const group = new THREE.Group();
  group.name = 'stand';

  const slab = new THREE.Mesh(new RoundedBoxGeometry(width, SLAB_HEIGHT, depth, 3, 0.012), material);
  warp(slab.geometry, rng);
  slab.position.y = FOOT_HEIGHT + SLAB_HEIGHT / 2;
  slab.rotation.y = rng.range(-0.04, 0.04);

  const footGeometry = new RoundedBoxGeometry(0.11, FOOT_HEIGHT, depth * 0.84, 2, 0.008);
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(footGeometry, material);
    foot.position.set(side * (width / 2 - 0.13), FOOT_HEIGHT / 2, 0);
    group.add(foot);
  }
  group.add(slab);

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

// Gentle twist and dishing so the slab isn't machine-flat, but the top
// stays level enough for a pot to rest on.
function warp(geometry, rng) {
  const pos = geometry.attributes.position;
  const twist = rng.range(-0.006, 0.006);
  const sag = rng.range(0.002, 0.005);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.y += twist * v.x * v.z * 4 - sag * (v.x * v.x) * 2;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
}

function createWoodMaterial(rng) {
  const { map, bumpMap } = getWoodTextures();
  const offset = new THREE.Vector2(rng.next(), rng.next());
  const m = map.clone();
  const b = bumpMap.clone();
  m.offset.copy(offset);
  b.offset.copy(offset);
  m.userData.owned = b.userData.owned = true;
  return new THREE.MeshStandardMaterial({
    map: m,
    bumpMap: b,
    bumpScale: 2.2,
    roughness: 0.88,
    metalness: 0,
    color: new THREE.Color().setHSL(0.07, 0.25, rng.range(0.78, 0.92)),
  });
}

function getWoodTextures() {
  if (woodTextures) return woodTextures;
  const w = 512, h = 256;
  const rng = createRandom(hashSeed('wood'));
  const noise = createNoise3D(hashSeed('wood-grain'));
  const color = document.createElement('canvas');
  const bump = document.createElement('canvas');
  color.width = bump.width = w;
  color.height = bump.height = h;
  const cctx = color.getContext('2d');
  const bctx = bump.getContext('2d');
  const cimg = cctx.createImageData(w, h);
  const bimg = bctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / w, fy = y / h;
      // Rings: irregular stripes across the texture's width, bent by noise.
      const bend = noise(fy * 2.5, fx * 3, 0.3) * 2.6 + noise(fy * 9, fx * 6, 4.1) * 0.4;
      const ring = Math.pow(0.5 + 0.5 * Math.sin((fx * 17 + bend) * Math.PI), 3);
      const fibre = noise(fy * 6, fx * 160, 9.7);
      const weather = noise(fx * 3, fy * 4, 2.2);
      const l = 0.82 + 0.1 * ring + 0.09 * fibre + 0.18 * weather;
      const k = (y * w + x) * 4;
      cimg.data[k] = 64 * l;
      cimg.data[k + 1] = 44 * l;
      cimg.data[k + 2] = 30 * l;
      cimg.data[k + 3] = 255;
      const bv = 128 + 50 * ring + 40 * fibre;
      bimg.data[k] = bimg.data[k + 1] = bimg.data[k + 2] = bv;
      bimg.data[k + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);

  // Checks and cracks running with the grain.
  for (let i = 0; i < 14; i++) {
    let x = rng.range(0, w), y = rng.range(0, h);
    const len = rng.range(40, 220);
    const width = rng.range(0.6, 1.8);
    for (const ctx of [cctx, bctx]) {
      ctx.strokeStyle = ctx === cctx ? 'rgba(14, 9, 6, 0.85)' : 'rgba(0, 0, 0, 0.9)';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let cx = x, cy = y;
      for (let s = 0; s < len; s += 6) {
        cy += 6 * (h / w);
        cx += noise(cy * 0.05, cx * 0.02, i) * 1.6;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  woodTextures = { map, bumpMap };
  return woodTextures;
}
