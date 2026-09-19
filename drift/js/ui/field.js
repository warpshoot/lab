import { VOICE_TYPES } from '../audio/voices/registry.js';

export const DOT_MIN = 12;
export const DOT_MAX = 58;
const HANDLE_GAP = 16;

// 点の大きさは音量ではなく距離。遠いほど小さく、淡く、奥に描く。
export function dotRadius(z) {
  return DOT_MIN + z * (DOT_MAX - DOT_MIN);
}

export function zFromRadius(r) {
  return Math.min(1, Math.max(0, (r - DOT_MIN) / (DOT_MAX - DOT_MIN)));
}

export function createField(el, app) {
  const dots = new Map();

  // 選択中の点にだけ出る奥行きのハンドル。小さい点でも必ず掴める位置に立つ。
  const gizmo = document.createElement('div');
  gizmo.className = 'gizmo hidden';
  const ring = document.createElement('div');
  ring.className = 'gizmo-ring';
  const handle = document.createElement('div');
  handle.className = 'gizmo-handle';
  const readout = document.createElement('div');
  readout.className = 'gizmo-readout';
  gizmo.appendChild(ring);
  gizmo.appendChild(handle);
  gizmo.appendChild(readout);
  el.appendChild(gizmo);

  bindHandle();

  function bindHandle() {
    let active = false;
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const v = app.selected();
      if (!v) return;
      active = true;
      handle.setPointerCapture(e.pointerId);
      gizmo.classList.add('active');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!active) return;
      const v = app.selected();
      if (!v) return;
      const rect = el.getBoundingClientRect();
      const pos = app.effectivePos(v);
      const cx = rect.left + pos.x * rect.width;
      const cy = rect.top + (1 - pos.y) * rect.height;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      app.setZFromView(v.id, zFromRadius(dist - HANDLE_GAP));
    });
    const end = () => {
      if (!active) return;
      active = false;
      gizmo.classList.remove('active');
      app.commit();
      app.refreshPanel(); // パネルの近さスライダを追従させる
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function layoutGizmo() {
    const v = app.selected();
    if (!v) {
      gizmo.classList.add('hidden');
      return;
    }
    gizmo.classList.remove('hidden');
    const rect = el.getBoundingClientRect();
    const pos = app.effectivePos(v);
    const ez = app.effectiveZ(v);
    const d = dotRadius(ez) + HANDLE_GAP;
    const cx = pos.x * rect.width;
    const cy = (1 - pos.y) * rect.height;
    gizmo.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
    ring.style.width = ring.style.height = d * 2 + 'px';
    ring.style.marginLeft = ring.style.marginTop = -d + 'px';
    const a = -Math.PI / 4;
    handle.style.transform =
      'translate(' + (Math.cos(a) * d - 13) + 'px,' + (Math.sin(a) * d - 13) + 'px)';
    readout.textContent = '近さ ' + Math.round(ez * 100) + '%';
    readout.style.transform = 'translate(-50%,' + (-d - 26) + 'px)';
  }
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
    // 実寸を測ってから寄せる。決め打ちの余白だと盤面の端で種別が切れる。
    const r = el.getBoundingClientRect();
    const pw = picker.offsetWidth;
    const ph = picker.offsetHeight;
    const mx = pw / 2 + 6;
    const my = ph / 2 + 6;
    const px = Math.min(Math.max(x * r.width, mx), Math.max(mx, r.width - mx));
    const py = Math.min(Math.max((1 - y) * r.height - ph * 0.9, my), Math.max(my, r.height - my));
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
      mode = 'move'; // 縁ドラッグは廃止。奥行きはギズモが持つ。
      moved = false;
      dot.classList.add('grabbing'); // 掴んでいる間は補間を切る。指から遅れる。
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
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      app.moveTo(id, x, y);
    });

    const finish = (e) => {
      dot.classList.remove('grabbing');
      clearTimeout(longTimer);
      longTimer = null;
      if (!mode) return;
      mode = null;
      const rect = el.getBoundingClientRect();
      const out =
        e.clientX < rect.left - 4 || e.clientX > rect.right + 4 ||
        e.clientY < rect.top - 4 || e.clientY > rect.bottom + 4;
      if (moved && out) {
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
      const z = app.effectiveZ(v);
      const r = dotRadius(z);
      d.el.style.width = r * 2 + 'px';
      d.el.style.height = r * 2 + 'px';
      d.el.style.opacity = (0.3 + 0.62 * z).toFixed(3);
      d.el.style.zIndex = String(2 + Math.round(z * 100));
      d.el.style.setProperty('--glow', (10 + z * 28).toFixed(1) + 'px');
      d.el.style.transform =
        'translate(' + (pos.x * rect.width - r) + 'px,' + ((1 - pos.y) * rect.height - r) + 'px)';
    }
    layoutGizmo();
  }

  return { render, layout, hidePicker };
}
