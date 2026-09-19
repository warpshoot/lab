import { VOICE_TYPES } from '../audio/voices/registry.js';

export const DOT_MIN = 15;
export const DOT_MAX = 62;

export function dotRadius(level) {
  return DOT_MIN + level * (DOT_MAX - DOT_MIN);
}

export function createField(el, app) {
  const dots = new Map();
  const picker = document.createElement('div');
  picker.className = 'picker hidden';
  el.appendChild(picker);

  VOICE_TYPES.forEach((V) => {
    const b = document.createElement('button');
    b.className = 'picker-btn';
    b.type = 'button';
    b.textContent = V.label;
    b.style.setProperty('--c', V.color);
    b.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (performance.now() - picker._shownAt < 220) return; // 同じタップの pointerup を拾わない
      hidePicker();
      app.add(V.type, picker._x, picker._y);
    });
    picker.appendChild(b);
  });

  function showPicker(x, y) {
    picker._x = x;
    picker._y = y;
    picker._shownAt = performance.now();
    picker.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const px = Math.min(Math.max(x * r.width, 70), r.width - 70);
    const py = Math.min(Math.max((1 - y) * r.height, 30), r.height - 40);
    picker.style.left = px + 'px';
    picker.style.top = py + 'px';
  }

  function hidePicker() {
    picker.classList.add('hidden');
  }

  function makeDot(v) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.dataset.id = v.id;
    const label = document.createElement('span');
    label.className = 'dot-label';
    dot.appendChild(label);
    bindDot(dot, v.id);
    el.appendChild(dot);
    return { el: dot, label };
  }

  function bindDot(dot, id) {
    let mode = null;
    let moved = false;
    let longTimer = null;
    let lastTap = 0;
    let startX = 0;
    let startY = 0;

    dot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      hidePicker();
      const v = app.find(id);
      if (!v) return;
      dot.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const pos = app.effectivePos(v);
      const cx = rect.left + pos.x * rect.width;
      const cy = rect.top + (1 - pos.y) * rect.height;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      const r = dotRadius(v.level);
      mode = dist > r - 13 ? 'resize' : 'move';
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      app.select(id);
      longTimer = setTimeout(() => {
        longTimer = null;
        mode = null;
        if (confirm('この点を削除する？')) app.remove(id);
      }, 620);
    });

    dot.addEventListener('pointermove', (e) => {
      if (!mode) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 7) {
        moved = true;
        clearTimeout(longTimer);
        longTimer = null;
      }
      if (!moved) return;
      const rect = el.getBoundingClientRect();
      if (mode === 'move') {
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1 - (e.clientY - rect.top) / rect.height;
        app.moveTo(id, x, y);
      } else {
        const v = app.find(id);
        const pos = app.effectivePos(v);
        const cx = rect.left + pos.x * rect.width;
        const cy = rect.top + (1 - pos.y) * rect.height;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const level = (dist - DOT_MIN) / (DOT_MAX - DOT_MIN);
        app.setLevel(id, Math.min(1, Math.max(0, level)));
      }
    });

    const finish = (e) => {
      clearTimeout(longTimer);
      longTimer = null;
      if (!mode) return;
      const wasMove = mode === 'move';
      mode = null;
      const rect = el.getBoundingClientRect();
      const out =
        e.clientX < rect.left - 4 || e.clientX > rect.right + 4 ||
        e.clientY < rect.top - 4 || e.clientY > rect.bottom + 4;
      if (wasMove && moved && out) {
        app.remove(id); // 盤面外に投げたら削除
        return;
      }
      if (!moved) {
        const t = performance.now();
        if (t - lastTap < 320) {
          app.toggleDrift(id);
          lastTap = 0;
        } else {
          lastTap = t;
        }
      }
      app.commit();
    };

    dot.addEventListener('pointerup', finish);
    dot.addEventListener('pointercancel', finish);
  }

  el.addEventListener('pointerup', (e) => {
    if (e.target !== el) return;
    if (!picker.classList.contains('hidden')) {
      hidePicker();
      return;
    }
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    app.select(null);
    if (!app.canAdd()) {
      app.notice('点は8つまで');
      return;
    }
    showPicker(x, y);
  });

  function render() {
    const seen = new Set();
    for (const v of app.voices()) {
      seen.add(v.id);
      if (!dots.has(v.id)) dots.set(v.id, makeDot(v));
    }
    for (const [id, d] of dots) {
      if (!seen.has(id)) {
        d.el.remove();
        dots.delete(id);
      }
    }
    for (const v of app.voices()) {
      const d = dots.get(v.id);
      const V = app.typeOf(v);
      d.el.style.setProperty('--c', V.color);
      d.el.classList.toggle('selected', app.selectedId() === v.id);
      d.el.classList.toggle('drifting', !!v.drift);
      d.label.textContent = V.label;
    }
    layout();
  }

  function layout() {
    const rect = el.getBoundingClientRect();
    for (const v of app.voices()) {
      const d = dots.get(v.id);
      if (!d) continue;
      const pos = app.effectivePos(v);
      const r = dotRadius(v.level);
      d.el.style.width = r * 2 + 'px';
      d.el.style.height = r * 2 + 'px';
      d.el.style.transform =
        'translate(' + (pos.x * rect.width - r) + 'px,' + ((1 - pos.y) * rect.height - r) + 'px)';
    }
  }

  return { render, layout, hidePicker };
}
