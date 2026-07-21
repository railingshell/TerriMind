// project/params.js — параметры UI: сбор/применение/дефолты + пресеты.

import { $, getNum, getStr, setVal } from '../core/dom.js';
import { state } from '../core/state.js';

export const PARAM_DEFAULTS = {
  scenario: 'balanced',
  blockSize: 80, streetWidth: 20, mainRoadWidth: 30, gridAngle: 0,
  floors: 9, buildCoef: 0.25, residShare: 0.7, areaPerPerson: 30,
  autoSize: false, autoAngle: false,
  showLabels: true
};

export function collectParams() {
  return {
    scenario: getStr('scenario', 'balanced'),
    blockSize: getNum('blockSize', 80),
    streetWidth: getNum('streetWidth', 20),
    mainRoadWidth: getNum('mainRoadWidth', 30),
    gridAngle: getNum('gridAngle', 0),
    floors: getNum('floors', 9),
    buildCoef: getNum('buildCoef', 0.25),
    residShare: getNum('residShare', 0.7),
    areaPerPerson: getNum('areaPerPerson', 30),
    autoSize: !!($('autoSize') && $('autoSize').checked),
    autoAngle: !!($('autoAngle') && $('autoAngle').checked),
    showLabels: state.showLabels
  };
}

export function applyParams(p) {
  const m = Object.assign({}, PARAM_DEFAULTS, p || {});
  ['scenario', 'blockSize', 'streetWidth', 'mainRoadWidth', 'gridAngle',
   'floors', 'buildCoef', 'residShare', 'areaPerPerson'].forEach(id => setVal(id, m[id]));
  const as = $('autoSize'); if (as) as.checked = !!m.autoSize;
  const aa = $('autoAngle'); if (aa) aa.checked = !!m.autoAngle;
  state.showLabels = !!m.showLabels;
  const cb = $('toggleLabels'); if (cb) cb.checked = state.showLabels;
}

// ── Пресеты ──
export const BUILTIN_PRESETS = {
  compact:  { label: 'Компактный жилой',    params: { scenario: 'dense', blockSize: 60, streetWidth: 12, mainRoadWidth: 24, floors: 12, buildCoef: 0.32, residShare: 0.85, areaPerPerson: 28 } },
  balanced: { label: 'Сбалансированный',    params: { scenario: 'balanced', blockSize: 80, streetWidth: 20, mainRoadWidth: 30, floors: 9, buildCoef: 0.25, residShare: 0.7, areaPerPerson: 30 } },
  free:     { label: 'Свободный',           params: { scenario: 'free', blockSize: 100, streetWidth: 30, mainRoadWidth: 40, floors: 5, buildCoef: 0.18, residShare: 0.6, areaPerPerson: 35 } },
  mixed:    { label: 'Смешанный городской', params: { scenario: 'balanced', blockSize: 90, streetWidth: 22, mainRoadWidth: 34, floors: 8, buildCoef: 0.28, residShare: 0.55, areaPerPerson: 30 } }
};

const USER_PRESETS_KEY = 'terrimind.userPresets';

export function getUserPresets() {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) { return {}; }
}
export function saveUserPresets(presets) {
  try { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets)); } catch (e) { /* ok */ }
}
export function getPresets() {
  const merged = Object.assign({}, BUILTIN_PRESETS);
  const user = getUserPresets();
  for (const k of Object.keys(user)) merged['user:' + k] = { label: user[k].label, params: user[k].params, user: true };
  return merged;
}
