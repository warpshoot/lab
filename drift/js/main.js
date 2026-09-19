import { engine, MAX_VOICES } from './audio/engine.js';
import { createVoice, voiceClass } from './audio/voices/registry.js';
import { state, loadPatch, save, newVoiceData, findVoice } from './state.js';
import { createField } from './ui/field.js';
import { createPanel } from './ui/panel.js';

const fieldEl = document.getElementById('field');
const panelEl = document.getElementById('panel');
const gateEl = document.getElementById('gate');
const noticeEl = document.getElementById('notice');

const live = new Map();   // id -> Voice
const muted = new Set();  // 保存しない。次に開いて無音だと壊れたように見える。
const soloed = new Set();
const drifts = new Map(); // id -> ゆらぎのパラメータ組
let started = false;
let noticeTimer = null;
let lastVoiceId = null;

const DRIFT_RANGE = 0.15;

function driftFor(id) {
  if (!drifts.has(id)) {
    const axis = () => ({
      T1: 20 + Math.random() * 160,
      T2: 20 + Math.random() * 160,
      p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2
    });
    // 奥行きも漂う。放置すると音量とリバーブが勝手に呼吸する。
    drifts.set(id, { x: axis(), y: axis(), z: axis() });
  }
  return drifts.get(id);
}

function offset(a, t) {
  return DRIFT_RANGE * (0.6 * Math.sin((2 * Math.PI * t) / a.T1 + a.p1) +
                        0.4 * Math.sin((2 * Math.PI * t) / a.T2 + a.p2));
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
    const d = driftFor(v.id);
    const t = engine.ctx ? engine.ctx.currentTime : 0;
    return { x: offset(d.x, t), y: offset(d.y, t), z: offset(d.z, t) };
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
    engine.setMasterGain(m.gain);
    engine.setDelayTime(m.delay.time);
    engine.setDelayFeedback(m.delay.feedback);
    if (withIR) engine.setReverbIR(m.reverb.length, m.reverb.decay);
  },

  commit() { save(); },

  refreshPanel() { panel.render(); },

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

window.addEventListener('resize', () => field.layout());

// iOS Safari はロックやバックグラウンドで suspend される
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !started) return;
  engine.resume().then(() => engine.resetSchedulers());
});

async function begin() {
  if (started) return;
  started = true;
  engine.init();
  await engine.resume();
  app.applyMaster(true);
  for (const data of state.patch.voices) spawn(data); // 復帰した点は一斉にフェードイン
  gateEl.classList.add('gone');
  setTimeout(() => gateEl.remove(), 500);
  field.render();
  panel.render();
}

gateEl.addEventListener('pointerup', begin);
gateEl.addEventListener('click', begin);
