import { lookOf, LOOK_IDS } from './looks.js';

// 星の一覧。盤面の外に出た星や、小さくて掴めない星もここから選べる。
export function createStrip(el, app) {
  function render() {
    el.innerHTML = '';
    const voices = app.voices();
    el.classList.toggle('hidden', voices.length === 0);
    voices.forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'star-tab' + (app.selectedId() === v.id ? ' on' : '');
      b.title = app.typeOf(v).label;
      const mark = document.createElement('span');
      const look = lookOf(v.look);
      mark.className = 'star-mark';
      for (const l of LOOK_IDS) mark.classList.toggle('look-' + l, look.id === l);
      mark.style.setProperty('--c', look.c);
      if (!app.audible(v.id)) mark.classList.add('off');
      b.appendChild(mark);
      b.addEventListener('click', () => app.select(v.id));
      el.appendChild(b);
    });
  }
  return { render };
}
