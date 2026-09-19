import { Voice } from './base.js';

// 音を持たない星。周回の中心にするためだけに置く。
// Voice の形はそのまま保つので、盤面もパネルも分岐を増やさずに扱える。
export class AnchorVoice extends Voice {
  static type = 'anchor';
  static label = 'STAR';
  static color = '#dfe6f2';
  static silent = true;
  static defaults = {};
  static params = [];

  // 鳴らないので同時発音数を食わない
  weight() { return 0; }

  build() {}
  teardown() {}
}
