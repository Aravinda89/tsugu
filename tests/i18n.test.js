import { describe, it, expect } from 'vitest';
import { STRINGS, meiLine } from '../src/i18n.js';
import { MEI, meiFor } from '../src/mei.js';
import { PROFILES, PROFILE_ORDER } from '../src/pot/profiles.js';

// Every leaf key path, e.g. "hints.touch.gather".
function paths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? paths(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function leaf(obj, path) {
  return path.split('.').reduce((o, k) => o[k], obj);
}

describe('English and Japanese', () => {
  it('have the same keys', () => {
    expect(paths(STRINGS.ja).sort()).toEqual(paths(STRINGS.en).sort());
  });

  it('have no empty strings', () => {
    for (const lang of ['en', 'ja']) {
      for (const p of paths(STRINGS[lang])) expect(String(leaf(STRINGS[lang], p)).trim().length).toBeGreaterThan(0);
    }
  });

  it('name every pot', () => {
    for (const lang of ['en', 'ja']) {
      for (const type of PROFILE_ORDER) {
        expect(STRINGS[lang].pots[type]).toBeTruthy();
        expect(PROFILES[type].kanji).toMatch(/^[一-鿿]+$/);
      }
    }
  });

  it('give a hint for every step with a prompt, for touch and mouse', () => {
    for (const lang of ['en', 'ja']) {
      for (const step of [...Object.keys(STRINGS[lang].prompts), 'keep']) {
        expect(STRINGS[lang].hints.touch[step]).toBeTruthy();
        expect(STRINGS[lang].hints.mouse[step]).toBeTruthy();
      }
    }
  });
});

describe('mei', () => {
  it('every name has a reading in hiragana and an English meaning', () => {
    for (const [kanji, reading, english] of MEI) {
      expect(kanji).toMatch(/^[一-鿿]{2}$/);
      expect(reading).toMatch(/^[぀-ゟ]+$/);
      expect(english.length).toBeGreaterThan(2);
    }
  });

  it('reads in either language', () => {
    const m = meiFor(42);
    expect(meiLine('en', m)).toBe(`${m.kanji} · ${m.english}`);
    expect(meiLine('ja', m)).toBe(`${m.kanji} · ${m.reading}`);
  });
});
