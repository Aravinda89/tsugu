import { describe, it, expect } from 'vitest';
import { SCALE, LOW, STABLE, composePhrase, composeArrival, pluckSamples } from '../src/music.js';
import { createRandom } from '../src/utils/random.js';

const allowed = new Set([...SCALE, ...LOW]);

describe('koto phrases', () => {
  it('are the same for the same seed', () => {
    const a = [1, 2, 3].map(() => composePhrase(createRandom(9)));
    expect(composePhrase(createRandom(9))).toEqual(a[0]);
    expect(composePhrase(createRandom(10))).not.toEqual(a[0]);
  });

  it('keep to the in scale, move forward in time, and come to rest on E or B', () => {
    const rng = createRandom(4);
    for (let n = 0; n < 200; n++) {
      const phrase = composePhrase(rng, { sparse: n % 2 === 0 });
      for (const note of phrase) expect(allowed.has(note.freq)).toBe(true);
      for (let k = 1; k < phrase.length; k++) expect(phrase[k].time).toBeGreaterThanOrEqual(phrase[k - 1].time);
      const last = phrase[phrase.length - 1];
      expect(STABLE.map((i) => SCALE[i])).toContain(last.freq);
    }
  });

  it('arrive with a sweep up the strings', () => {
    const notes = composeArrival(createRandom(2));
    for (const note of notes) expect(allowed.has(note.freq)).toBe(true);
    const sweep = notes.slice(0, -1).map((n) => n.freq);
    expect(sweep).toEqual([...sweep].sort((a, b) => a - b));
    expect(sweep.length).toBeGreaterThanOrEqual(9);
    expect(sweep[sweep.length - 1]).toBe(SCALE[10]); // lands on the high E
  });
});

describe('a plucked string', () => {
  const rms = (a, from, to) => Math.sqrt(a.slice(from, to).reduce((s, v) => s + v * v, 0) / (to - from));

  it('rings, then fades, and never clips', () => {
    const sr = 44100;
    for (const freq of [LOW[0], SCALE[0], SCALE[10]]) {
      const { samples, rate } = pluckSamples(freq, sr, 3);
      for (const v of samples) expect(Number.isFinite(v)).toBe(true);
      expect(samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThan(1);
      expect(rms(samples, 0, sr * 0.2)).toBeGreaterThan(5 * rms(samples, sr * 2.6, sr * 2.8));
      // The playback rate corrects the whole-sample period to the true pitch.
      expect(Math.abs(rate - 1)).toBeLessThan(0.02);
    }
  });
});
