// Seeded randomness and noise. Everything procedural in Tsugu flows through
// here, so a pot type + seed always reproduces the same pot and break.

// mulberry32: tiny, fast, good enough for visuals.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash any mix of strings and numbers into a 32-bit seed.
export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRandom(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// 3D value noise in [-1, 1]. Lattice values come from a seeded table.
export function createNoise3D(seed) {
  const rand = mulberry32(seed);
  const SIZE = 256;
  const values = new Float32Array(SIZE);
  const perm = new Uint16Array(SIZE * 2 + 2);
  for (let i = 0; i < SIZE; i++) {
    values[i] = rand() * 2 - 1;
    perm[i] = i;
  }
  for (let i = SIZE - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < SIZE + 2; i++) perm[i + SIZE] = perm[i % SIZE];

  // Hot path (pots and shards sample it a lot), so the lattice hashing is inlined.
  return function noise3(x, y, z) {
    const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
    let tx = x - xf, ty = y - yf, tz = z - zf;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    tz = tz * tz * (3 - 2 * tz);
    const X = xf & 255, Y = yf & 255, Z = zf & 255;
    const a0 = perm[X] + Y, a1 = perm[X + 1] + Y;
    const b00 = perm[a0] + Z, b10 = perm[a1] + Z, b01 = perm[a0 + 1] + Z, b11 = perm[a1 + 1] + Z;
    const c000 = values[perm[b00]], c100 = values[perm[b10]];
    const c010 = values[perm[b01]], c110 = values[perm[b11]];
    const c001 = values[perm[b00 + 1]], c101 = values[perm[b10 + 1]];
    const c011 = values[perm[b01 + 1]], c111 = values[perm[b11 + 1]];
    const x00 = c000 + (c100 - c000) * tx;
    const x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx;
    const x11 = c011 + (c111 - c011) * tx;
    const y0 = x00 + (x10 - x00) * ty;
    const y1 = x01 + (x11 - x01) * ty;
    return y0 + (y1 - y0) * tz;
  };
}

// Noise that wraps in u (0..1 around the pot) by sampling a cylinder.
// `freqU` is roughly how many bumps go around, `freqV` along the profile.
export function createPeriodicNoise(seed, octaves = 3) {
  const noise3 = createNoise3D(seed);
  return function periodic(u, v, freqU = 2, freqV = 2) {
    const a = u * Math.PI * 2;
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      const r = (freqU * f) / (Math.PI * 2) * 1.6;
      sum += amp * noise3(Math.cos(a) * r + o * 17.3, Math.sin(a) * r, v * freqV * f + o * 5.1);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

// 2D value noise that tiles with the given integer period, for seamless textures.
// Periods up to 256 are supported.
export function createTileableNoise2D(seed) {
  const rand = mulberry32(seed);
  const values = new Float32Array(256);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) {
    values[i] = rand() * 2 - 1;
    perm[i] = i;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (a, b) => values[perm[perm[a] + b]];

  return function tileable(x, y, period) {
    // Wrap lattice coordinates so the pattern repeats every `period` units.
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = smooth(x - xi), ty = smooth(y - yi);
    const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
    const y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
    return lerp(lerp(at(x0, y0), at(x1, y0), tx), lerp(at(x0, y1), at(x1, y1), tx), ty);
  };
}

// Fractal sum of tileable noise; base period doubles with each octave.
export function tileableFbm(tileable, x, y, period, octaves = 4) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileable(x * f, y * f, period * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
