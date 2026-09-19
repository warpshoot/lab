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
const drifts = new Map(); // id -> ゆらぎのパラメータ組
let started = false;
let noticeTimer = null;

const DRIFT_RANGE = 0.15;

function driftFor(id) {
  if (!drifts.has(id)) {
    const axis = () => ({
      T1: 20 + Math.random() * 160,
      T2: 20 + Math.random() * 160,
      p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2
    });
    drifts.set(id, { x: axis(), y: axis() });
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

  effectivePos(v) {
    if (!v.drift) return { x: v.x, y: v.y };
    const d = driftFor(v.id);
    const t = engine.ctx ? engine.ctx.currentTime : 0;
    return { x: clamp01(v.x + offset(d.x, t)), y: clamp01(v.y + offset(d.y, t)) };
  },

  select(id) {
    state.selectedId = id;
    field.render();
    panel.render();
  },

  add(type, x, y) {
    if (!this.canAdd()) return this.notice('点は8つまで');
    const data = newVoiceData(type, clamp01(x), clamp01(y));
    state.patch.voices.push(data);
    if (started) spawn(data);
    state.selectedId = data.id;
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
    if (state.selectedId === id) state.selectedId = null;
    field.render();
    panel.render();
    save();
  },

  moveTo(id, x, y) {
    const v = findVoice(id);
    if (!v) return;
    v.x = clamp01(x);
    v.y = clamp01(y);
    applyPos(v);
    field.layout();
  },

  setLevel(id, level) {
    const v = findVoice(id);
    if (!v) return;
    v.level = level;
    const voice = live.get(id);
    if (voice) voice.setLevel(level);
    field.layout();
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

  notice(text) {
    noticeEl.textContent = text;
    noticeEl.classList.add('show');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => noticeEl.classList.remove('show'), 1600);
  }
};

function applyPos(v) {
  const voice = live.get(v.id);
  if (!voice) return;
  const p = app.effectivePos(v);
  voice.setPosition(p.x, p.y);
}

function spawn(data) {
  const voice = createVoice(engine, data);
  engine.addVoice(voice);
  live.set(data.id, voice);
  const p = app.effectivePos(data);
  voice.setPosition(p.x, p.y);
  voice.setLevel(data.level);
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
