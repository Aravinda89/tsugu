// A small tween helper. Tweens are driven by `updateTweens(now)` from the
// render loop and resolve a promise when they finish.

export const ease = {
  linear: (t) => t,
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // 序破急 jo-ha-kyū: a slow beginning, a steady build, a quick settle.
  // Warping time before a sine ease gives a long, patient start and a
  // compressed (but still smooth) arrival.
  joHaKyu: (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.pow(t, 1.8)),
};

const active = new Set();

export function tween({ duration = 1, delay = 0, easing = ease.inOutSine, onUpdate, onComplete } = {}) {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  const t = {
    start: null,
    duration: Math.max(duration, 1e-6) * 1000,
    delay: delay * 1000,
    easing,
    onUpdate,
    onComplete,
    resolve,
    cancelled: false,
  };
  active.add(t);
  promise.cancel = () => {
    t.cancelled = true;
    active.delete(t);
  };
  return promise;
}

export function updateTweens(now) {
  for (const t of active) {
    if (t.start === null) t.start = now + t.delay;
    if (now < t.start) continue;
    const p = Math.min((now - t.start) / t.duration, 1);
    t.onUpdate?.(t.easing(p), p);
    if (p >= 1) {
      active.delete(t);
      t.onComplete?.();
      t.resolve();
    }
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
