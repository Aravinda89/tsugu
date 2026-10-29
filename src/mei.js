// 銘 mei: treasured tea bowls are given poetic names. Each mended pot gets
// one, chosen by its seed: the kanji, its reading, and its English.

import { createRandom, hashSeed } from './utils/random.js';

export const MEI = [
  ['夕霧', 'ゆうぎり', 'evening mist'],
  ['山月', 'さんげつ', 'mountain moon'],
  ['初雪', 'はつゆき', 'first snow'],
  ['朝露', 'あさつゆ', 'morning dew'],
  ['時雨', 'しぐれ', 'late autumn rain'],
  ['残月', 'ざんげつ', 'moon at dawn'],
  ['春霞', 'はるがすみ', 'spring haze'],
  ['松風', 'まつかぜ', 'wind in the pines'],
  ['白露', 'しらつゆ', 'white dew'],
  ['落葉', 'おちば', 'fallen leaves'],
  ['夕凪', 'ゆうなぎ', 'evening calm'],
  ['星霜', 'せいそう', 'stars and frost'],
  ['水鏡', 'みずかがみ', 'water mirror'],
  ['野分', 'のわき', 'autumn gale'],
  ['雲間', 'くもま', 'a break in the clouds'],
  ['遠山', 'とおやま', 'distant mountains'],
  ['夜雨', 'よさめ', 'night rain'],
  ['薄氷', 'うすらい', 'thin ice'],
  ['月影', 'つきかげ', 'moonlight'],
  ['雪間', 'ゆきま', 'a gap in the snow'],
];

export function meiFor(seed) {
  const [kanji, reading, english] = createRandom(hashSeed('mei', seed)).pick(MEI);
  return { kanji, reading, english, line: `${kanji} · ${english}` };
}
