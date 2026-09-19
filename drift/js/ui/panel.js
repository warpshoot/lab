import { COMMON_PARAMS } from '../audio/voices/base.js';
import { renderMaster } from './master.js';

export function toNorm(p, value) {
  if (p.scale === 'log') {
    return (Math.log(value) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min));
  }
  return (value - p.min) / (p.max - p.min);
}

export function fromNorm(p, n) {
  let v;
  if (p.scale === 'log') {
    v = Math.exp(Math.log(p.min) + n * (Math.log(p.max) - Math.log(p.min)));
  } else {
    v = p.min + n * (p.max - p.min);
  }
  if (p.scale === 'int') v = Math.round(v);
  return v;
}

export function fmt(p, v) {
  const abs = Math.abs(v);
  const s = p.scale === 'int' || abs >= 100 ? v.toFixed(0) : abs >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s + (p.unit ? ' ' + p.unit : '');
}

// スライダ1本。onInput は常時、onCommit は指を離したときだけ。
export function buildControl(p, value, onInput, onCommit) {
  const row = document.createElement('div');
  row.className = 'ctrl';
  const head = document.createElement('div');
  head.className = 'ctrl-head';
  const name = document.createElement('span');
  name.textContent = p.label;
  const val = document.createElement('span');
  val.className = 'ctrl-val';
  head.appendChild(name);
  head.appendChild(val);
  row.appendChild(head);

  if (p.type === 'select') {
    val.textContent = '';
    const group = document.createElement('div');
    group.className = 'seg';
    p.options.forEach((opt) => {
      const b = document.createElement('button');
      b.textContent = opt;
      b.className = opt === value ? 'on' : '';
      b.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        onInput(opt);
        if (onCommit) onCommit(opt);
      });
      group.appendChild(b);
    });
    row.appendChild(group);
    return row;
  }

  const input = document.createElement('input');
  input.type = 'range';
  input.min = 0;
  input.max = 1000;
  input.step = 1;
  input.value = Math.round(Math.min(1, Math.max(0, toNorm(p, value))) * 1000);
  val.textContent = fmt(p, value);
  input.addEventListener('input', () => {
    const v = fromNorm(p, input.value / 1000);
    val.textContent = fmt(p, v);
    onInput(v);
  });
  const commit = () => {
    if (onCommit) onCommit(fromNorm(p, input.value / 1000));
  };
  input.addEventListener('change', commit);
  row.appendChild(input);
  return row;
}

function section(title) {
  const s = document.createElement('div');
  s.className = 'section';
  const h = document.createElement('div');
  h.className = 'section-title';
  h.textContent = title;
  s.appendChild(h);
  return s;
}

export function createPanel(el, app) {
  function render() {
    el.innerHTML = '';
    const v = app.selected();
    if (!v) {
      renderMaster(el, app, { section, buildControl });
      return;
    }
    const V = app.typeOf(v);

    const head = document.createElement('div');
    head.className = 'panel-head';
    const name = document.createElement('span');
    name.className = 'panel-name';
    name.textContent = V.label;
    name.style.setProperty('--c', V.color);
    head.appendChild(name);

    const drift = document.createElement('button');
    drift.className = 'chip' + (v.drift ? ' on' : '');
    drift.textContent = 'ゆらぎ';
    drift.addEventListener('click', () => {
      app.toggleDrift(v.id);
      render();
    });
    head.appendChild(drift);

    const master = document.createElement('button');
    master.className = 'chip';
    master.textContent = 'マスター';
    master.addEventListener('click', () => app.select(null));
    head.appendChild(master);

    const del = document.createElement('button');
    del.className = 'chip danger';
    del.textContent = '削除';
    del.addEventListener('click', () => {
      if (confirm('この点を削除する？')) app.remove(v.id);
    });
    head.appendChild(del);
    el.appendChild(head);

    const common = section('共通');
    common.appendChild(
      buildControl(
        { key: 'level', label: '音量', min: 0, max: 1, scale: 'lin' },
        v.level,
        (val) => { app.setLevel(v.id, val); },
        () => app.commit()
      )
    );
    COMMON_PARAMS.forEach((p) => {
      common.appendChild(
        buildControl(p, v.common[p.key], (val) => app.setParam(v.id, p.key, val), () => app.commit())
      );
    });
    el.appendChild(common);

    const own = section(V.label);
    V.params.forEach((p) => {
      own.appendChild(
        buildControl(p, v.params[p.key], (val) => app.setParam(v.id, p.key, val), () => app.commit())
      );
    });
    el.appendChild(own);
  }

  return { render };
}
