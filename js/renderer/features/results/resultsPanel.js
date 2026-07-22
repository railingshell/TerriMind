// renderer/features/results/resultsPanel.js — профессиональная панель результатов ТЭП.
// Отображает метрики по категориям, прозрачные КЗ/КИТ (числитель/знаменатель/формула/источник),
// нормативное соответствие, диаграммы (баланс, зоны, жильё/нежильё, этажность).

import { $ } from '../../../core/dom.js';
import { formatMetric } from '../../../domain/metrics/metricSchema.js';
import { METRIC_CATEGORY } from '../../../domain/metrics/metricSchema.js';
import { checkCompliance } from '../../../domain/regulations/ruleSchema.js';
import { getRegModel } from '../regulations/regModel.js';
import { barChart, donutChart, legend, color } from '../charts.js';
import { ZONES } from '../../../zones/zoneConfig.js';

const CATEGORY_LABEL = {
  [METRIC_CATEGORY.TERRITORY]:   'Территория',
  [METRIC_CATEGORY.BUILDING]:    'Застройка',
  [METRIC_CATEGORY.APARTMENTS]:  'Квартирография',
  [METRIC_CATEGORY.POPULATION]: 'Население и обеспеченность',
  [METRIC_CATEGORY.COEFFICIENT]: 'Коэффициенты',
  [METRIC_CATEGORY.BALANCE]: 'Баланс территории'
};

const COMPLIANCE_LABEL = {
  compliant: ['Соответствует', 'ok'],
  near_limit: ['Близко к пределу', 'warn'],
  exceeds: ['Превышение', 'bad'],
  below_min: ['Ниже минимума', 'bad'],
  non_compliant: ['Не соответствует', 'bad'],
  no_data: ['Нет данных', 'muted'],
  conflict: ['Конфликт источников', 'warn'],
  pending: ['Ожидает подтверждения', 'warn']
};

// Соответствие метрики <-> категория правила
const METRIC_TO_RULE = {
  build_coefficient: 'build_coefficient',
  floor_area_ratio: 'floor_area_ratio',
  build_density: 'build_density',
  population_density: 'population_density',
  max_floors: 'floors'
};

export function renderResults(metrics) {
  const host = $('resultsPanel');
  if (!host || !metrics) return;
  const byId = metrics.byId;
  const reg = getRegModel();
  const applied = reg ? reg.appliedMap() : {};

  const violations = [];
  const html = [];

  // ── Ключевые коэффициенты (прозрачно) ──
  html.push('<div class="rp-section"><div class="rp-h">Ключевые коэффициенты</div>');
  for (const id of ['build_coefficient', 'floor_area_ratio', 'build_density', 'intensity_coefficient']) {
    const m = byId[id];
    if (!m) continue;
    const comp = complianceFor(id, m, applied);
    if (comp && (comp.status === 'exceeds' || comp.status === 'below_min')) {
      violations.push({ metric: m, comp });
    }
    html.push(coefficientCard(m, comp));
  }
  html.push('</div>');

  // ── Центр нарушений ──
  if (violations.length) {
    html.push('<div class="rp-section rp-violations"><div class="rp-h">Нарушения нормативов</div>');
    for (const v of violations) {
      const [lab] = COMPLIANCE_LABEL[v.comp.status] || ['—'];
      html.push(`<div class="rp-viol">${esc(v.metric.label)}: <b>${esc(lab)}</b> ` +
        `(${formatMetric(v.metric)}, предел ${esc(String(v.comp.limit))}) ` +
        `<span class="rp-src">${esc(v.comp.sourceLabel || '')}</span></div>`);
    }
    html.push('</div>');
  }

  // ── Диаграмма: баланс территории ──
  const balanceData = [
    { label: 'Кварталы', value: num(byId.blocks_area_m2) },
    { label: 'УДС', value: num(byId.roads_total_m2) },
    { label: 'Озеленение', value: num(byId.greenery_area_m2) },
    { label: 'Тротуары', value: num(byId.sidewalk_area_m2) },
    { label: 'Пешеходные', value: num(byId.path_area_m2) }
  ];
  html.push('<div class="rp-section"><div class="rp-h">Баланс территории</div>');
  html.push('<div class="rp-chart-row">' + donutChart(balanceData, { size: 120 }) + legend(balanceData) + '</div></div>');

  // ── Диаграмма: функциональные зоны ──
  const zoneData = zoneShares(byId);
  if (zoneData.length) {
    html.push('<div class="rp-section"><div class="rp-h">Функциональные зоны</div>');
    html.push(barChart(zoneData) + '</div>');
  }

  // ── Жилая/нежилая ──
  const living = num(byId.living_m2), nonLiving = num(byId.non_living_m2);
  if (living + nonLiving > 0) {
    const d = [{ label: 'Жилая', value: living }, { label: 'Нежилая', value: nonLiving }];
    html.push('<div class="rp-section"><div class="rp-h">Структура застройки</div>');
    html.push('<div class="rp-chart-row">' + donutChart(d, { size: 110 }) + legend(d) + '</div></div>');
  }

  // ── Квартирография (Промпт 1.4) ──
  const aptSection = renderApartmentSection(byId, metrics.metrics);
  if (aptSection) html.push(aptSection);

  // ── Полные показатели по категориям ──
  const order = [METRIC_CATEGORY.TERRITORY, METRIC_CATEGORY.BUILDING, METRIC_CATEGORY.POPULATION, METRIC_CATEGORY.BALANCE];
  for (const cat of order) {
    const list = metrics.metrics.filter((m) => m.category === cat && !m.id.startsWith('zone_'));
    if (!list.length) continue;
    html.push('<div class="rp-section"><div class="rp-h">' + esc(CATEGORY_LABEL[cat] || cat) + '</div><table class="rp-table">');
    for (const m of list) {
      html.push(`<tr title="${esc(m.explanation || '')}"><td>${esc(m.label)}</td>` +
        `<td class="rp-v">${m.rounded === null ? '—' : formatMetric(m)}</td></tr>`);
    }
    html.push('</table></div>');
  }

  html.push('<div class="rp-updated">Обновлено: ' + new Date().toLocaleTimeString('ru-RU') + '</div>');
  host.innerHTML = html.join('');
}

/** Секция квартирографии с таблицей и donut-диаграммой. */
function renderApartmentSection(byId, allMetrics) {
  const total = byId.apartments_total;
  if (!total || !total.raw) return null;

  const types = [
    { id: 'apartments_studio', label: 'Студия' },
    { id: 'apartments_1k',     label: '1-комн.' },
    { id: 'apartments_2k',     label: '2-комн.' },
    { id: 'apartments_3k',     label: '3-комн.' }
  ];

  const totalCount = (total.raw || 0);
  const rows = types.map((t, i) => {
    const m = byId[t.id];
    if (!m || m.raw === null) return '';
    const share = totalCount > 0 ? Math.round(m.raw / totalCount * 100) : 0;
    return `<tr>
      <td>${esc(t.label)}</td>
      <td class="rp-v">${m.raw.toLocaleString('ru-RU')}</td>
      <td class="rp-v">${share}%</td>
    </tr>`;
  }).join('');

  // Donut данные
  const chartData = types.map((t, i) => {
    const m = byId[t.id];
    return { label: t.label, value: (m && m.raw) || 0, color: color(i) };
  }).filter(d => d.value > 0);

  // Норматив sqm_per_person
  const sqm = byId.sqm_per_person_apts;
  let normRow = '';
  if (sqm && sqm.raw !== null) {
    const val = sqm.rounded;
    const cls = val < 18 ? 'rp-bad' : val > 40 ? 'rp-warn' : 'rp-ok';
    const msg = val < 18 ? '⚠️ Ниже нормы 18 м²/чел' : val > 40 ? '📊 Высокая обеспеченность' : '✓ В норме';
    normRow = `<div class="rp-viol rp-${cls}" style="margin-top:var(--sp-2)">${msg} — ${val} м²/чел</div>`;
  }

  const avgM = byId.avg_apartment_area;
  const avgStr = (avgM && avgM.raw !== null) ? `Средняя площадь: <b>${avgM.rounded} м²</b>` : '';

  return `<div class="rp-section">
    <div class="rp-h">Квартирография</div>
    <div class="rp-chart-row">
      ${donutChart(chartData, { size: 100 })}
      <div style="flex:1">
        <table class="rp-table">
          <tr><th>Тип</th><th class="rp-v">Кол-во</th><th class="rp-v">Доля</th></tr>
          ${rows}
          <tr style="font-weight:700"><td>Всего</td><td class="rp-v">${totalCount.toLocaleString('ru-RU')}</td><td class="rp-v">100%</td></tr>
        </table>
        <div class="rp-expl" style="margin-top:var(--sp-2)">${avgStr}</div>
        ${normRow}
      </div>
    </div>
  </div>`;
}

function coefficientCard(m, comp) {
  const compBadge = comp
    ? `<span class="rp-badge rp-${(COMPLIANCE_LABEL[comp.status] || [, 'muted'])[1]}">${esc((COMPLIANCE_LABEL[comp.status] || ['—'])[0])}</span>`
    : '';
  const num = m.numerator !== null ? Math.round(m.numerator).toLocaleString('ru-RU') : '—';
  const den = m.denominator !== null ? Math.round(m.denominator).toLocaleString('ru-RU') : '—';
  const rangeStr = comp && (comp.min !== null || comp.max !== null)
    ? `<div class="rp-range">Диапазон: ${comp.min ?? '—'} … ${comp.max ?? '—'} <span class="rp-src">${esc(comp.sourceLabel || '')}</span></div>` : '';
  return `<div class="rp-coef">
    <div class="rp-coef-top"><span class="rp-coef-label">${esc(m.label)}</span><span class="rp-coef-val">${m.rounded === null ? '—' : formatMetric(m)}</span>${compBadge}</div>
    <div class="rp-formula">${esc(m.formula || '')}</div>
    <div class="rp-frac"><span>${num}</span><span class="rp-div">÷</span><span>${den}</span></div>
    ${rangeStr}
    <div class="rp-expl">${esc(m.explanation || '')}</div>
  </div>`;
}

function complianceFor(metricId, metric, applied) {
  const ruleCat = METRIC_TO_RULE[metricId];
  if (!ruleCat || !applied[ruleCat]) return null;
  const rule = applied[ruleCat].rule;
  if (!rule || metric.raw === null) return null;
  const status = checkCompliance(rule, metric.raw);
  const srcLabel = sourceLabel(rule);
  return {
    status,
    min: rule.minValue, max: rule.maxValue,
    limit: rule.maxValue ?? rule.minValue,
    sourceLabel: srcLabel
  };
}

function sourceLabel(rule) {
  if (rule.source === 'manual_pin') return 'Введено вручную';
  if (rule.source === 'builtin_demo') return 'Встроенный профиль (демо)';
  if (rule.documentName) return 'Документ: ' + rule.documentName + (rule.page ? ', стр. ' + rule.page : '');
  return rule.source || '';
}

function zoneShares(byId) {
  const out = [];
  let i = 0;
  for (const [id, m] of Object.entries(byId)) {
    if (!id.startsWith('zone_area_')) continue;
    if (!m.raw) continue;
    const zoneKey = id.replace('zone_area_', '');
    const label = (ZONES[zoneKey] && ZONES[zoneKey].label) || zoneKey;
    out.push({ label, value: m.raw, color: color(i++) });
  }
  return out;
}

function num(m) { return m && Number.isFinite(m.raw) ? m.raw : 0; }
function esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])); }
