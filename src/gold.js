// Gold seams: thin raised ribbons along every crack, outside, inside and
// across the lip, with a slightly irregular width like hand-laid lacquer.
//
// The reveal follows the craft in two stages: dark urushi lacquer flows
// along each crack first, then gold dust settles onto it and it turns gold,
// grain by grain, with a brief glint as it catches.

import * as THREE from 'three';
import { createNoise3D, createRandom, hashSeed } from './utils/random.js';

const BASE_WIDTH = 0.0095;
// Deeper than textbook gold: the thin bead is mostly highlight, and a paler
// colour reads as white once tone-mapped.
const GOLD = new THREE.Color(0.8, 0.46, 0.09);
const LIFT = 0.0011; // off the surface, so it never flickers into the clay
const BEAD = 0.0011; // the lacquer stands a little proud along its centre

// Builds one geometry for all crack lines. Pure (no DOM), so it is testable.
export function buildGoldGeometry(cracks, seed = 1) {
  const noise = createNoise3D(hashSeed('gold-width', seed));
  const rng = createRandom(hashSeed('gold-grain', seed));
  const P = [], N = [], ARC = [], GRAIN = [], I = [];

  const lines = [...cracks.outer, ...cracks.inner, ...cracks.rim];
  lines.forEach((line, lineIndex) => {
    const pts = smooth(line.points);
    const nrm = smooth(line.normals, true);
    const count = pts.length / 3;
    if (count < 2) return;

    // Arc length along the line, for the flow and for the width wobble.
    const arc = new Float32Array(count);
    for (let k = 1; k < count; k++) {
      arc[k] = arc[k - 1] + Math.hypot(pts[k * 3] - pts[k * 3 - 3], pts[k * 3 + 1] - pts[k * 3 - 2], pts[k * 3 + 2] - pts[k * 3 - 1]);
    }
    const length = arc[count - 1] || 1;

    const p = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3();
    const a = new THREE.Vector3(), c = new THREE.Vector3();
    const base = P.length / 3;
    for (let k = 0; k < count; k++) {
      p.fromArray(pts, k * 3);
      n.fromArray(nrm, k * 3).normalize();
      a.fromArray(pts, Math.max(k - 1, 0) * 3);
      c.fromArray(pts, Math.min(k + 1, count - 1) * 3);
      t.subVectors(c, a);
      t.addScaledVector(n, -t.dot(n)).normalize(); // keep the tangent on the surface
      b.crossVectors(n, t);
      if (b.lengthSq() < 1e-10) b.set(1, 0, 0);
      b.normalize();

      // Irregular width, a little fuller where cracks meet or end.
      const fromEnd = Math.min(arc[k], length - arc[k]);
      const n1 = noise(arc[k] * 30, lineIndex * 7.3, seed % 97);
      const n2 = noise(arc[k] * 110, lineIndex * 3.1, 11.7);
      const wobble = 0.6 + 0.8 * (0.5 + 0.5 * (0.75 * n1 + 0.25 * n2));
      const pool = 1 + 0.8 * Math.exp(-fromEnd / 0.014);
      const half = (BASE_WIDTH * wobble * pool) / 2;

      // Cross-section: edge, raised centre, edge.
      for (const [side, raise, tilt] of [[1, LIFT, 0.85], [0, LIFT + BEAD, 0], [-1, LIFT, -0.85]]) {
        P.push(p.x + b.x * half * side + n.x * raise, p.y + b.y * half * side + n.y * raise, p.z + b.z * half * side + n.z * raise);
        const nx = n.x + b.x * tilt, ny = n.y + b.y * tilt, nz = n.z + b.z * tilt;
        const l = Math.hypot(nx, ny, nz);
        N.push(nx / l, ny / l, nz / l);
        ARC.push(arc[k] / length);
        GRAIN.push(rng.next());
      }
    }
    // Faces wound so they face along the surface normal.
    for (let k = 0; k < count - 1; k++) {
      const l0 = base + k * 3, c0 = l0 + 1, r0 = l0 + 2;
      const l1 = l0 + 3, c1 = l1 + 1, r1 = l1 + 2;
      I.push(l0, c0, l1, c0, c1, l1, c0, r0, c1, r0, r1, c1);
    }
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aArc', new THREE.Float32BufferAttribute(ARC, 1));
  g.setAttribute('aGrain', new THREE.Float32BufferAttribute(GRAIN, 1));
  // How much gold the visitor has laid here (0..1), painted while tracing.
  const traced = new THREE.Float32BufferAttribute(new Float32Array(ARC.length), 1);
  traced.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aGold', traced);
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

// One light pass of smoothing: the crack keeps its course, minus the grid's jitter.
function smooth(arr, normalise = false) {
  const count = arr.length / 3;
  const out = new Float32Array(arr);
  for (let k = 1; k < count - 1; k++) {
    for (let x = 0; x < 3; x++) out[k * 3 + x] = 0.25 * arr[k * 3 - 3 + x] + 0.5 * arr[k * 3 + x] + 0.25 * arr[k * 3 + 3 + x];
    if (normalise) {
      const l = Math.hypot(out[k * 3], out[k * 3 + 1], out[k * 3 + 2]) || 1;
      for (let x = 0; x < 3; x++) out[k * 3 + x] /= l;
    }
  }
  return out;
}

// Closest point on any crack line to `p` (pot-local), and how far away it is.
export function nearestOnCracks(cracks, p, out = new THREE.Vector3()) {
  let best = Infinity;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3(), ab = new THREE.Vector3();
  for (const line of [...cracks.outer, ...cracks.inner, ...cracks.rim]) {
    const pts = line.points;
    for (let k = 0; k + 5 < pts.length; k += 3) {
      a.fromArray(pts, k);
      b.fromArray(pts, k + 3);
      ab.subVectors(b, a);
      const len2 = ab.lengthSq() || 1e-12;
      const t = Math.min(Math.max(q.subVectors(p, a).dot(ab) / len2, 0), 1);
      q.copy(a).addScaledVector(ab, t);
      const d = q.distanceTo(p);
      if (d < best) {
        best = d;
        out.copy(q);
      }
    }
  }
  return { point: out, distance: best };
}

// Lacquer-to-gold material. uFlow (0..1) is how far the lacquer has run
// along each crack; uGild (0..1) is the automatic reveal; the aGold
// attribute is gold the visitor has traced. Either one gilds.
export function createGoldMaterial(envMap) {
  const uniforms = { uFlow: { value: 0 }, uGild: { value: 0 } };
  const material = new THREE.MeshPhysicalMaterial({
    color: GOLD,
    metalness: 1,
    roughness: 0.3,
    envMap,
    envMapIntensity: 0.6,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'attribute float aArc;\nattribute float aGrain;\nattribute float aGold;\nvarying float vArc;\nvarying float vGrain;\nvarying float vGold;\nvoid main() {\n  vArc = aArc;\n  vGrain = aGrain;\n  vGold = aGold;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uFlow;
uniform float uGild;
varying float vArc;
varying float vGrain;
varying float vGold;
const vec3 URUSHI = vec3(0.07, 0.02, 0.014);
float gilded() {
  // Gold dust lands unevenly: each grain catches at its own moment,
  // whether it is laid by the visitor's stroke or by the reveal.
  float reveal = smoothstep(0.0, 0.1, uGild * 1.3 - (vArc * 0.5 + vGrain * 0.5));
  float traced = smoothstep(vGrain * 0.45, vGrain * 0.45 + 0.3, vGold);
  return max(reveal, traced);
}
void main() {
  if (vArc > uFlow) discard;`,
      )
      // The gold's colour is the material colour, so it can be tuned.
      .replace('#include <color_fragment>', '#include <color_fragment>\n  float g = gilded();\n  vec3 gold = diffuseColor.rgb;\n  diffuseColor.rgb = mix(URUSHI, gold, g);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.42, roughnessFactor, g);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(0.0, 1.0, g);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += gold * g * (1.0 - g) * 0.9;')
      // Wet lacquer only glints; the room's reflection belongs to the gold.
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  radiance *= mix(0.08, 1.0, g);');
  };
  material.userData.uniforms = uniforms;
  return material;
}

// The lost piece's place, filled with solid gold: the piece's own shape,
// laid over the intact clay. uShow brings in the lacquer; uFill turns it to
// gold, grain by grain, like the seams.
export function createGoldPatch(geometry, { envMap }) {
  const uniforms = { uShow: { value: 0 }, uFill: { value: 0 } };
  const material = new THREE.MeshPhysicalMaterial({
    color: GOLD,
    metalness: 1,
    roughness: 0.34,
    envMap,
    envMapIntensity: 0.6,
    transparent: true,
    polygonOffset: true, // wins over the clay surface it lies on
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'varying float vGrain;\nvoid main() {\n  vGrain = fract(sin(dot(position, vec3(127.1, 311.7, 74.7)) * 97.0) * 43758.5453);',
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform float uShow;\nuniform float uFill;\nvarying float vGrain;\nconst vec3 URUSHI = vec3(0.07, 0.02, 0.014);\nvoid main() {',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  float g = smoothstep(vGrain * 0.5, vGrain * 0.5 + 0.4, uFill * 1.4);\n  vec3 gold = diffuseColor.rgb;\n  diffuseColor.rgb = mix(URUSHI, gold, g);\n  diffuseColor.a *= uShow;',
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.42, roughnessFactor, g);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = g;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += gold * g * (1.0 - g) * 0.9;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  radiance *= mix(0.08, 1.0, g);');
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'gold-patch';
  mesh.receiveShadow = true;
  return {
    mesh,
    set show(v) {
      uniforms.uShow.value = v;
    },
    set fill(v) {
      uniforms.uFill.value = v;
    },
    dispose: () => material.dispose(),
  };
}

export function createGold(cracks, { envMap, seed }) {
  const geometry = buildGoldGeometry(cracks, seed);
  const material = createGoldMaterial(envMap);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'gold';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const { uFlow, uGild } = material.userData.uniforms;
  const pos = geometry.attributes.position.array;
  const traced = geometry.attributes.aGold;
  const strokes = [];
  return {
    mesh,
    // 0..1 each; set from the reveal tween.
    set flow(v) {
      uFlow.value = v;
    },
    set gild(v) {
      uGild.value = v;
    },
    nearest: (p, out) => nearestOnCracks(cracks, p, out),

    // Lays gold around a point on a crack (pot-local), softer at the edge.
    paint(p, radius, strength) {
      const r2 = radius * radius;
      let changed = false;
      for (let v = 0; v < traced.count; v++) {
        const dx = pos[v * 3] - p.x, dy = pos[v * 3 + 1] - p.y, dz = pos[v * 3 + 2] - p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) continue;
        const f = 1 - Math.sqrt(d2) / radius;
        traced.array[v] = Math.min(1, traced.array[v] + strength * f * f);
        changed = true;
      }
      if (changed) traced.needsUpdate = true;
      return changed;
    },

    // Share of the seams that has taken gold from tracing.
    coverage() {
      let done = 0;
      for (let v = 0; v < traced.count; v++) if (traced.array[v] > 0.55) done++;
      return done / (traced.count || 1);
    },

    // The visitor's strokes (snapped, pot-local), kept for the shared shelf.
    strokes,

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
