// Sound, made live with Web Audio: no files. A quiet room (soft rain, a
// water-drip chime now and then), the clay's crack, ceramic clinks, a
// knock as the pot is set down, and one rin bell when the gold is done.
// Browsers only allow sound after a gesture, so it starts on the first touch.

const MUTE_KEY = 'tsugu.muted';
const LEVEL = 0.9;

let ctx = null;
let master = null;
let reverb = null;
let noise = null;
let lastClink = 0;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

const rand = (a, b) => a + Math.random() * (b - a);

function start() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : LEVEL;
  master.connect(comp).connect(ctx.destination);

  // A small room: a generated, gently decaying reverb tail.
  reverb = ctx.createConvolver();
  reverb.buffer = impulse(2.6, 3);
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  reverb.connect(wet).connect(master);

  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
  ambience();
}

function impulse(seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

// An output with a little (or a lot) of the room in it.
function bus(dry = 1, wet = 0.4) {
  const g = ctx.createGain();
  g.gain.value = dry;
  g.connect(master);
  const send = ctx.createGain();
  send.gain.value = wet;
  g.connect(send).connect(reverb);
  return g;
}

function tone(freq, t, decay, gain, dest, { glideFrom } = {}) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(glideFrom ?? freq, t);
  if (glideFrom) osc.frequency.exponentialRampToValueAtTime(freq, t + Math.min(0.06, decay * 0.3));
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(env).connect(dest);
  osc.start(t);
  osc.stop(t + decay + 0.05);
}

function hiss(t, duration, type, freq, q, gain, dest) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(env).connect(dest);
  src.start(t, Math.random());
  src.stop(t + duration + 0.05);
}

// Soft rain, and a water-drip chime (suikinkutsu) every so often.
function ambience() {
  const rain = ctx.createBufferSource();
  rain.buffer = noise;
  rain.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 380;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0, ctx.currentTime);
  level.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 4);
  rain.connect(hp).connect(lp).connect(level).connect(bus(1, 0.25));
  rain.start();

  const notes = [523, 587, 659, 784, 880, 1047];
  const drip = () => {
    if (ctx.state === 'running') {
      const f = notes[Math.floor(Math.random() * notes.length)] * rand(0.78, 0.82);
      tone(f, ctx.currentTime, 1.4, 0.05, bus(0.35, 1), { glideFrom: f * 1.7 });
    }
    setTimeout(drip, rand(6000, 14000));
  };
  setTimeout(drip, rand(3000, 7000));
}

export const audio = {
  // Call from a user gesture; the first call starts the sound.
  unlock() {
    if (!ctx) start();
    else if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  },

  get muted() {
    return muted;
  },

  // 'off' until the first gesture, then the AudioContext's state.
  get state() {
    return ctx ? ctx.state : 'off';
  },

  get level() {
    return master ? master.gain.value : 0;
  },

  toggleMute() {
    muted = !muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Not remembered this time.
    }
    if (master) master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.1);
    return muted;
  },

  // The pot breaks. strength: 0..1
  impact(strength) {
    navigator.vibrate?.(Math.round(18 + 30 * strength));
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = bus(1, 0.35);
    hiss(t, 0.14, 'bandpass', 2200, 0.8, 0.5 + 0.4 * strength, out);
    tone(48, t, 0.3, 0.5, out, { glideFrom: 120 });
    // The scatter of fragments: short, bright ceramic partials.
    for (let i = 0; i < 12; i++) {
      tone(rand(1800, 5200), t + rand(0, 0.2), rand(0.05, 0.25), rand(0.03, 0.09) * (0.5 + strength), out);
    }
  },

  // Fired clay touching fired clay. strength: 0..1
  clink(strength = 0.5) {
    if (!ctx) return;
    const now = performance.now();
    if (now - lastClink < 60) return;
    lastClink = now;
    const t = ctx.currentTime;
    const f = rand(1400, 2600);
    const out = bus(1, 0.3);
    const parts = [[1, 1, 0.55], [2.76, 0.5, 0.3], [5.4, 0.25, 0.18], [8.93, 0.12, 0.1]];
    for (const [ratio, g, decay] of parts) tone(f * ratio, t, decay, 0.11 * g * strength, out);
  },

  // A piece arrives home: a small, bright click into place.
  home() {
    this.clink(0.35);
  },

  // The mended pot is set down on its stand.
  settle() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = bus(1, 0.3);
    tone(120, t, 0.35, 0.3, out, { glideFrom: 190 });
    hiss(t, 0.08, 'lowpass', 500, 0.7, 0.2, out);
  },

  // One rin bell when the gold is complete.
  rin() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = bus(0.8, 0.9);
    const f = 520;
    for (const [ratio, g, decay] of [[1, 0.2, 8], [2.71, 0.09, 5], [5.15, 0.045, 3], [8.3, 0.025, 2]]) {
      // Two slightly detuned voices per partial, for the bell's slow beating.
      tone(f * ratio, t, decay, g, out);
      tone(f * ratio * 1.0035, t, decay * 0.9, g * 0.7, out);
    }
  },
};
