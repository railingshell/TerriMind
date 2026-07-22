// renderer/features/charts.js — лёгкие SVG-диаграммы без внешних зависимостей (CSP-safe).
// Функции возвращают строку SVG. Только для отображения — данные приходят готовыми.

const PALETTE = ['#E08A4B', '#3498db', '#27ae60', '#9b59b6', '#e67e22', '#e84393', '#f1c40f', '#7f8c8d', '#16a085'];

export function color(i) { return PALETTE[i % PALETTE.length]; }

/** Горизонтальная столбчатая диаграмма. data: [{label, value, color?}] */
export function barChart(data, opts = {}) {
  const items = (data || []).filter((d) => Number.isFinite(d.value) && d.value >= 0);
  if (!items.length) return '<div class="chart-empty">Нет данных</div>';
  const max = Math.max(...items.map((d) => d.value), 1);
  const rowH = opts.rowH || 22;
  const w = opts.width || 240;
  const labelW = opts.labelW || 96;
  const barW = w - labelW - 46;
  const h = items.length * rowH + 6;
  let rows = '';
  items.forEach((d, i) => {
    const y = i * rowH + 3;
    const bw = Math.max(2, (d.value / max) * barW);
    const c = d.color || color(i);
    rows += `<text x="0" y="${y + rowH / 2 + 4}" font-size="10" fill="currentColor" opacity="0.8">${clip(d.label, 16)}</text>`;
    rows += `<rect x="${labelW}" y="${y + 3}" width="${bw}" height="${rowH - 8}" rx="3" fill="${c}"/>`;
    rows += `<text x="${labelW + bw + 4}" y="${y + rowH / 2 + 4}" font-size="10" fill="currentColor" opacity="0.7">${fmtNum(d.value)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="tm-chart" role="img">${rows}</svg>`;
}

/** Кольцевая (donut) диаграмма долей. data: [{label, value, color?}] */
export function donutChart(data, opts = {}) {
  const items = (data || []).filter((d) => Number.isFinite(d.value) && d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return '<div class="chart-empty">Нет данных</div>';
  const size = opts.size || 120;
  const r = size / 2 - 8;
  const cx = size / 2, cy = size / 2;
  const stroke = 16;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let arcs = '';
  items.forEach((d, i) => {
    const frac = d.value / total;
    const len = frac * circ;
    const c = d.color || color(i);
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${stroke}" ` +
      `stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="tm-chart" role="img">${arcs}` +
    `<circle cx="${cx}" cy="${cy}" r="${r - stroke / 2 - 1}" fill="var(--surface,#1a1a1a)"/></svg>`;
}

/** Легенда для донат/бар. */
export function legend(data) {
  const items = (data || []).filter((d) => Number.isFinite(d.value) && d.value > 0);
  return '<div class="chart-legend">' + items.map((d, i) =>
    `<span class="cl-item"><span class="cl-sw" style="background:${d.color || color(i)}"></span>${clip(d.label, 22)}</span>`
  ).join('') + '</div>';
}

/** Группированная диаграмма сравнения (сценарии/режимы). series: [{name, values:[]}], labels:[] */
export function groupedBars(labels, series, opts = {}) {
  if (!labels || !labels.length || !series || !series.length) return '<div class="chart-empty">Нет данных</div>';
  const w = opts.width || 260, h = opts.height || 140, pad = 24;
  const allVals = series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = Math.max(...allVals, 1);
  const groupW = (w - pad * 2) / labels.length;
  const barW = Math.max(3, (groupW - 6) / series.length);
  let bars = '', axis = '';
  labels.forEach((lab, gi) => {
    series.forEach((s, si) => {
      const v = s.values[gi];
      if (!Number.isFinite(v)) return;
      const bh = (v / max) * (h - pad * 2);
      const x = pad + gi * groupW + si * barW + 3;
      const y = h - pad - bh;
      bars += `<rect x="${x}" y="${y}" width="${barW - 1}" height="${bh}" rx="2" fill="${color(si)}"/>`;
    });
    axis += `<text x="${pad + gi * groupW + groupW / 2}" y="${h - 8}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.7">${clip(lab, 8)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="tm-chart" role="img">${bars}${axis}</svg>`;
}

function clip(s, n) { s = String(s == null ? '' : s); return escapeXml(s.length > n ? s.slice(0, n - 1) + '…' : s); }
function escapeXml(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
function fmtNum(n) { return Math.round(n).toLocaleString('ru-RU'); }
