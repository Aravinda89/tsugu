// Procedural pots. A pot is a surface of revolution defined by a 2D profile,
// thickened into a closed shell (outer surface, rounded rim, inner surface).
//
// Everything is expressed through one parametric function:
//   surfacePoint(u, v, t)
//     u: angle around the pot, 0..1 (wraps)
//     v: arc length along the outer profile, 0 at the base centre .. 1 at the rim
//     t: across the wall, 0 = outer surface .. 1 = inner surface
// The intact mesh samples it on a grid; the fracture (Phase 2) samples the
// very same function over each Voronoi cell, so shards match the pot exactly.

import * as THREE from 'three';
import { PROFILES } from './profiles.js';
import {
  createRandom,
  createPeriodicNoise,
  createTileableNoise2D,
  tileableFbm,
  hashSeed,
} from '../utils/random.js';

const LUT_SIZE = 512;
const TAU = Math.PI * 2;
const TEXTURE_TILE = 0.6; // world units covered by one clay texture tile

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// --- Profile lookup table ---------------------------------------------------

const lutCache = new Map();

// Samples the profile spline evenly by arc length, with outward 2D normals.
export function getProfileLUT(type) {
  if (lutCache.has(type)) return lutCache.get(type);
  const profile = PROFILES[type];
  if (!profile) throw new Error(`Unknown pot type: ${type}`);

  const curve = new THREE.CatmullRomCurve3(
    profile.points.map(([r, y]) => new THREE.Vector3(r, y, 0)),
    false,
    'centripetal',
  );
  curve.arcLengthDivisions = 2048;

  const n = LUT_SIZE + 1;
  const r = new Float64Array(n);
  const y = new Float64Array(n);
  const nr = new Float64Array(n);
  const ny = new Float64Array(n);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    curve.getPointAt(i / LUT_SIZE, p);
    r[i] = Math.max(p.x, 0);
    y[i] = Math.max(p.y, 0);
  }
  r[0] = 0;
  y[0] = 0;

  for (let i = 0; i < n; i++) {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, n - 1);
    const tx = r[b] - r[a];
    const ty = y[b] - y[a];
    const len = Math.hypot(tx, ty) || 1;
    // Outward normal: the tangent rotated a quarter turn clockwise.
    nr[i] = ty / len;
    ny[i] = -tx / len;
  }
  nr[0] = 0;
  ny[0] = -1;

  let maxR = 0, maxRY = 0;
  for (let i = 0; i < n; i++) {
    if (r[i] > maxR) {
      maxR = r[i];
      maxRY = y[i];
    }
  }

  const lut = {
    profile,
    r, y, nr, ny,
    length: curve.getLength(),
    height: y[n - 1],
    maxRadius: maxR,
    maxRadiusHeight: maxRY,
  };
  lutCache.set(type, lut);
  return lut;
}

function sampleLUT(lut, v, out) {
  const f = Math.min(Math.max(v, 0), 1) * LUT_SIZE;
  const i = Math.min(Math.floor(f), LUT_SIZE - 1);
  const k = f - i;
  out.r = lut.r[i] + (lut.r[i + 1] - lut.r[i]) * k;
  out.y = lut.y[i] + (lut.y[i + 1] - lut.y[i]) * k;
  const nr = lut.nr[i] + (lut.nr[i + 1] - lut.nr[i]) * k;
  const ny = lut.ny[i] + (lut.ny[i + 1] - lut.ny[i]) * k;
  const len = Math.hypot(nr, ny) || 1;
  out.nr = nr / len;
  out.ny = ny / len;
  return out;
}

// --- Pot shape (pure math, no DOM) -----------------------------------------

export function createPotShape(type, seed = 1) {
  const lut = getProfileLUT(type);
  const { profile, height: H } = lut;
  const rng = createRandom(hashSeed(type, seed, 'shape'));
  const radialNoise = createPeriodicNoise(hashSeed(type, seed, 'radial'), 3);
  const rimNoise = createPeriodicNoise(hashSeed(type, seed, 'rim'), 2);
  const lumpNoise = createPeriodicNoise(hashSeed(type, seed, 'lump'), 2);

  // Handmade irregularity, all small. No pot is perfectly symmetric.
  const radAmp = rng.range(0.016, 0.028);
  const radFreqU = rng.range(1.6, 3.2);
  const radFreqV = rng.range(1.2, 2.4);
  const rimAmp = rng.range(0.007, 0.014) * H;
  const ovalAmt = rng.range(0.006, 0.016);
  const ovalDir = rng.range(0, TAU);
  const leanAmt = rng.range(0.004, 0.012) * H;
  const leanDir = rng.range(0, TAU);
  const lumpAmp = rng.range(0.0025, 0.0045); // finger-pressed unevenness, in world units

  const thicknessAt = (v) => profile.thickness * (1 + (profile.lipThickness - 1) * smoothstep(0.9, 1, v));
  const s = { r: 0, y: 0, nr: 0, ny: 0 };

  function surfacePoint(u, v, t = 0, target = new THREE.Vector3()) {
    sampleLUT(lut, v, s);
    const th = thicknessAt(v);
    let pr = Math.max(s.r - s.nr * th * t, 0);
    let py = s.y - s.ny * th * t;

    // Rounded lip: at the rim the wall closes over in a soft arc.
    if (v >= 1 - 1e-9) py += Math.sin(Math.PI * t) * th * profile.rimRound;

    const a = u * TAU;
    pr *= 1 + radAmp * radialNoise(u, v, radFreqU, radFreqV);
    pr *= 1 + ovalAmt * Math.cos(2 * (a - ovalDir)) * smoothstep(0.2, 1, v);
    if (v > 0.05) pr += lumpAmp * lumpNoise(u, v, 9, 8) * smoothstep(0.05, 0.15, v);
    if (v > 0.75) py += rimAmp * rimNoise(u, 0.37, 3, 1) * smoothstep(0.75, 1, v);

    const lean = leanAmt * (py / H) * (py / H);
    return target.set(
      pr * Math.cos(a) + lean * Math.cos(leanDir),
      py,
      pr * Math.sin(a) + lean * Math.sin(leanDir),
    );
  }

  // The unperturbed outward direction, used to orient finite-difference normals.
  function referenceNormal(u, v, t, target = new THREE.Vector3()) {
    sampleLUT(lut, v, s);
    let er = s.nr, ey = s.ny;
    if (v >= 1 - 1e-9 && t > 0 && t < 1) {
      // Over the lip the normal rolls from outward, through up, to inward.
      const c = Math.cos(Math.PI * t), sn = Math.sin(Math.PI * t);
      er = s.nr * c - s.ny * sn;
      ey = s.ny * c + s.nr * sn;
    } else if (t >= 1) {
      er = -er;
      ey = -ey;
    }
    const a = u * TAU;
    return target.set(er * Math.cos(a), ey, er * Math.sin(a)).normalize();
  }

  return {
    type,
    seed,
    profile,
    height: H,
    maxRadius: lut.maxRadius,
    maxRadiusHeight: lut.maxRadiusHeight,
    profileLength: lut.length,
    circumference: TAU * lut.maxRadius,
    thicknessAt,
    surfacePoint,
    referenceNormal,
  };
}

// --- Geometry -----------------------------------------------------------------

export function buildPotGeometry(shape, { segU = 128, segV = 96, segT = 8 } = {}) {
  const stride = segU + 1;
  const vertexCount = stride * (2 * (segV + 1) + segT + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(segU * (2 * segV + segT) * 6);
  let vertex = 0;
  let index = 0;

  const repU = Math.max(1, Math.round(shape.circumference / TEXTURE_TILE));
  const lenV = shape.profileLength / TEXTURE_TILE;

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const vt = [0, 0];

  // point(w, out) maps a row coordinate to (v, t); w is v or t depending on the patch.
  function addPatch({ rows, point, shade, uvStart, uvSpan }) {
    const base = vertex;
    for (let j = 0; j <= rows; j++) {
      const w = j / rows;
      point(w, vt);
      const c = shade(w);
      for (let i = 0; i <= segU; i++) {
        shape.surfacePoint(i / segU, vt[0], vt[1], p);
        const k = base + j * stride + i;
        positions[k * 3] = p.x;
        positions[k * 3 + 1] = p.y;
        positions[k * 3 + 2] = p.z;
        uvs[k * 2] = (i / segU) * repU;
        uvs[k * 2 + 1] = uvStart + w * uvSpan;
        colors[k * 3] = colors[k * 3 + 1] = colors[k * 3 + 2] = c;
      }
    }

    // Normals from neighbouring grid points (wrapping in u), oriented
    // against the unperturbed normal.
    const P = (i, j, axis) => positions[(base + j * stride + i) * 3 + axis];
    for (let j = 0; j <= rows; j++) {
      point(j / rows, vt);
      const jd = Math.min(j + 1, rows), jb = Math.max(j - 1, 0);
      for (let i = 0; i <= segU; i++) {
        const il = i === 0 ? segU - 1 : i - 1;
        const ir = i === segU ? 1 : i + 1;
        const ux = P(ir, j, 0) - P(il, j, 0), uy = P(ir, j, 1) - P(il, j, 1), uz = P(ir, j, 2) - P(il, j, 2);
        const wx = P(i, jd, 0) - P(i, jb, 0), wy = P(i, jd, 1) - P(i, jb, 1), wz = P(i, jd, 2) - P(i, jb, 2);
        n.set(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
        shape.referenceNormal(i / segU, vt[0], vt[1], ref);
        if (n.lengthSq() < 1e-14) n.copy(ref);
        else {
          n.normalize();
          if (n.dot(ref) < 0) n.negate();
        }
        const k = (base + j * stride + i) * 3;
        normals[k] = n.x;
        normals[k + 1] = n.y;
        normals[k + 2] = n.z;
      }
    }

    // Winding chosen so faces point along the oriented normals (verified in tests).
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < segU; i++) {
        const a = base + j * stride + i;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices[index++] = a;
        indices[index++] = c;
        indices[index++] = b;
        indices[index++] = b;
        indices[index++] = c;
        indices[index++] = d;
      }
    }
    vertex += (rows + 1) * stride;
  }

  // Outer surface: base centre up to the rim.
  addPatch({
    rows: segV,
    point: (w, out) => ((out[0] = w), (out[1] = 0)),
    shade: (w) => 0.78 + 0.22 * smoothstep(0.04, 0.5, w),
    uvStart: 0,
    uvSpan: lenV,
  });

  // Rim: across the wall at v = 1, from outer to inner, slightly lighter (worn lip).
  addPatch({
    rows: segT,
    point: (w, out) => ((out[0] = 1), (out[1] = w)),
    shade: () => 1.04,
    uvStart: lenV,
    uvSpan: 0.08,
  });

  // Inner surface: rim back down to the inner base centre, darker inside.
  // Rows run rim → base so the shared winding still faces into the cavity.
  addPatch({
    rows: segV,
    point: (w, out) => ((out[0] = 1 - w), (out[1] = 1)),
    shade: (w) => 0.5 + 0.42 * smoothstep(0.55, 0, w),
    uvStart: lenV + 0.08,
    uvSpan: lenV,
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // The fracture works on this same grid: outer rows, then rim rows, then inner rows.
  geometry.userData.grid = { segU, segV, segT, repU };
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// --- Clay material (browser only: uses canvas) ------------------------------

let clayTextures = null;

function getClayTextures() {
  if (clayTextures) return clayTextures;
  const size = 512;
  const rng = createRandom(hashSeed('clay-texture'));
  const mottle = createTileableNoise2D(hashSeed('clay-mottle'));
  const grain = createTileableNoise2D(hashSeed('clay-grain'));
  const tint = createTileableNoise2D(hashSeed('clay-tint'));

  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = bumpCanvas.width = bumpCanvas.height = size;
  const cctx = colorCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');
  const cimg = cctx.createImageData(size, size);
  const bimg = bctx.createImageData(size, size);

  // Unglazed terracotta, mottled with darker fire-marks, with fine grit.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / size, fy = y / size;
      const m = tileableFbm(mottle, fx * 5, fy * 5, 5, 3);
      const g = tileableFbm(grain, fx * 64, fy * 64, 64, 2);
      const mid = tileableFbm(grain, fx * 16 + 3.3, fy * 16, 16, 2);
      const h = tileableFbm(tint, fx * 2, fy * 2, 2, 3);
      const scorch = smoothstep(-0.15, -0.6, h) * 0.2;
      const light = (1 + 0.16 * m + 0.07 * g + 0.05 * mid) * (1 - scorch);
      const k = (y * size + x) * 4;
      cimg.data[k] = Math.min(255, (172 + 8 * h) * light);
      cimg.data[k + 1] = Math.min(255, (104 + 3 * h) * light);
      cimg.data[k + 2] = Math.min(255, (70 - 4 * h) * light);
      cimg.data[k + 3] = 255;
      const b = 128 + 34 * g + 52 * mid + 18 * m;
      bimg.data[k] = bimg.data[k + 1] = bimg.data[k + 2] = b;
      bimg.data[k + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);

  // Draws a dot, repeated across the tile edges so the texture stays seamless.
  const dot = (ctx, x, y, r, style) => {
    ctx.fillStyle = style;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, TAU);
        ctx.fill();
      }
    }
  };

  // Dark specks and pale grit in the clay body.
  for (let i = 0; i < 700; i++) {
    const x = rng.range(0, size), y = rng.range(0, size);
    dot(cctx, x, y, rng.range(0.4, 1.4), `rgba(60, 30, 15, ${rng.range(0.1, 0.4)})`);
  }
  for (let i = 0; i < 260; i++) {
    const x = rng.range(0, size), y = rng.range(0, size);
    dot(cctx, x, y, rng.range(0.4, 1.1), `rgba(235, 190, 150, ${rng.range(0.15, 0.4)})`);
  }
  // Small pits: shallow in colour, deep in the bump map.
  for (let i = 0; i < 110; i++) {
    const x = rng.range(0, size), y = rng.range(0, size);
    const r = rng.range(1, 4.5);
    dot(cctx, x, y, r, `rgba(80, 40, 20, ${rng.range(0.08, 0.22)})`);
    dot(bctx, x, y, r, `rgba(30, 30, 30, ${rng.range(0.35, 0.7)})`);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  for (const tex of [map, bumpMap]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
  }
  clayTextures = { map, bumpMap };
  return clayTextures;
}

export function createClayMaterial(seed = 1) {
  const { map, bumpMap } = getClayTextures();
  const rng = createRandom(hashSeed('clay-jitter', seed));
  // Per-pot jitter so no two pots are fired quite the same.
  const color = new THREE.Color().setHSL(rng.range(0.03, 0.08), rng.range(0.05, 0.25), rng.range(0.8, 0.92));
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap,
    bumpScale: 2,
    color,
    roughness: 0.94,
    metalness: 0,
    vertexColors: true,
  });
}

// Freshly broken edges: the same clay body, paler and rougher, unweathered.
// Vertex colours darken the middle of the wall into a fired core.
export function createEdgeMaterial() {
  const { map, bumpMap } = getClayTextures();
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap,
    bumpScale: 2.5,
    color: new THREE.Color(1.08, 0.86, 0.74),
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });
}

export function createPot(type, seed = 1) {
  const shape = createPotShape(type, seed);
  const geometry = buildPotGeometry(shape);
  const mesh = new THREE.Mesh(geometry, createClayMaterial(hashSeed(type, seed)));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `pot-${type}`;
  return { mesh, shape };
}
