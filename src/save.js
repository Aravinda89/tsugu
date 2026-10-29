// Save: the frame as a PNG, with the same haze and vignette as on screen and
// a small vermilion 継 seal (hanko) in the corner, as an artist signs a work.

import { createRandom, hashSeed } from './utils/random.js';

export async function savePNG({ renderer, scene, camera, filename, seed = 1 }) {
  try {
    await document.fonts.load('100px "Shippori Mincho"', '継');
  } catch {
    // A serif fallback is fine.
  }
  // Read the canvas right after rendering, before the browser clears it.
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const w = src.width, h = src.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);

  // Matches .glow and .vignette in style.css.
  ellipse(ctx, w, h, [0.52, 0.38, 0.46, 0.5], 'screen', [
    [0, 'rgba(64, 44, 30, 0.55)'],
    [0.55, 'rgba(40, 27, 18, 0.25)'],
    [1, 'rgba(0, 0, 0, 0)'],
  ]);
  ellipse(ctx, w, h, [0.5, 0.46, 0.78, 0.72], 'source-over', [
    [0, 'rgba(0, 0, 0, 0)'],
    [0.38, 'rgba(0, 0, 0, 0)'],
    [0.74, 'rgba(10, 6, 4, 0.5)'],
    [1, 'rgba(6, 4, 3, 0.86)'],
  ]);

  const size = Math.round(Math.min(w, h) * 0.075);
  const margin = Math.round(Math.min(w, h) * 0.045);
  drawHanko(ctx, w - margin - size, h - margin - size, size, seed);

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// An elliptical radial gradient over the whole canvas. at = [cx, cy, rx, ry] as fractions.
function ellipse(ctx, w, h, [cx, cy, rx, ry], op, stops) {
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.translate(cx * w, cy * h);
  ctx.scale(rx * w, ry * h);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(-cx / rx, -cy / ry, 1 / rx, 1 / ry);
  ctx.restore();
}

// Vermilion ink with the character cut out of it, a slightly uneven edge,
// and the small gaps of a real stamp.
function drawHanko(ctx, x, y, size, seed) {
  const rng = createRandom(hashSeed('hanko', seed));
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');

  const inset = size * 0.05;
  const r = size * 0.1;
  const j = () => rng.range(-1, 1) * size * 0.012;
  g.fillStyle = '#b3352b';
  g.beginPath();
  g.moveTo(inset + r + j(), inset + j());
  g.lineTo(size - inset - r + j(), inset + j());
  g.quadraticCurveTo(size - inset, inset, size - inset + j(), inset + r + j());
  g.lineTo(size - inset + j(), size - inset - r + j());
  g.quadraticCurveTo(size - inset, size - inset, size - inset - r + j(), size - inset + j());
  g.lineTo(inset + r + j(), size - inset + j());
  g.quadraticCurveTo(inset, size - inset, inset + j(), size - inset - r + j());
  g.lineTo(inset + j(), inset + r + j());
  g.quadraticCurveTo(inset, inset, inset + r + j(), inset + j());
  g.fill();

  g.globalCompositeOperation = 'destination-out';
  g.font = `${Math.round(size * 0.68)}px "Shippori Mincho", "Yu Mincho", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('継', size / 2, size * 0.53);
  for (let i = 0; i < 90; i++) {
    g.globalAlpha = rng.range(0.15, 0.6);
    g.beginPath();
    g.arc(rng.range(0, size), rng.range(0, size), rng.range(0.3, 1.4) * (size / 64), 0, Math.PI * 2);
    g.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.drawImage(c, x, y);
  ctx.restore();
}
