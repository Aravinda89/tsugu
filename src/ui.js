// Minimal prompts and buttons: per step, one plain line on what it means,
// one short line and one how-to; icon-only pills. Labels come from `label(key)` so they follow the language.

const ICONS = {
  // An ensō left open, with a small turn: begin again.
  again: '<svg viewBox="0 0 16 16"><path d="M13.2 6.2A5.5 5.5 0 1 0 13.4 10" /><path d="M13.6 3.2v3.2h-3.2" /></svg>',
  save: '<svg viewBox="0 0 16 16"><path d="M8 2.5v8" /><path d="M4.8 7.5 8 10.7l3.2-3.2" /><path d="M3 13.5h10" /></svg>',
  // A four-point glint: let the gold take the rest.
  gild: '<svg viewBox="0 0 16 16"><path d="M8 1.8c.5 3.2 1.4 4.6 4.2 6.2-2.8 1.6-3.7 3-4.2 6.2-.5-3.2-1.4-4.6-4.2-6.2C6.6 6.4 7.5 5 8 1.8Z" /></svg>',
  done: '<svg viewBox="0 0 16 16"><path d="M3 8.6 6.4 12 13 4.6" /></svg>',
  zoomIn: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>',
  zoomOut: '<svg viewBox="0 0 16 16"><path d="M3 8h10" /></svg>',
  recentre: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" /><circle cx="8" cy="8" r="1.2" /></svg>',
  // Arcs with an arrowhead: walk around the pot.
  turnLeft: '<svg viewBox="0 0 16 16"><path d="M13 9.5C12 12 10.2 13 8 13 5 13 3 10.8 3 8" /><path d="M1.2 9.6 3 7.6l1.9 2" /><path d="M5 4.2C5.9 3.4 6.9 3 8 3c1.6 0 3 .7 3.9 1.9" /></svg>',
  turnRight: '<svg viewBox="0 0 16 16"><path d="M3 9.5C4 12 5.8 13 8 13c3 0 5-2.2 5-5" /><path d="M14.8 9.6 13 7.6l-1.9 2" /><path d="M11 4.2C10.1 3.4 9.1 3 8 3 6.4 3 5 3.7 4.1 4.9" /></svg>',
  soundOn: '<svg viewBox="0 0 16 16"><path d="M2.5 6h2.6L8.6 3v10L5.1 10H2.5z" /><path d="M10.8 5.6a3.4 3.4 0 0 1 0 4.8" /><path d="M12.6 3.8a6 6 0 0 1 0 8.4" /></svg>',
  soundOff: '<svg viewBox="0 0 16 16"><path d="M2.5 6h2.6L8.6 3v10L5.1 10H2.5z" /><path d="M11 6l3.4 4M14.4 6 11 10" /></svg>',
};

export function createUI(root, { label }) {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <div class="glow"></div>
    <div class="vignette"></div>
    <div class="title">
      <span class="kanji" lang="ja">継ぐ</span>
      <span class="rule"></span>
      <span class="sub"></span>
    </div>
    <div class="corner"></div>
    <div class="guide">
      <div class="meaning"></div>
      <div class="prompt" role="status" aria-live="polite"></div>
      <div class="hint"></div>
    </div>
    <div class="actions"></div>
    <div class="view"></div>
    <div class="curtain"></div>
  `,
  );

  const meaning = root.querySelector('.meaning');
  const prompt = root.querySelector('.prompt');
  const hint = root.querySelector('.hint');
  const sub = root.querySelector('.sub');
  const corner = root.querySelector('.corner');
  const actions = root.querySelector('.actions');
  const view = root.querySelector('.view');
  const curtain = root.querySelector('.curtain');
  const labelled = []; // [element, key] pairs, relabelled when the language changes
  const meaningRef = { id: 0 };
  const promptRef = { id: 0 };
  const hintRef = { id: 0 };

  function iconButton(parent, icon, key, onClick, className = '') {
    const el = document.createElement('button');
    el.type = 'button';
    if (className) el.className = className;
    el.innerHTML = ICONS[icon];
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(el);
    });
    parent.appendChild(el);
    labelled.push([el, key]);
    el.setAttribute('aria-label', label(key));
    return el;
  }

  // Fades a line out, then the new one in.
  function fadeTo(el, text, delay, timerRef, beforeShow) {
    clearTimeout(timerRef.id);
    el.classList.remove('visible');
    if (!text) return;
    timerRef.id = setTimeout(() => {
      beforeShow?.();
      el.textContent = text;
      el.classList.add('visible');
    }, 900 + delay * 1000);
  }

  return {
    // Above the step's line: what the step means, in a few plain words. It
    // stays through the step; `closing` is the last, larger line in Keep.
    setMeaning(text, delay = 0, { closing = false } = {}) {
      const showing = meaning.classList.contains('visible');
      if (showing && text === meaning.textContent) return clearTimeout(meaningRef.id);
      // A line already showing fades out fully before the next comes in.
      fadeTo(meaning, text, showing ? Math.max(delay, 0.5) : delay, meaningRef, () =>
        meaning.classList.toggle('closing', closing),
      );
    },
    setPrompt: (text, delay = 0) => fadeTo(prompt, text, delay, promptRef),
    // The small how-to under the step's line; stays until the step changes.
    setHint: (text, delay = 0) => fadeTo(hint, text, delay, hintRef),
    setSubtitle: (text) => (sub.textContent = text),

    // Swaps the words in place (a language change), without the fade.
    swapText(promptText, hintText, meaningText) {
      if (prompt.classList.contains('visible') && promptText) prompt.textContent = promptText;
      if (hint.classList.contains('visible') && hintText) hint.textContent = hintText;
      if (meaning.classList.contains('visible') && meaningText) meaning.textContent = meaningText;
    },

    relabel() {
      for (const [el, key] of labelled) el.setAttribute('aria-label', label(key));
    },

    // Zoom, turn around the pot, and recentre, at the right edge.
    viewControls({ zoomIn, zoomOut, turnLeft, turnRight, recentre }) {
      iconButton(view, 'zoomIn', 'closer', zoomIn);
      iconButton(view, 'zoomOut', 'further', zoomOut);
      iconButton(view, 'turnLeft', 'turnLeft', turnLeft);
      iconButton(view, 'turnRight', 'turnRight', turnRight);
      iconButton(view, 'recentre', 'recentre', recentre);
      return {
        show: () => view.classList.add('visible'),
        hide: () => view.classList.remove('visible'),
      };
    },

    // Top right: sound on/off and the language switch, always available.
    cornerControls({ muted, onMute, languageName, onLanguage }) {
      const sound = iconButton(corner, muted ? 'soundOff' : 'soundOn', muted ? 'soundOff' : 'soundOn', () => {
        const nowMuted = onMute();
        sound.innerHTML = ICONS[nowMuted ? 'soundOff' : 'soundOn'];
        labelled.find((p) => p[0] === sound)[1] = nowMuted ? 'soundOff' : 'soundOn';
        sound.setAttribute('aria-label', label(nowMuted ? 'soundOff' : 'soundOn'));
      });
      const lang = document.createElement('button');
      lang.type = 'button';
      lang.className = 'lang';
      lang.textContent = languageName();
      lang.addEventListener('click', (e) => {
        e.stopPropagation();
        onLanguage();
        lang.textContent = languageName();
      });
      corner.appendChild(lang);
    },

    // While choosing: each pot's name, small, under its stand. main.js
    // places them every frame (place) and fills in the words (name).
    placards(count) {
      const layer = document.createElement('div');
      layer.className = 'placards';
      root.querySelector('.guide').before(layer);
      const items = Array.from({ length: count }, () => {
        const el = document.createElement('div');
        el.className = 'placard';
        el.innerHTML = '<span class="name" lang="ja"></span><span class="word"></span>';
        layer.appendChild(el);
        return el;
      });
      return {
        name(i, kanji, word, lang) {
          items[i].querySelector('.name').textContent = kanji;
          const w = items[i].querySelector('.word');
          w.textContent = word;
          w.lang = lang;
        },
        place: (i, x, y) => (items[i].style.transform = `translate(${x}px, ${y}px) translateX(-50%)`),
        show: () => layer.classList.add('visible'),
        hide: () => layer.classList.remove('visible'),
      };
    },

    button(icon, key, onClick) {
      const el = iconButton(actions, icon, key, () => el.classList.contains('visible') && onClick(), 'pill');
      return {
        el,
        show: () => el.classList.add('visible'),
        hide: () => el.classList.remove('visible'),
      };
    },

    open() {
      curtain.classList.add('open');
    },

    close() {
      curtain.classList.remove('open');
      return new Promise((r) => setTimeout(r, 1800));
    },
  };
}
