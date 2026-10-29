// Voronoi on the pot's surface.
//
// The parameter domain is the intact pot's outer mesh grid in (u, v):
// columns run around the pot (u, periodic: column segU duplicates column 0),
// rows run from the base centre (v = 0, a single point) up to the rim.
// Each grid vertex is labelled with its nearest seed, measured in 3D, so
// cells are even in world space everywhere, including at the base centre,
// where a flat (u, v) chart would pinch every cell into a thin wedge.
// Per-seed noise on the distance makes the cracks wander.

import { createNoise3D, createRandom, hashSeed } from '../utils/random.js';

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Picks `count` seed vertices, spread evenly by area but denser near the impact.
export function pickSeeds({ positions, segU, segV, count, impact, seed }) {
  const rng = createRandom(hashSeed('seeds', seed));
  const stride = segU + 1;
  const P = (i, j, a) => positions[(j * stride + i) * 3 + a];

  // Area weight per vertex: ring radius × spacing along the profile.
  const weights = new Float64Array(stride * (segV + 1));
  let total = 0;
  let size = 0;
  for (let j = 0; j <= segV; j++) {
    const jb = Math.max(j - 1, 0), jd = Math.min(j + 1, segV);
    const ds = Math.hypot(P(0, jd, 0) - P(0, jb, 0), P(0, jd, 1) - P(0, jb, 1), P(0, jd, 2) - P(0, jb, 2)) / 2;
    for (let i = 0; i < segU; i++) {
      const r = Math.hypot(P(i, j, 0), P(i, j, 2));
      const w = (r * Math.PI * 2 * ds) / segU;
      weights[j * stride + i] = w;
      total += w;
      size = Math.max(size, r, P(i, j, 1));
    }
  }

  const sigma = 0.32 * size;
  const distToImpact = (k) => Math.hypot(positions[k * 3] - impact.x, positions[k * 3 + 1] - impact.y, positions[k * 3 + 2] - impact.z);
  const impactWeights = weights.map((w, k) => w * Math.exp(-(distToImpact(k) ** 2) / (2 * sigma * sigma)));
  const impactTotal = impactWeights.reduce((a, b) => a + b, 0);

  const sample = (ws, sum) => {
    let x = rng.next() * sum;
    for (let k = 0; k < ws.length; k++) {
      x -= ws[k];
      if (x <= 0 && ws[k] > 0) return k;
    }
    return 0;
  };

  // Smaller pieces near the impact: the spacing grows with distance from it.
  let r0 = 0.8 * Math.sqrt(total / count);
  const radiusAt = (k) => r0 * (0.45 + 0.55 * smoothstep(0, 2.2 * sigma, distToImpact(k)));
  const seeds = [];
  let attempts = 0;
  while (seeds.length < count && attempts < 6000) {
    attempts++;
    if (attempts % 600 === 0) r0 *= 0.85;
    const k = rng.next() < 0.45 ? sample(impactWeights, impactTotal) : sample(weights, total);
    const x = positions[k * 3], y = positions[k * 3 + 1], z = positions[k * 3 + 2];
    const rk = radiusAt(k);
    const clear = seeds.every((s) => Math.hypot(s.x - x, s.y - y, s.z - z) >= 0.5 * (rk + radiusAt(s.k)));
    if (clear) seeds.push({ k, x, y, z });
  }
  return seeds;
}

// Labels every grid vertex with its nearest seed, then tidies the result so
// each label is one connected piece of a reasonable size.
export function labelSurface({ positions, segU, segV, seeds, seed, minVertices = 14 }) {
  const stride = segU + 1;
  const V = stride * (segV + 1);
  const N = seeds.length;
  const noise = createNoise3D(hashSeed('crack-noise', seed));
  const rng = createRandom(hashSeed('crack-offsets', seed));
  const offsets = seeds.map(() => [rng.range(0, 100), rng.range(0, 100), rng.range(0, 100)]);

  const dist = new Float32Array(N * V);
  const labels = new Int16Array(V);
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i < segU; i++) {
      const k = j * stride + i;
      // The base centre is one point: copy the first vertex of row 0.
      if (j === 0 && i > 0) {
        for (let s = 0; s < N; s++) dist[s * V + k] = dist[s * V];
        labels[k] = labels[0];
        continue;
      }
      const x = positions[k * 3], y = positions[k * 3 + 1], z = positions[k * 3 + 2];
      let nearest = Infinity;
      for (let s = 0; s < N; s++) {
        const sd = seeds[s];
        const dx = x - sd.x, dy = y - sd.y, dz = z - sd.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        dist[s * V + k] = d;
        if (d < nearest) nearest = d;
      }
      // The wobble is at most ±23%, so only seeds within 1.6× the nearest can win.
      let best = 0, bestD = Infinity;
      for (let s = 0; s < N; s++) {
        let d = dist[s * V + k];
        if (d < nearest * 1.6 + 1e-3) {
          const [ox, oy, oz] = offsets[s];
          d *= 1 + 0.17 * noise(x * 5 + ox, y * 5 + oy, z * 5 + oz) + 0.06 * noise(x * 17 + oy, y * 17 + oz, z * 17 + ox);
          dist[s * V + k] = d;
        }
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      labels[k] = best;
    }
  }
  copySeam(labels, dist, N, V, segU, segV);

  // Islands and slivers: keep each label's largest connected region, give
  // the rest to their neighbours, and fold away labels that are too small.
  for (let pass = 0; pass < 4; pass++) {
    const changed = tidy(labels, segU, segV, minVertices);
    copySeam(labels, dist, N, V, segU, segV);
    if (!changed) break;
  }

  // Compact labels to 0..count-1.
  const used = [...new Set(labels)].sort((a, b) => a - b);
  const remap = new Map(used.map((l, idx) => [l, idx]));
  for (let k = 0; k < V; k++) labels[k] = remap.get(labels[k]);
  return { labels, dist, count: used.length, seedOf: used, vertexCount: V };
}

function copySeam(labels, dist, N, V, segU, segV) {
  const stride = segU + 1;
  for (let j = 0; j <= segV; j++) {
    const a = j * stride, b = a + segU;
    labels[b] = labels[a];
    for (let s = 0; s < N; s++) dist[s * V + b] = dist[s * V + a];
  }
}

// One pass of island removal. Returns true if anything was relabelled.
function tidy(labels, segU, segV, minVertices) {
  const stride = segU + 1;
  const comp = new Int32Array(labels.length).fill(-1);
  const comps = [];
  const neighbours = (k, out) => {
    const i = k % stride, j = (k - i) / stride;
    out.length = 0;
    out.push(j * stride + ((i + 1) % segU), j * stride + ((i + segU - 1) % segU));
    if (j > 0) out.push((j - 1) * stride + i);
    if (j < segV) out.push((j + 1) * stride + i);
    return out;
  };
  const nb = [];
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i < segU; i++) {
      const start = j * stride + i;
      if (comp[start] >= 0) continue;
      const label = labels[start];
      const id = comps.length;
      const members = [start];
      comp[start] = id;
      for (let h = 0; h < members.length; h++) {
        for (const n of neighbours(members[h], nb)) {
          if (comp[n] < 0 && labels[n] === label) {
            comp[n] = id;
            members.push(n);
          }
        }
      }
      comps.push({ label, members });
    }
  }

  const largest = new Map();
  for (const c of comps) {
    const prev = largest.get(c.label);
    if (!prev || c.members.length > prev.members.length) largest.set(c.label, c);
  }

  let changed = false;
  for (const c of comps) {
    const keep = largest.get(c.label) === c && c.members.length >= minVertices;
    if (keep) continue;
    // Hand the region to the neighbouring label it touches most.
    const votes = new Map();
    for (const m of c.members) {
      for (const n of neighbours(m, nb)) {
        if (labels[n] !== c.label) votes.set(labels[n], (votes.get(labels[n]) || 0) + 1);
      }
    }
    if (!votes.size) continue;
    const target = [...votes].sort((a, b) => b[1] - a[1])[0][0];
    for (const m of c.members) labels[m] = target;
    changed = true;
  }
  return changed;
}
