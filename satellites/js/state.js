import { voiceClass } from './audio/voices/registry.js';
import { COMMON_DEFAULTS } from './audio/voices/base.js';

const KEY = 'satellites.patch.v1';
const OLD_KEY = 'drift.patch.v1'; // DRIFT 時代の保存を引き継ぐ
const VERSION = 2;

export const DRIFT_SHAPES = ['wander', 'orbit', 'swing', 'breath'];
export const DRIFT_LABELS = { wander: 'ふらつき', orbit: '円', swing: '振り子', breath: '呼吸' };

// 周回のときだけ意味を持つ
export const ORBIT_PARAMS = [
  { key: 'orbitEcc', label: 'つぶれ具合（0 = 正円）', min: 0, max: 0.9, scale: 'lin' },
  { key: 'orbitAngle', label: '軌道の傾き', min: 0, max: 360, scale: 'lin', unit: '°' }
];

export const DRIFT_PARAMS = [
  { key: 'driftShape', label: '軌道', type: 'select', options: DRIFT_SHAPES, labels: DRIFT_LABELS },
  { key: 'driftSpeed', label: 'ゆらぎの速さ', min: 0.1, max: 5, scale: 'log', unit: '倍' },
  { key: 'driftRange', label: 'ゆらぎの幅', min: 0, max: 0.4, scale: 'lin' }
];

export const MASTER_DEFAULTS = {
  gain: 0.8,
  reverb: { length: 3.0, decay: 2.5 },
  delay: { time: 420, feedback: 0.35 }
};

export const MASTER_PARAMS = [
  { path: 'gain', label: 'マスター音量', min: 0, max: 1, scale: 'lin' },
  { path: 'reverb.length', label: 'リバーブ長さ', min: 0.5, max: 8, scale: 'lin', unit: 's', deferred: true },
  { path: 'reverb.decay', label: 'リバーブ減衰', min: 1, max: 6, scale: 'lin', deferred: true },
  { path: 'delay.time', label: 'ディレイ時間', min: 50, max: 2000, scale: 'log', unit: 'ms' },
  { path: 'delay.feedback', label: 'フィードバック', min: 0, max: 0.85, scale: 'lin' }
];

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

let seq = 0;

export function newVoiceData(type, x, y) {
  const V = voiceClass(type);
  return {
    id: 'v' + (++seq) + '-' + Math.random().toString(36).slice(2, 7),
    type: V.type,
    x, y,
    z: 0.6, // 近さ。0 = 遠い / 1 = 手前
    driftShape: 'wander',
    driftSpeed: 1,
    driftRange: 0.15,
    orbitEcc: 0,      // 0 = 正円
    orbitAngle: 0,    // 楕円の傾き（度）

    drift: false,
    common: Object.assign({}, COMMON_DEFAULTS),
    params: Object.assign({}, V.defaults)
  };
}

function emptyPatch() {
  return {
    version: VERSION,
    voices: [],
    master: JSON.parse(JSON.stringify(MASTER_DEFAULTS))
  };
}

function sanitize(raw) {
  const patch = emptyPatch();
  if (!raw || (raw.version !== 1 && raw.version !== 2)) return patch;
  patch.master = {
    gain: num(raw.master && raw.master.gain, MASTER_DEFAULTS.gain),
    reverb: {
      length: num(raw.master && raw.master.reverb && raw.master.reverb.length, MASTER_DEFAULTS.reverb.length),
      decay: num(raw.master && raw.master.reverb && raw.master.reverb.decay, MASTER_DEFAULTS.reverb.decay)
    },
    delay: {
      time: num(raw.master && raw.master.delay && raw.master.delay.time, MASTER_DEFAULTS.delay.time),
      feedback: Math.min(0.85, num(raw.master && raw.master.delay && raw.master.delay.feedback, MASTER_DEFAULTS.delay.feedback))
    }
  };
  const voices = Array.isArray(raw.voices) ? raw.voices.slice(0, 8) : [];
  for (const v of voices) {
    const V = voiceClass(v.type);
    if (!v.type || V.type !== v.type) continue;
    patch.voices.push({
      id: v.id || newVoiceData(v.type, 0.5, 0.5).id,
      type: v.type,
      x: clamp01(num(v.x, 0.5)),
      y: clamp01(num(v.y, 0.5)),
      // v1 は音量を持っていた。そのまま近さとして読み替える。
      z: clamp01(num(v.z != null ? v.z : v.level, 0.6)),
      drift: !!v.drift,
      driftShape: DRIFT_SHAPES.includes(v.driftShape) ? v.driftShape : 'wander',
      driftSpeed: Math.min(5, Math.max(0.1, num(v.driftSpeed, 1))),
      driftRange: Math.min(0.4, Math.max(0, num(v.driftRange, 0.15))),
      orbitEcc: Math.min(0.9, Math.max(0, num(v.orbitEcc, 0))),
      orbitAngle: ((num(v.orbitAngle, 0) % 360) + 360) % 360,
      common: Object.assign({}, COMMON_DEFAULTS, v.common || {}),
      params: Object.assign({}, V.defaults, v.params || {})
    });
  }
  return patch;
}

export const MAX_VOICES = 8;

function num(v, fallback) {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

export const state = {
  patch: emptyPatch(),
  selectedId: null
};

export function loadPatch() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    state.patch = sanitize(raw ? JSON.parse(raw) : null);
  } catch (e) {
    state.patch = emptyPatch();
  }
  return state.patch;
}

let timer = null;

export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.patch));
    } catch (e) { /* 容量超過などは黙って諦める */ }
  }, 500);
}

export function findVoice(id) {
  return state.patch.voices.find((v) => v.id === id) || null;
}
