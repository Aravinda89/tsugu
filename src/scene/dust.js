// A few motes of dust drifting slowly through the light: 間 ma, the pause.
// They only glow while inside the key light's cone.

import * as THREE from 'three';
import { createRandom, hashSeed } from '../utils/random.js';

const COUNT = 70;

export function createDust(light) {
  const rng = createRandom(hashSeed('dust'));
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  const sizes = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = rng.range(-2.4, 2.4);
    positions[i * 3 + 1] = rng.range(0.15, 2.8);
    positions[i * 3 + 2] = rng.range(-1.6, 2.2);
    seeds[i] = rng.next();
    sizes[i] = rng.range(1.5, 4.2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const lightDir = new THREE.Vector3().subVectors(light.target.position, light.position).normalize();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uPixelRatio: { value: 1 },
      uLightPos: { value: light.position.clone() },
      uLightDir: { value: lightDir },
      uCos: { value: Math.cos(light.angle * 0.92) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec3 uLightPos;
      uniform vec3 uLightDir;
      uniform float uCos;
      attribute float aSeed;
      attribute float aSize;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * 0.06 + aSeed * 40.0;
        p.x += sin(t * 1.3 + aSeed * 6.0) * 0.18;
        p.z += cos(t * 1.1 + aSeed * 4.0) * 0.18;
        p.y = mod(p.y - uTime * 0.01 * (0.4 + aSeed) - 0.15, 2.65) + 0.15;
        float inBeam = smoothstep(uCos, uCos + 0.05, dot(normalize(p - uLightPos), uLightDir));
        float twinkle = 0.55 + 0.45 * sin(uTime * (0.3 + aSeed * 0.5) + aSeed * 20.0);
        vAlpha = inBeam * twinkle * (0.25 + 0.75 * fract(aSeed * 7.31));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uPixelRatio * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity * 0.55;
        gl_FragColor = vec4(vec3(1.0, 0.84, 0.62), a);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update(seconds, pixelRatio) {
      material.uniforms.uTime.value = seconds;
      material.uniforms.uPixelRatio.value = pixelRatio;
    },
  };
}
