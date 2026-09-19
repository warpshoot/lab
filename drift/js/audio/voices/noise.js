import { Voice } from './base.js';
import { getNoiseBuffer } from '../noiseBuffer.js';

// 白色ノイズをバンドパスで削る。風、雨、ヒスなどの質感担当。
export class NoiseVoice extends Voice {
  static type = 'noise';
  static label = 'NOISE';
  static color = '#7fd6b5';
  static defaults = { center: 800, q: 2.0, swellDepth: 0.3, swellRate: 0.15 };
  static params = [
    { key: 'center', label: '帯域中心', min: 20, max: 12000, scale: 'log', unit: 'Hz' },
    { key: 'q', label: '幅（Q）', min: 0.5, max: 30, scale: 'log' },
    { key: 'swellDepth', label: 'うねり深さ', min: 0, max: 1, scale: 'lin' },
    { key: 'swellRate', label: 'うねり速度', min: 0.02, max: 2, scale: 'log', unit: 'Hz' }
  ];

  build() {
    const ctx = this.ctx;
    this.src = ctx.createBufferSource();
    this.src.buffer = getNoiseBuffer(ctx); // 共有バッファ
    this.src.loop = true;

    this.band = ctx.createBiquadFilter();
    this.band.type = 'bandpass';
    this.band.frequency.value = this.params.center;
    this.band.Q.value = this.params.q;

    // うねりは振幅への LFO 変調（JS でループは回さない）
    this.trem = ctx.createGain();
    this.trem.gain.value = 1 - this.params.swellDepth * 0.5;
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = this.params.swellRate;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = this.params.swellDepth * 0.5;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.trem.gain);

    this.src.connect(this.band);
    this.band.connect(this.trem);
    this.trem.connect(this.envGain);
    this.src.start();
    this.lfo.start();
  }

  teardown() {
    for (const n of [this.src, this.lfo]) {
      if (n) { try { n.stop(); n.disconnect(); } catch (e) { /* noop */ } }
    }
    for (const n of [this.band, this.trem, this.lfoGain]) {
      if (n) { try { n.disconnect(); } catch (e) { /* noop */ } }
    }
    this.src = this.lfo = this.band = this.trem = this.lfoGain = null;
  }

  applyParam(key) {
    if (!this.band) return;
    if (key === 'center') this.engine.ramp(this.band.frequency, this.params.center, 0.05);
    if (key === 'q') this.engine.ramp(this.band.Q, this.params.q, 0.05);
    if (key === 'swellRate') this.engine.ramp(this.lfo.frequency, this.params.swellRate, 0.05);
    if (key === 'swellDepth') {
      this.engine.ramp(this.trem.gain, 1 - this.params.swellDepth * 0.5, 0.05);
      this.engine.ramp(this.lfoGain.gain, this.params.swellDepth * 0.5, 0.05);
    }
  }
}
