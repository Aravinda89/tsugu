// English and Japanese. Every key exists in both (checked in tests).
// The language follows the browser until the visitor picks one; the choice
// is remembered on this device.

export const STRINGS = {
  en: {
    name: 'English',
    subtitle: 'Tsugu · mend & carry on',
    prompts: {
      choose: 'Choose a pot',
      lift: 'Lift the pot',
      gather: 'Gather the pieces',
      trace: 'Trace the gold',
    },
    // One plain line per step on what it means, for anyone new to kintsugi;
    // `closing` is the meaning of the whole ritual, last of all in Keep.
    meanings: {
      choose: 'Wabi-sabi: finding beauty in what is imperfect.',
      lift: 'Everything that is made will one day break.',
      still: 'A break is not the end of its story.',
      gather: 'Kintsugi: nothing is thrown away. Every piece returns.',
      gold: 'Lacquer joins the pieces. Gold fills what was lost.',
      trace: 'The gold does not hide the cracks. It makes them shine.',
      keep: 'Its cracks are now part of its story, and its beauty.',
      closing: 'We all break sometimes. Mended with care, we carry on.',
    },
    hints: {
      touch: {
        choose: 'Tap a pot to choose it',
        lift: 'Press on the pot, slide your finger up, then let go',
        gather: 'Tap a piece to send it home · drag to look around · pinch to zoom',
        trace: 'Draw along the dark lines · drag beside the pot to turn · ✦ gilds the rest · ✓ done',
        keep: 'Drag to look around · ↓ saves a picture · ↺ begins again',
      },
      mouse: {
        choose: 'Click a pot to choose it',
        lift: 'Press on the pot, drag upwards, then let go',
        gather: 'Click a piece to send it home · drag to look around · scroll to zoom',
        trace: 'Draw along the dark lines · right-drag to turn · scroll to zoom · ✦ gilds the rest · ✓ done',
        keep: 'Drag to look around · scroll to zoom · ↓ saves a picture · ↺ begins again',
      },
    },
    labels: {
      save: 'Save',
      again: 'Again',
      gild: 'Gild the rest',
      done: 'Done',
      closer: 'Closer',
      further: 'Further',
      turnLeft: 'Turn left',
      turnRight: 'Turn right',
      recentre: 'Recentre',
      soundOn: 'Sound on',
      soundOff: 'Sound off',
    },
    // Under each stand while choosing, beneath the kanji.
    pots: {
      tokkuri: 'sake flask',
      tsubo: 'storage jar',
      chawan: 'tea bowl',
    },
  },

  ja: {
    name: '日本語',
    subtitle: 'つぐ · 繕い、受け継ぐ',
    prompts: {
      choose: '器をえらぶ',
      lift: '器を持ち上げる',
      gather: 'かけらを集める',
      trace: '金をなぞる',
    },
    meanings: {
      choose: 'わびさび ― 不完全なものに美を見いだす心。',
      lift: '形あるものは、いつか壊れる。',
      still: '割れても、物語は終わらない。',
      gather: '金継ぎ ― 何も捨てない。かけらはみな元の場所へ。',
      gold: '漆でつなぎ、失われたところは金で満たす。',
      trace: '金はひびを隠さない。ひびを輝かせる。',
      keep: 'ひびは今、この器の物語となり、美しさとなった。',
      closing: '人もまた、ときに割れる。ていねいに繕い、また歩いていく。',
    },
    hints: {
      touch: {
        choose: '器をタップして選びます',
        lift: '器に触れたまま指を上へ。はなすと落ちます',
        gather: 'かけらをタップすると元の場所へ · ドラッグで見回す · ピンチで拡大',
        trace: '黒い線をなぞる · 器の外をドラッグで回す · ✦ 残りを金に · ✓ 完成',
        keep: 'ドラッグで見回す · ↓ 画像を保存 · ↺ もう一度',
      },
      mouse: {
        choose: '器をクリックして選びます',
        lift: '器を押したまま上へドラッグ。はなすと落ちます',
        gather: 'かけらをクリックすると元の場所へ · ドラッグで見回す · ホイールで拡大',
        trace: '黒い線をなぞる · 右ドラッグで回す · ホイールで拡大 · ✦ 残りを金に · ✓ 完成',
        keep: 'ドラッグで見回す · ホイールで拡大 · ↓ 画像を保存 · ↺ もう一度',
      },
    },
    labels: {
      save: '保存',
      again: 'もう一度',
      gild: '残りを金に',
      done: '完成',
      closer: '近づく',
      further: '離れる',
      turnLeft: '左へ回す',
      turnRight: '右へ回す',
      recentre: '元の位置へ',
      soundOn: '音あり',
      soundOff: '音なし',
    },
    pots: {
      tokkuri: 'とっくり',
      tsubo: 'つぼ',
      chawan: 'ちゃわん',
    },
  },
};

const KEY = 'tsugu.lang';

export function getLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && STRINGS[saved]) return saved;
  } catch {
    // Storage may be blocked; fall back to the browser's language.
  }
  return (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function saveLang(lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Not remembered this time; still switches.
  }
}

// The Keep line: the mei with its English, or with its reading in Japanese.
export function meiLine(lang, mei) {
  return lang === 'ja' ? `${mei.kanji} · ${mei.reading}` : `${mei.kanji} · ${mei.english}`;
}
