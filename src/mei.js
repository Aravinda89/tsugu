// 銘 mei: treasured tea bowls are given poetic names. Each mended pot gets
// one, chosen by its seed. Kanji here must also be in the Shippori Mincho
// font subset (the `text=` list in index.html).

import { createRandom, hashSeed } from './utils/random.js';

export const MEI = [
  ['夕霧', 'evening mist'],
  ['山月', 'mountain moon'],
  ['初雪', 'first snow'],
  ['朝露', 'morning dew'],
  ['時雨', 'late autumn rain'],
  ['残月', 'moon at dawn'],
  ['春霞', 'spring haze'],
  ['松風', 'wind in the pines'],
  ['白露', 'white dew'],
  ['落葉', 'fallen leaves'],
  ['夕凪', 'evening calm'],
  ['星霜', 'stars and frost'],
  ['水鏡', 'water mirror'],
  ['野分', 'autumn gale'],
  ['雲間', 'a break in the clouds'],
  ['遠山', 'distant mountains'],
  ['夜雨', 'night rain'],
  ['薄氷', 'thin ice'],
  ['月影', 'moonlight'],
  ['雪間', 'a gap in the snow'],
];

export function meiFor(seed) {
  const [kanji, english] = createRandom(hashSeed('mei', seed)).pick(MEI);
  return { kanji, english, line: `${kanji} · ${english}` };
}
