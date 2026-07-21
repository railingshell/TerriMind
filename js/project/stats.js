// project/stats.js — расчёт ТЭП с учётом зон.

import { state } from '../core/state.js';
import { $, getNum, fmt, setText } from '../core/dom.js';
import { safeArea } from '../geometry/turfSafe.js';
import { ZONES, zoneOf, INNER_STYLES } from '../zones/zoneConfig.js';

export function parcelAreaM2() {
  if (!state.parcel) return 0;
  try {
    const latlngs = state.parcel.getLatLngs()[0];
    return L.GeometryUtil.geodesicArea(latlngs);
  } catch (e) {
    return state.parcelFeature ? safeArea(state.parcelFeature) : 0;
  }
}

export function updateParcelArea() {
  const area = parcelAreaM2();
  setText('parcelArea', area ? fmt(area) + ' м²' : '—');
}

export function updateStats() {
  if (!state.blocks.length) {
    ['blockCount', 'blockArea', 'population', 'density'].forEach(id => setText(id, '—'));
    const z = $('zoneBreakdown'); if (z) z.innerHTML = '';
    return;
  }

  const buildCoef = getNum('buildCoef', 0.25);
  const floors = getNum('floors', 9);
  const residShare = getNum('residShare', 0.7);
  const areaPerPerson = getNum('areaPerPerson', 30) || 1;

  let blocksArea = 0, population = 0;
  const zoneArea = {};

  for (const b of state.blocks) {
    const a = safeArea(b);
    blocksArea += a;
    const zone = zoneOf(b);
    zoneArea[zone] = (zoneArea[zone] || 0) + a;
    const zc = ZONES[zone] ? ZONES[zone].popCoef : 1;
    const floorArea = a * buildCoef * floors;
    const livingArea = floorArea * residShare * zc;
    population += areaPerPerson > 0 ? livingArea / areaPerPerson : 0;
  }

  const parcelHa = parcelAreaM2() / 10000;
  const density = parcelHa > 0 ? population / parcelHa : 0;

  setText('blockCount', state.blocks.length);
  setText('blockArea', fmt(blocksArea / state.blocks.length) + ' м²');
  setText('population', fmt(population) + ' чел');
  setText('density', fmt(density) + ' чел/га');

  renderZoneBreakdown(zoneArea);
}

function swatchRow(color, label, value) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML =
    '<span class="label"><span class="swatch" style="background:' + color +
    ';display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px"></span>' +
    label + '</span><span class="value">' + value + '</span>';
  return row;
}

function renderZoneBreakdown(zoneArea) {
  const el = $('zoneBreakdown');
  if (!el) return;
  el.innerHTML = '';
  for (const z of Object.keys(ZONES)) {
    if (!zoneArea[z]) continue;
    el.appendChild(swatchRow(ZONES[z].fillColor, ZONES[z].label, fmt(zoneArea[z]) + ' м²'));
  }

  // внутриквартальные
  let pathArea = 0, sidewalkArea = 0;
  for (const f of state.innerRoads) {
    const a = safeArea(f);
    if (f.properties && f.properties.kind === 'sidewalk') sidewalkArea += a; else pathArea += a;
  }
  if (pathArea > 0) el.appendChild(swatchRow(INNER_STYLES.path.fillColor, 'Дорожки', fmt(pathArea) + ' м²'));
  if (sidewalkArea > 0) el.appendChild(swatchRow(INNER_STYLES.sidewalk.fillColor, 'Тротуары', fmt(sidewalkArea) + ' м²'));
}
