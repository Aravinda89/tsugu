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

// --- The old kilns -----------------------------------------------------------
// Each pot comes from one of Japan's old wood-fired kilns. It shows in the clay
// body and its grit, the throwing rings, how the wood ash settles and melts on
// it, the blush on the side that faced the fire, and the colour of its broken
// edges. Texture colours are sRGB 0..255.
export const KILNS = {
  // 信楽 Shigaraki: coarse orange-pink clay. White feldspar stones burst
  // through the skin; green, glassy ash gathers on the shoulder.
  shigaraki: {
    body: [182, 106, 66],
    mottle: 0.2,
    grain: 0.08,
    scorch: 0.3,
    specks: { count: 520, size: [0.4, 1.3], color: '62, 32, 18' },
    grit: { count: 300, size: [0.7, 2.6], color: '240, 226, 204', raised: 0.6 },
    pits: { count: 150, size: [1, 4.5] },
    rings: { count: 11, depth: 8, spacing: 0.06, amp: 0.0014 },
    bumpScale: 1.7,
    roughness: 0.95,
    ash: { amount: 1, color: '#58652e', roughness: 0.3, breakup: 0.85, inside: 0.7, runs: 0, specks: false },
    flash: { color: [1.12, 0.84, 0.7], amount: 0.7 }, // hi-iro: the fire's blush
    edge: [226, 196, 164], // pale buff body
  },
  // 備前 Bizen: fine, dense red-brown clay, fired unglazed for days. The ash
  // lands as golden sesame specks (goma) rather than a glaze.
  bizen: {
    body: [128, 64, 42],
    mottle: 0.22,
    grain: 0.05,
    scorch: 0.45,
    specks: { count: 260, size: [0.4, 1.1], color: '40, 20, 12' },
    grit: { count: 70, size: [0.4, 1], color: '205, 160, 120', raised: 0.2 },
    pits: { count: 40, size: [0.8, 2.5] },
    rings: { count: 12, depth: 6, spacing: 0.05, amp: 0.001 },
    bumpScale: 1.1,
    roughness: 0.82,
    ash: { amount: 0.95, color: '#c9a35c', roughness: 0.42, breakup: 1.15, inside: 0.4, runs: 0, specks: true },
    flash: { color: [0.62, 0.56, 0.56], amount: 0.65 }, // the fire side darkens
    edge: [104, 88, 82], // dark grey-brown body
  },
  // 丹波 Tamba: warm brown clay; olive ash glaze runs down from the rim.
  tamba: {
    body: [124, 82, 58],
    mottle: 0.16,
    grain: 0.06,
    scorch: 0.25,
    specks: { count: 420, size: [0.4, 1.3], color: '48, 26, 14' },
    grit: { count: 180, size: [0.5, 1.6], color: '220, 196, 166', raised: 0.4 },
    pits: { count: 100, size: [1, 3.5] },
    rings: { count: 10, depth: 8, spacing: 0.055, amp: 0.0015 },
    bumpScale: 1.5,
    roughness: 0.92,
    ash: { amount: 0.85, color: '#4c5026', roughness: 0.34, breakup: 0.75, inside: 0.85, runs: 1, specks: false },
    flash: { color: [0.9, 0.8, 0.72], amount: 0.5 },
    edge: [150, 128, 112], // grey-brown body
  },
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
  // Throwing rings (rokuro-me): shallow ridges the potter's fingers leave on
  // the wheel, a little uneven. In the shape itself, so they catch the light.
  // (A few seeded sines rather than noise: this runs for every vertex.)
  const rings = KILNS[profile.kiln].rings;
  const [rp0, rp1, rp2, rp3] = [0, 1, 2, 3].map(() => rng.range(0, TAU));
  const ringAt = (u, v) =>
    rings.amp *
    Math.sin(TAU * ((v * lut.length) / rings.spacing) + rp0 + 0.9 * Math.sin(TAU * u + rp1) + 0.5 * Math.sin(2 * TAU * u + 3 * v + rp2)) *
    (0.7 + 0.3 * Math.sin(3 * TAU * u + 7 * v + rp3)) *
    smoothstep(0.1, 0.22, v) *
    smoothstep(1, 0.96, v);

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
    if (v > 0.1) pr += ringAt(u, v);
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

  // Kiln marks: how much wood ash settled and melted here (0..1), and how
  // strongly the fire flashed this side (0..1). Ash falls on whatever faces up,
  // most of all on the side that faced the fire; little reaches inside a
  // narrow mouth.
  const kiln = KILNS[profile.kiln];
  const fireRng = createRandom(hashSeed(type, seed, 'fire'));
  const fireU = fireRng.next();
  const farSide = fireRng.range(0.2, 0.4); // how much ash still reaches the far side
  const ashNoise = createPeriodicNoise(hashSeed(type, seed, 'ash'), 2);
  const runNoise = createPeriodicNoise(hashSeed(type, seed, 'runs'), 1);
  const flashNoise = createPeriodicNoise(hashSeed(type, seed, 'flash'), 1);
  const openness = Math.min(1, (lut.r[LUT_SIZE] / lut.maxRadius) ** 2);
  const up = new THREE.Vector3();

  function kilnAt(u, v, t, out = [0, 0]) {
    referenceNormal(u, v, t, up);
    const facing = 0.5 + 0.5 * Math.cos(TAU * (u - fireU));
    const side = farSide + (1 - farSide) * facing * facing;
    let ash = smoothstep(0.08, 0.7, up.y) * side * smoothstep(-0.4, 0.35, ashNoise(u, v, 3, 4));
    const inside = t >= 1 ? kiln.ash.inside * openness : 1;
    // In an open bowl, ash gathers in the well and melts into a pool of glass.
    const pool = t >= 1 ? smoothstep(0.86, 0.98, up.y) * (0.8 + 0.2 * side) * openness * openness : 0;
    if (kiln.ash.runs) {
      // Melted ash running down from the lip, each run its own length.
      const len = 0.08 + 0.3 * smoothstep(-0.3, 0.7, runNoise(u, 2.7, 9, 1));
      const run = smoothstep(0.05, 0.45, runNoise(u, 0.3, 16, 1)) * smoothstep(1 - len, 1 - len * 0.35, v);
      ash = Math.max(ash, run * side);
    }
    out[0] = Math.min(1, Math.max(ash * inside * kiln.ash.amount, pool));
    out[1] = t >= 1 ? 0 : kiln.flash.amount * facing * smoothstep(-0.5, 0.4, flashNoise(u, v, 2, 2));
    return out;
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
    kilnAt,
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
  const kilnMarks = new Float32Array(vertexCount * 2); // ash, fire flash
  const indices = new Uint32Array(segU * (2 * segV + segT) * 6);
  let vertex = 0;
  let index = 0;

  const repU = Math.max(1, Math.round(shape.circumference / TEXTURE_TILE));
  const lenV = shape.profileLength / TEXTURE_TILE;
  // About the length of the way over the rounded lip, so its clay isn't stretched.
  const rimV = (shape.thicknessAt(1) * (1 + 2 * shape.profile.rimRound)) / TEXTURE_TILE;

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const vt = [0, 0];
  const marks = [0, 0];

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
        shape.kilnAt(i / segU, vt[0], vt[1], marks);
        kilnMarks[k * 2] = marks[0];
        kilnMarks[k * 2 + 1] = marks[1];
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
    uvSpan: rimV,
  });

  // Inner surface: rim back down to the inner base centre, darker inside.
  // Rows run rim → base so the shared winding still faces into the cavity.
  addPatch({
    rows: segV,
    point: (w, out) => ((out[0] = 1 - w), (out[1] = 1)),
    shade: (w) => 0.5 + 0.42 * smoothstep(0.55, 0, w),
    uvStart: lenV + rimV,
    uvSpan: lenV,
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('kiln', new THREE.BufferAttribute(kilnMarks, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // The fracture works on this same grid: outer rows, then rim rows, then inner rows.
  geometry.userData.grid = { segU, segV, segT, repU };
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// --- Clay material (browser only: uses canvas) ------------------------------

const TEXTURE_SIZE = 512;
let noiseFields = null;
const kilnTextures = new Map();
const edgeMaterials = new Map();

// The noise every kiln's clay is mixed from: computed once, shared by all.
function getNoiseFields() {
  if (noiseFields) return noiseFields;
  const size = TEXTURE_SIZE;
  const mottle = createTileableNoise2D(hashSeed('clay-mottle'));
  const grain = createTileableNoise2D(hashSeed('clay-grain'));
  const tint = createTileableNoise2D(hashSeed('clay-tint'));
  const field = () => new Float32Array(size * size);
  const m = field(), g = field(), mid = field(), h = field();
  // The soft, slow fields (mottle, tint) are worked out on a coarser grid and
  // spread over the fine one: they change over hundreds of pixels anyway.
  const coarse = (target, n, fn) => {
    const step = size / n;
    for (let cy = 0; cy < n; cy++) {
      for (let cx = 0; cx < n; cx++) {
        const value = fn(cx / n, cy / n);
        for (let y = cy * step; y < (cy + 1) * step; y++) target.fill(value, y * size + cx * step, y * size + (cx + 1) * step);
      }
    }
  };
  coarse(m, 256, (fx, fy) => tileableFbm(mottle, fx * 5, fy * 5, 5, 3));
  coarse(h, 128, (fx, fy) => tileableFbm(tint, fx * 2, fy * 2, 2, 3));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / size, fy = y / size, k = y * size + x;
      g[k] = tileableFbm(grain, fx * 64, fy * 64, 64, 2);
      mid[k] = tileableFbm(grain, fx * 16 + 3.3, fy * 16, 16, 2);
    }
  }
  // Varies only around the pot, for ash that runs down the profile.
  const streak = new Float32Array(size);
  for (let x = 0; x < size; x++) streak[x] = tileableFbm(tint, (x / size) * 24, 0.5, 24, 2);
  noiseFields = { m, g, mid, h, streak };
  return noiseFields;
}

// Colour, bump and ash-mask textures for one kiln's clay.
function getClayTextures(name) {
  if (kilnTextures.has(name)) return kilnTextures.get(name);
  const kiln = KILNS[name];
  const size = TEXTURE_SIZE;
  const { m, g, mid, h, streak } = getNoiseFields();
  const rng = createRandom(hashSeed('clay-texture', name));

  const canvases = [0, 1, 2].map(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  });
  const [cctx, bctx, actx] = canvases.map((canvas) => canvas.getContext('2d'));
  const [cimg, bimg, aimg] = [cctx, bctx, actx].map((ctx) => ctx.createImageData(size, size));

  const [R, G, B] = kiln.body;
  const { count: rings, depth: ringDepth } = kiln.rings;
  const { mottle, grain, scorch } = kiln;
  const ashMode = kiln.ash.runs ? 2 : kiln.ash.specks ? 1 : 0;
  // One 32-bit write per pixel (little-endian RGBA), values clamped by hand.
  const [c32, b32, a32] = [cimg, bimg, aimg].map((img) => new Uint32Array(img.data.buffer));
  const byte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : v | 0);
  const grey = (v) => {
    const c = byte(v);
    return 0xff000000 | (c << 16) | (c << 8) | c;
  };
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (let y = 0; y < size; y++) {
    const fy = y / size;
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      const hk = h[k], mk = m[k], midk = mid[k];
      // The clay body, mottled, with darker fire-marks.
      const light = (1 + mottle * mk + grain * g[k] + 0.05 * midk) * (1 - ease((-0.15 - hk) / 0.45) * scorch);
      c32[k] = 0xff000000 | (byte((B - 4 * hk) * light) << 16) | (byte((G + 3 * hk) * light) << 8) | byte((R + 8 * hk) * light);
      // Throwing rings (rokuro-me), finest scale: the shape carries the broad
      // ridges (see ringAt). A whole number per tile, so it still repeats seamlessly.
      const ring = Math.sin(TAU * (fy * rings + 0.08 * hk)) * (0.6 + 0.4 * mk);
      b32[k] = grey(128 + 34 * g[k] + 52 * midk + 18 * mk + ringDepth * ring);
      // Where melted ash can bead and gather (white) or stays thin (black).
      const a =
        ashMode === 2
          ? ease((0.75 * streak[x] + 0.35 * midk + 0.25) / 0.7)
          : ashMode === 1
            ? 0.16 + 0.1 * mk
            : ease((0.7 * mk + 0.5 * midk + 0.35) / 0.75);
      a32[k] = grey(a * 255);
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  actx.putImageData(aimg, 0, 0);

  // Draws a dot, repeated across the tile edges it touches so the texture stays seamless.
  const wraps = (c, r) => [0, ...(c < r ? [size] : []), ...(c > size - r ? [-size] : [])];
  const dot = (ctx, x, y, r, style) => {
    ctx.fillStyle = style;
    for (const ox of wraps(x, r)) {
      for (const oy of wraps(y, r)) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, TAU);
        ctx.fill();
      }
    }
  };
  const anywhere = () => [rng.range(0, size), rng.range(0, size)];

  // Dark specks in the clay body.
  for (let i = 0; i < kiln.specks.count; i++) {
    const [x, y] = anywhere();
    dot(cctx, x, y, rng.range(...kiln.specks.size), `rgba(${kiln.specks.color}, ${rng.range(0.1, 0.4)})`);
  }
  // Pale grit; in Shigaraki, feldspar stones that burst through the skin and stand proud.
  for (let i = 0; i < kiln.grit.count; i++) {
    const [x, y] = anywhere();
    const r = rng.range(...kiln.grit.size);
    dot(cctx, x, y, r, `rgba(${kiln.grit.color}, ${rng.range(0.25, 0.75)})`);
    dot(bctx, x, y, r, `rgba(255, 255, 255, ${kiln.grit.raised * rng.range(0.4, 0.9)})`);
  }
  // Small pits: shallow in colour, deep in the bump map.
  for (let i = 0; i < kiln.pits.count; i++) {
    const [x, y] = anywhere();
    const r = rng.range(...kiln.pits.size);
    dot(cctx, x, y, r, `rgba(70, 36, 20, ${rng.range(0.08, 0.22)})`);
    dot(bctx, x, y, r, `rgba(30, 30, 30, ${rng.range(0.35, 0.7)})`);
  }
  // Ash: Bizen's sesame specks (goma); elsewhere, glassy beads where it pooled.
  if (kiln.ash.specks) {
    for (let i = 0; i < 1100; i++) {
      const [x, y] = anywhere();
      dot(actx, x, y, rng.range(1.2, 4.6), `rgba(255, 255, 255, ${rng.range(0.6, 1)})`);
    }
  } else {
    for (let i = 0; i < 70; i++) {
      const [x, y] = anywhere();
      dot(actx, x, y, rng.range(2, 6), `rgba(255, 255, 255, ${rng.range(0.4, 0.8)})`);
    }
  }

  const [map, bumpMap, ashMap] = canvases.map((canvas) => new THREE.CanvasTexture(canvas));
  map.colorSpace = THREE.SRGBColorSpace;
  for (const tex of [map, bumpMap, ashMap]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
  }
  const textures = { map, bumpMap, ashMap };
  kilnTextures.set(name, textures);
  return textures;
}

// Teaches a clay material the kiln marks carried by the `kiln` attribute
// (x: ash, y: fire flash): the fire's blush or darkening, and melted ash that
// tints the clay and turns glassy where it gathers.
function withKilnMarks(material, kiln, ashMap) {
  const uniforms = {
    uAshMap: { value: ashMap },
    uAshColor: { value: new THREE.Color(kiln.ash.color) },
    uAshRoughness: { value: kiln.ash.roughness },
    uAshBreakup: { value: kiln.ash.breakup },
    uFlash: { value: new THREE.Color(...kiln.flash.color) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 kiln;\nvarying vec2 vKiln;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKiln = kiln;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uAshMap;
uniform vec3 uAshColor;
uniform float uAshRoughness;
uniform float uAshBreakup;
uniform vec3 uFlash;
varying vec2 vKiln;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
diffuseColor.rgb *= mix(vec3(1.0), uFlash, vKiln.y);
float ashMask = texture2D(uAshMap, vMapUv).r;
// Thin ash breaks up into patches, specks or runs; where it lies thick it is one glaze.
float thick = smoothstep(0.65, 0.95, vKiln.x);
float glaze = clamp(vKiln.x * 1.6 - (1.0 - ashMask) * uAshBreakup * (1.0 - thick), 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, uAshColor * mix(0.6 + 0.7 * ashMask, 1.0, thick), smoothstep(0.05, 0.85, glaze) * 0.85);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, uAshRoughness, smoothstep(0.3, 0.95, glaze));`,
      )
      // Glass is smooth: melted ash fills the clay's grit and pits.
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'dHdxy_fwd()',
          'dHdxy_fwd() * (1.0 - 0.85 * smoothstep(0.5, 0.95, glaze))',
        ),
      );
  };
  return material;
}

export function createClayMaterial(seed = 1, kilnName = 'shigaraki') {
  const kiln = KILNS[kilnName];
  const { map, bumpMap, ashMap } = getClayTextures(kilnName);
  const rng = createRandom(hashSeed('clay-jitter', seed));
  // Per-pot jitter so no two pots are fired quite the same.
  const color = new THREE.Color().setHSL(rng.range(0.03, 0.08), rng.range(0.04, 0.16), rng.range(0.86, 0.96));
  const material = new THREE.MeshStandardMaterial({
    map,
    bumpMap,
    bumpScale: kiln.bumpScale,
    color,
    roughness: kiln.roughness,
    metalness: 0,
    vertexColors: true,
  });
  return withKilnMarks(material, kiln, ashMap);
}

// Freshly broken edges: the kiln's clay body as it is inside, rougher and
// unweathered. Vertex colours darken the middle of the wall into a fired core.
export function createEdgeMaterial(kilnName = 'shigaraki') {
  if (edgeMaterials.has(kilnName)) return edgeMaterials.get(kilnName);
  const kiln = KILNS[kilnName];
  const { map, bumpMap } = getClayTextures(kilnName);
  // Tints the outer clay (the texture) towards the colour of the inner body.
  const inner = new THREE.Color().setRGB(...kiln.edge.map((c) => c / 255), THREE.SRGBColorSpace);
  const outer = new THREE.Color().setRGB(...kiln.body.map((c) => c / 255), THREE.SRGBColorSpace);
  const material = new THREE.MeshStandardMaterial({
    map,
    bumpMap,
    bumpScale: kiln.bumpScale + 0.5,
    color: new THREE.Color(inner.r / outer.r, inner.g / outer.g, inner.b / outer.b),
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });
  edgeMaterials.set(kilnName, material);
  return material;
}

export function createPot(type, seed = 1) {
  const shape = createPotShape(type, seed);
  const geometry = buildPotGeometry(shape);
  const { kiln } = shape.profile;
  const mesh = new THREE.Mesh(geometry, createClayMaterial(hashSeed(type, seed), kiln));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `pot-${type}`;
  // Its shards' broken edges show this kiln's clay body.
  mesh.userData.edgeMaterial = createEdgeMaterial(kiln);
  return { mesh, shape };
}
