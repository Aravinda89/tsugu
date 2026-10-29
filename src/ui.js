// Minimal prompts and buttons. One short line per step, icon-only pills.

const ICONS = {
  // An ensō left open, with a small turn: begin again.
  again: '<svg viewBox="0 0 16 16"><path d="M13.2 6.2A5.5 5.5 0 1 0 13.4 10" /><path d="M13.6 3.2v3.2h-3.2" /></svg>',
  save: '<svg viewBox="0 0 16 16"><path d="M8 2.5v8" /><path d="M4.8 7.5 8 10.7l3.2-3.2" /><path d="M3 13.5h10" /></svg>',
};

export function createUI(root) {
  root.insertAdjacentHTML(
    'beforeend',
    `
    <div class="glow"></div>
    <div class="vignette"></div>
    <div class="title" aria-label="Tsugu, mend and carry on">
      <span class="kanji" lang="ja">継ぐ</span>
      <span class="rule"></span>
      <span class="sub">Tsugu · mend &amp; carry on</span>
    </div>
    <div class="prompt" role="status" aria-live="polite"></div>
    <div class="actions"></div>
    <div class="curtain"></div>
  `,
  );

  const prompt = root.querySelector('.prompt');
  const actions = root.querySelector('.actions');
  const curtain = root.querySelector('.curtain');
  let promptTimer = 0;

  return {
    // Fades the current line out, then the new one in.
    setPrompt(text, delay = 0) {
      clearTimeout(promptTimer);
      prompt.classList.remove('visible');
      if (!text) return;
      promptTimer = setTimeout(() => {
        prompt.textContent = text;
        prompt.classList.add('visible');
      }, 900 + delay * 1000);
    },

    button(icon, label, onClick) {
      const el = document.createElement('button');
      el.className = 'pill';
      el.type = 'button';
      el.setAttribute('aria-label', label);
      el.innerHTML = ICONS[icon];
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.classList.contains('visible')) onClick();
      });
      actions.appendChild(el);
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
