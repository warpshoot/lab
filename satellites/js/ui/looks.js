// 星の見た目。音源の種類とは切り離してあり、あとから選び直せる。
export const LOOKS = [
  { id: 'jupiter', label: '木星', c: '#c8a179', b: '#9c7148', ring: false },
  { id: 'saturn', label: '土星', c: '#d8c48e', b: '#b39a63', ring: true },
  { id: 'mars', label: '火星', c: '#b0563a', b: '#8a4029', ring: false },
  { id: 'neptune', label: '海王星', c: '#3f63a4', b: null, ring: false },
  { id: 'venus', label: '金星', c: '#d3bd97', b: null, ring: false },
  { id: 'moon', label: '月', c: '#979ea7', b: null, ring: false }
];

export const LOOK_LABELS = LOOKS.reduce((m, l) => { m[l.id] = l.label; return m; }, {});
export const LOOK_IDS = LOOKS.map((l) => l.id);

export function lookOf(id) {
  return LOOKS.find((l) => l.id === id) || LOOKS[0];
}

// 背景の星。ノイズは一様に細かく、まばらは粒が大きく数が少ない。
export const SKY_STYLES = ['noise', 'sparse', 'none'];
export const SKY_LABELS = { noise: 'ノイズ', sparse: 'まばら', none: 'なし' };

export function skySvg(style) {
  if (style === 'none') return '<svg class="sky" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>';
  const sparse = style === 'sparse';
  const n = sparse ? 90 : 460;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * 1000).toFixed(1);
    const y = (Math.random() * 1000).toFixed(1);
    const r = sparse
      ? (0.8 + Math.pow(Math.random(), 2) * 1.6).toFixed(2)
      : (0.35 + Math.pow(Math.random(), 3) * 0.9).toFixed(2);
    const o = sparse
      ? (0.16 + Math.random() * 0.48).toFixed(2)
      : (0.07 + Math.random() * 0.38).toFixed(2);
    out.push('<circle cx="' + x + '" cy="' + y + '" r="' + r + '" opacity="' + o + '"/>');
  }
  return '<svg class="sky" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
    out.join('') + '</svg>';
}
