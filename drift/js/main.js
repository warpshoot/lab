import { engine, MAX_VOICES } from './audio/engine.js';
import { createVoice, voiceClass } from './audio/voices/registry.js';
import { state, loadPatch, save, newVoiceData, findVoice } from './state.js';
import { createField } from './ui/field.js';
import { createPanel } from './ui/panel.js';

const fieldEl = document.getElementById('field');
const panelEl = document.getElementById('panel');
const gateEl = document.getElementById('gate');
const noticeEl = document.getElementById('notice');
const transportEl = document.getElementById('transport');

const live = new Map();   // id -> Voice
const muted = new Set();  // 保存しない。次に開いて無音だと壊れたように見える。
const soloed = new Set();
const drifts = new Map(); // id -> ゆらぎのパラメータ組
let started = false;
let noticeTimer = null;
let lastVoiceId = null;
let paused = false;   // 意図的な停止。自動復帰の対象外にする。
let pauseTimer = null;

const TAU = Math.PI * 2;

// 周期と位相は点ごとに固定。保存はしない（同じ動きを再現する意味がない）。
function driftFor(id) {
  if (!drifts.has(id)) {
    const axis = () => ({
      T1: 20 + Math.random() * 160,
      T2: 20 + Math.random() * 160,
      p1: Math.random() * TAU,
      p2: Math.random() * TAU
    });
    drifts.set(id, {
      x: axis(), y: axis(), z: axis(),
      orbitT: 30 + Math.random() * 120,
      orbitP: Math.random() * TAU,
      dir: Math.random() < 0.5 ? -1 : 1
    });
  }
  return drifts.get(id);
}

// 2つの低速サインの合成。周期が噛み合わないので戻ってこない。
function wander(a, t) {
  return 0.6 * Math.sin((TAU * t) / a.T1 + a.p1) + 0.4 * Math.sin((TAU * t) / a.T2 + a.p2);
}

function driftVector(v, t) {
  const d = driftFor(v.id);
  const r = v.driftRange != null ? v.driftRange : 0.15;
  const tt = t * (v.driftSpeed != null ? v.driftSpeed : 1);
  switch (v.driftShape) {
    case 'orbit': {
      const ph = (TAU * tt) / d.orbitT * d.dir + d.orbitP;
      return { x: r * Math.cos(ph), y: r * Math.sin(ph), z: 0 };
    }
    case 'swing':
      return { x: r * Math.sin((TAU * tt) / d.x.T1 + d.x.p1), y: 0, z: 0 };
    case 'breath':
      // 位置は動かさず、奥行きだけ出入りさせる。音量とリバーブだけが呼吸する。
      return { x: 0, y: 0, z: r * 1.8 * wander(d.z, tt) };
    default:
      return { x: r * wander(d.x, tt), y: r * wander(d.y, tt), z: r * wander(d.z, tt) };
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const app = {
  voices: () => state.patch.voices,
  master: () => state.patch.master,
  find: (id) => findVoice(id),
  typeOf: (v) => voiceClass(v.type),
  selectedId: () => state.selectedId,
  selected: () => (state.selectedId ? findVoice(state.selectedId) : null),
  canAdd: () => state.patch.voices.length < MAX_VOICES,

  driftOffset(v) {
    if (!v.drift) return { x: 0, y: 0, z: 0 };
    return driftVector(v, engine.ctx ? engine.ctx.currentTime : 0);
  },

  effectivePos(v) {
    const o = this.driftOffset(v);
    return { x: clamp01(v.x + o.x), y: clamp01(v.y + o.y) };
  },

  effectiveZ(v) {
    return clamp01(v.z + this.driftOffset(v).z);
  },

  hasVoices: () => state.patch.voices.length > 0,
  isMuted: (id) => muted.has(id),
  isSoloed: (id) => soloed.has(id),
  soloActive: () => soloed.size > 0,

  // ソロが1つでも立っていれば、それ以外は黙る
  audible(id) {
    if (muted.has(id)) return false;
    return soloed.size === 0 || soloed.has(id);
  },

  toggleMute(id) {
    if (muted.has(id)) muted.delete(id);
    else muted.add(id);
    applyAudible();
  },

  toggleSolo(id) {
    if (soloed.has(id)) soloed.delete(id);
    else soloed.add(id);
    applyAudible();
  },

  clearSolo() {
    soloed.clear();
    applyAudible();
  },


  select(id) {
    state.selectedId = id;
    if (id) lastVoiceId = id;
    field.render();
    panel.render();
  },

  // タブから音色パネルに戻るとき、直前に見ていた点を開く
  focusVoice() {
    const v = findVoice(lastVoiceId) || state.patch.voices[0];
    if (v) this.select(v.id);
  },

  add(type, x, y) {
    if (!this.canAdd()) return this.notice('点は8つまで');
    const data = newVoiceData(type, clamp01(x), clamp01(y));
    state.patch.voices.push(data);
    if (started) spawn(data);
    state.selectedId = lastVoiceId = data.id;
    field.render();
    panel.render();
    save();
  },

  duplicate(id) {
    const src = findVoice(id);
    if (!src) return;
    if (!this.canAdd()) return this.notice('点は8つまで');
    const data = newVoiceData(src.type, clamp01(src.x + 0.07), clamp01(src.y - 0.07));
    data.z = src.z;
    data.drift = src.drift;
    data.driftShape = src.driftShape;
    data.driftSpeed = src.driftSpeed;
    data.driftRange = src.driftRange;
    data.common = Object.assign({}, src.common);
    data.params = Object.assign({}, src.params);
    state.patch.voices.push(data);
    if (started) spawn(data);
    state.selectedId = lastVoiceId = data.id;
    field.render();
    panel.render();
    save();
  },

  remove(id) {
    const i = state.patch.voices.findIndex((v) => v.id === id);
    if (i < 0) return;
    state.patch.voices.splice(i, 1);
    const voice = live.get(id);
    if (voice) {
      live.delete(id);
      voice.stop(); // release をかけてから切る
    }
    drifts.delete(id);
    muted.delete(id);
    soloed.delete(id);
    applyAudible();
    if (state.selectedId === id) state.selectedId = null;
    field.render();
    panel.render();
    save();
  },

  // 受け取るのは指のいる位置。ゆらぎの分を引いて基準座標にしないと点が指から逃げる。
  moveTo(id, x, y) {
    const v = findVoice(id);
    if (!v) return;
    const o = this.driftOffset(v);
    v.x = clamp01(x - o.x);
    v.y = clamp01(y - o.y);
    applyPos(v);
    field.layout();
  },

  // パネルのスライダは基準値をそのまま動かす
  setZ(id, z) {
    const v = findVoice(id);
    if (!v) return;
    v.z = clamp01(z);
    applyPos(v);
    field.layout();
  },

  // ギズモは画面に見えている位置を動かすので、ゆらぎの分を引く
  setZFromView(id, z) {
    const v = findVoice(id);
    if (!v) return;
    this.setZ(id, z - this.driftOffset(v).z);
  },

  setParam(id, key, value) {
    const v = findVoice(id);
    if (!v) return;
    if (key in v.common) v.common[key] = value;
    else v.params[key] = value;
    const voice = live.get(id);
    if (voice) voice.setParam(key, value);
  },

  setDriftParam(id, key, value) {
    const v = findVoice(id);
    if (!v) return;
    v[key] = value;
    applyPos(v);
    field.layout();
  },

  toggleDrift(id) {
    const v = findVoice(id);
    if (!v) return;
    v.drift = !v.drift;
    if (!v.drift) applyPos(v);
    field.render();
    panel.render();
    save();
  },

  applyMaster(withIR) {
    if (!engine.ready) return;
    const m = state.patch.master;
    if (!paused) engine.setMasterGain(m.gain); // 停止中に音量を触っても鳴り出さない
    engine.setDelayTime(m.delay.time);
    engine.setDelayFeedback(m.delay.feedback);
    if (withIR) engine.setReverbIR(m.reverb.length, m.reverb.decay);
  },

  commit() { save(); },

  refreshPanel() { panel.render(); },

  requestDelete(id) { field.askDelete(id); },

  notice(text) {
    noticeEl.textContent = text;
    noticeEl.classList.add('show');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => noticeEl.classList.remove('show'), 1600);
  }
};

// ソロは全体に効くので、1つ変わったら全ボイスに掛け直す
function applyAudible() {
  for (const v of state.patch.voices) {
    const voice = live.get(v.id);
    if (voice) voice.setMuted(!app.audible(v.id));
  }
  field.render();
  panel.render();
}

function applyPos(v) {
  const voice = live.get(v.id);
  if (!voice) return;
  const p = app.effectivePos(v);
  voice.setDistance(app.effectiveZ(v));
  voice.setPosition(p.x, p.y);
}

function spawn(data) {
  const voice = createVoice(engine, data);
  engine.addVoice(voice);
  live.set(data.id, voice);
  const p = app.effectivePos(data);
  voice.setDistance(app.effectiveZ(data));
  voice.setPosition(p.x, p.y);
  voice.setMuted(!app.audible(data.id));
  voice.start();
  return voice;
}

const field = createField(fieldEl, app);
const panel = createPanel(panelEl, app);

loadPatch();
field.render();
panel.render();

// ゆらぎは 10Hz で十分。毎フレームは回さない。
setInterval(() => {
  let any = false;
  for (const v of state.patch.voices) {
    if (!v.drift) continue;
    any = true;
    applyPos(v);
  }
  if (any) field.layout();
}, 100);

// 出音に合わせた膨らみ。見た目だけなので毎フレームでいい。
function meterLoop() {
  requestAnimationFrame(meterLoop);
  if (!started || !engine.ctx || engine.ctx.state !== 'running') return;
  for (const [id, voice] of live) field.setPulse(id, voice.getLevel());
}
requestAnimationFrame(meterLoop);

window.addEventListener('resize', () => field.layout());

// iOS Safari はロックやバックグラウンドで suspend される
// ---- 中断と復帰 -------------------------------------------------------
// iOS はバックグラウンドやシステムダイアログで AudioContext を止める。
// resume() はユーザー操作の中でしか通らないので、必ず出口を出しておく。
const gateTitle = gateEl.querySelector('h1');
const gateText = gateEl.querySelector('p');
const gateCta = gateEl.querySelector('.gate-cta');

function running() {
  return !!engine.ctx && engine.ctx.state === 'running';
}

function showGate(mode) {
  if (mode === 'resume') {
    gateTitle.textContent = 'DRIFT';
    gateText.innerHTML = '音が止まっている<br>バックグラウンドに回ると止まる';
    gateCta.textContent = 'タップして再開';
  }
  gateEl.classList.remove('gone');
}

function hideGate() {
  gateEl.classList.add('gone');
}

async function ensureRunning() {
  if (!started || paused) return; // 自分で止めたものを勝手に鳴らし直さない
  try {
    await engine.resume();
  } catch (e) {
    /* ジェスチャの外からは弾かれる。ゲートを出して待つ。 */
  }
  if (running()) {
    engine.resetSchedulers(); // 過去時刻に予約して暴発させない
    hideGate();
  } else {
    showGate('resume');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  ensureRunning();
});

// ジェスチャの中でもう一度試す。ゲートを踏み損ねても復帰できるように。
document.addEventListener('pointerdown', () => {
  if (started && !running()) ensureRunning();
}, true);

async function begin() {
  if (started) {
    ensureRunning();
    return;
  }
  started = true;
  engine.init();
  engine.ctx.addEventListener('statechange', () => {
    if (!started || paused) return;
    if (running()) hideGate();
    else showGate('resume');
  });
  await engine.resume();
  app.applyMaster(true);
  for (const data of state.patch.voices) spawn(data); // 復帰した点は一斉にフェードイン
  hideGate();
  setTransport();
  field.render();
  panel.render();
}

// ---- 停止／再生 -------------------------------------------------------
// suspend をそのまま割り当てるとブツッと切れる。フェードを挟む。
function setTransport() {
  transportEl.classList.toggle('playing', started && !paused);
  transportEl.classList.toggle('visible', started);
}

async function togglePlay() {
  if (!started) return;
  clearTimeout(pauseTimer);
  if (paused) {
    paused = false;
    setTransport();
    try {
      await engine.resume();
    } catch (e) { /* noop */ }
    if (running()) {
      engine.resetSchedulers();
      engine.setMasterGain(state.patch.master.gain);
      hideGate();
    } else {
      showGate('resume');
    }
  } else {
    paused = true;
    setTransport();
    engine.ramp(engine.masterGain.gain, 0, 0.25);
    pauseTimer = setTimeout(() => {
      if (paused && engine.ctx) engine.ctx.suspend();
    }, 900);
  }
}

transportEl.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});

gateEl.addEventListener('click', begin);
