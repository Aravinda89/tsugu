// Music: a koto playing slow, sparse phrases in the in scale (miyako-bushi),
// with long rests between them (ma), and now and then a glass wind-bell
// (fūrin). All made live: each koto string is a Karplus–Strong pluck, worked
// out once into a buffer; every phrase is new, never a known tune.

import { createRandom, hashSeed, mulberry32 } from './utils/random.js';

// The in scale on E: E F A B C, two octaves, E3 to E5.
const E3 = 164.81;
const STEPS = [0, 1, 5, 7, 8]; // semitones above E
export const SCALE = [...[0, 1].flatMap((octave) => STEPS.map((s) => E3 * 2 ** (octave + s / 12))), E3 * 4];
// Open low strings, sounded under a phrase now and then.
export const LOW = [E3 / 2, (E3 / 2) * 2 ** (7 / 12)];
// Where a phrase comes to rest: E or B.
export const STABLE = [0, 3, 5, 8, 10];

const BEAT = 1; // seconds: about 60 bpm, unhurried

// One phrase: [{ freq, time, gain, bend }], times in seconds from its start;
// the player leaves a breath (ma) of a few seconds after each.
// The melody walks mostly by step, breathes unevenly, may push a string up a
// semitone after plucking it (oshide), and always ends on E or B.
export function composePhrase(rng, { sparse = false } = {}) {
  const notes = [];
  const length = rng.int(4, 7) - (sparse ? 1 : 0);
  let index = rng.pick([5, 6, 7, 8]);
  let time = 0;
  if (rng.next() < 0.35) notes.push({ freq: rng.pick(LOW), time: 0, gain: 0.16, bend: 0 });
  for (let k = 0; k < length; k++) {
    const last = k === length - 1;
    if (last) {
      // Settle on the nearest place of rest.
      index = STABLE.reduce((a, b) => (Math.abs(b - index) < Math.abs(a - index) ? b : a));
    } else if (k > 0) {
      index = Math.min(10, Math.max(0, index + rng.pick([-2, -1, -1, -1, 1, 1, 1, 2, 0])));
    }
    const bend = !last && rng.next() < 0.18 ? 1 : 0;
    notes.push({ freq: SCALE[index], time, gain: rng.range(0.15, 0.21) * (last ? 1.1 : 1), bend });
    // Uneven breath: mostly one beat, sometimes half or one and a half.
    time += BEAT * rng.pick([1, 1, 1, 0.5, 1.5, 2]) * rng.range(0.94, 1.06);
  }
  return notes;
}

// Sararin: a quick sweep up across the strings, landing on E, with the low E
// beneath it. For arrivals: when the gold is done.
export function composeArrival(rng) {
  const notes = [];
  const from = rng.pick([0, 1, 2]);
  let time = 0;
  for (let index = from; index <= 10; index++) {
    notes.push({ freq: SCALE[index], time, gain: 0.11 + 0.01 * (index - from), bend: 0 });
    time += rng.range(0.045, 0.06);
  }
  notes.push({ freq: LOW[0], time: time + 0.5, gain: 0.17, bend: 0 });
  return notes;
}

// A plucked silk string (Karplus–Strong): a burst of noise, shaped by where the
// string is plucked, circulating in a delay one period long and losing a little
// on each pass, the highs fastest. The delay is a whole number of samples, so
// the note sounds at sampleRate / period; the player corrects the pitch.
export function pluckSamples(freq, sampleRate, seconds = 3, seed = 1) {
  const period = Math.max(2, Math.round(sampleRate / freq));
  const rand = mulberry32(hashSeed('pluck', seed, period));
  const line = new Float32Array(period);
  let soft = 0, mean = 0;
  for (let i = 0; i < period; i++) {
    soft = 0.4 * soft + 0.6 * (rand() * 2 - 1);
    line[i] = soft;
  }
  // Plucked near the bridge (about a seventh of the string): bright and twangy.
  const at = Math.max(1, Math.round(period / 7));
  const shaped = line.map((v, i) => v - 0.6 * line[(i + period - at) % period]);
  for (const v of shaped) mean += v / period;
  for (let i = 0; i < period; i++) line[i] = shaped[i] - mean;

  // Rings for about 2.6 seconds (to -60 dB), whatever the pitch.
  const loss = Math.pow(0.001, 1 / ((sampleRate / period) * 2.6));
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  let k = 0;
  for (let i = 0; i < out.length; i++) {
    const a = line[k], b = line[(k + 1) % period];
    out[i] = a;
    line[k] = loss * (0.45 * a + 0.55 * b);
    k = (k + 1) % period;
  }
  // A soft end, so a note never clicks off.
  const fade = Math.floor(sampleRate * 0.15);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] *= 0.8 / (peak || 1);
  return { samples: out, rate: freq / (sampleRate / period) };
}

// A fūrin: thin glass, struck by its paper tail. Partials: [ratio, gain, decay s].
export const BELL = [
  [1, 1, 1.6],
  [2.32, 0.5, 0.9],
  [4.25, 0.3, 0.5],
  [6.8, 0.15, 0.3],
];

// Which steps have music: it rests while the pot falls and breaks, so the
// crack and the stillness after it have room.
const MOODS = {
  choose: 'play',
  lift: 'play',
  fall: 'rest',
  shatter: 'rest',
  still: 'rest',
  gather: 'sparse',
  gold: 'play',
  trace: 'play',
  keep: 'play',
};
const LEVEL = 0.6;

export function createMusic(ctx, out, seed = (Math.random() * 2 ** 32) >>> 0) {
  const rng = createRandom(hashSeed('music', seed));
  const level = ctx.createGain();
  level.gain.value = 0;
  level.connect(out);
  // The koto's wooden body: a little warmth low down, the top softened.
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 260;
  body.Q.value = 1.2;
  body.gain.value = 3;
  const air = ctx.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.value = 4200;
  body.connect(air).connect(level);

  const strings = new Map(); // freq → { buffer, rate }
  const string = (freq) => {
    if (!strings.has(freq)) {
      const { samples, rate } = pluckSamples(freq, ctx.sampleRate, 3, strings.size + 1);
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      strings.set(freq, { buffer, rate });
    }
    return strings.get(freq);
  };
  for (const freq of [...SCALE, ...LOW]) string(freq);

  const panned = (dest, pan) => {
    if (!ctx.createStereoPanner) return dest;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  };

  function pluck({ freq, gain, bend }, t) {
    const { buffer, rate } = string(freq);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(rate, t);
    if (bend) {
      // Oshide: the left hand presses the string past its bridge, a semitone up, then lets go.
      src.playbackRate.setValueAtTime(rate, t + 0.09);
      src.playbackRate.linearRampToValueAtTime(rate * 2 ** (bend / 12), t + 0.22);
      src.playbackRate.setTargetAtTime(rate, t + 0.75, 0.12);
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    // Seated at the koto: low strings a little to the left, high to the right.
    const pan = Math.max(-0.35, Math.min(0.35, Math.log2(freq / SCALE[5]) * 0.3));
    src.connect(g).connect(panned(body, pan));
    src.start(t);
    src.stop(t + buffer.duration / Math.max(rate, 0.5));
  }

  function bell(freq, t, gain) {
    const dest = panned(level, rng.range(-0.6, 0.6));
    for (const [ratio, g, decay] of BELL) {
      // Two voices a hair apart, for the shimmer of thin glass.
      for (const detune of [1, 1.004]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq * ratio * detune;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gain * g * 0.5, t + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        osc.connect(env).connect(dest);
        osc.start(t);
        osc.stop(t + decay + 0.05);
      }
    }
  }

  let mode = 'rest';
  let phraseTimer = 0;
  let bellTimer = 0;

  const playing = () => mode !== 'rest' && ctx.state === 'running';

  function play(notes, delay = 0.1) {
    const t0 = ctx.currentTime + delay;
    for (const n of notes) pluck(n, t0 + n.time);
    return delay + notes[notes.length - 1].time;
  }

  function nextPhrase(seconds) {
    clearTimeout(phraseTimer);
    phraseTimer = setTimeout(phrase, seconds * 1000);
  }

  function phrase() {
    if (mode === 'rest') return;
    if (!playing()) return nextPhrase(2);
    const sparse = mode === 'sparse';
    const end = play(composePhrase(rng, { sparse }));
    // Then ma: a long breath before the next.
    nextPhrase(end + (sparse ? rng.range(4, 7) : rng.range(2, 4.5)));
  }

  function wind() {
    if (playing()) {
      const t = ctx.currentTime + 0.05;
      const base = rng.range(2100, 2700);
      for (let i = 0, n = rng.int(1, 3); i < n; i++) {
        bell(base * rng.pick([1, 1.015, 0.985]), t + i * rng.range(0.12, 0.35), rng.range(0.03, 0.05));
      }
    }
    bellTimer = setTimeout(wind, rng.range(10000, 25000));
  }
  bellTimer = setTimeout(wind, rng.range(6000, 12000));

  return {
    // Follows the visitor's step (see MOODS).
    mood(step) {
      const next = MOODS[step] ?? 'play';
      if (next === mode) return;
      const wasResting = mode === 'rest';
      mode = next;
      if (mode === 'rest') {
        clearTimeout(phraseTimer);
        level.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
        return;
      }
      level.gain.setTargetAtTime(LEVEL, ctx.currentTime, 1.2);
      if (wasResting) nextPhrase(rng.range(1.5, 3));
    },

    // A sweep up the strings once the bell has spoken, then quiet again.
    arrive(delay = 2.4) {
      if (mode === 'rest') return;
      const end = play(composeArrival(rng), delay);
      nextPhrase(end + rng.range(6, 9));
    },

    dispose() {
      clearTimeout(phraseTimer);
      clearTimeout(bellTimer);
    },
  };
}
