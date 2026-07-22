// project/persistence.js — сохранение/открытие проекта, GeoJSON, автосейв, восстановление.
// Формат проекта версионируется; добавлены: журнал изменений, контрольная сумма (целостность),
// версия приложения. Автосейв в localStorage (draft) для восстановления после сбоя.

import { state, markSaved } from '../core/state.js';
import { $ , setText } from '../core/dom.js';
import { emit } from '../core/events.js';
import { notifyOk, notifyError, notifyInfo } from '../core/toast.js';
import { buildGeoJSON } from './geojson.js';
import { collectParams } from './params.js';
import { loadAny } from './loader.js';
import { getRegModel } from '../renderer/features/regulations/regModel.js';
import { getBuildingParams, loadBuildingParams } from './params.js';

export const PROJECT_FORMAT_VERSION = 2;
const DRAFT_KEY = 'terrimind.draft';
const DRAFT_META_KEY = 'terrimind.draft.meta';

// Простая контрольная сумма (djb2) — проверка целостности файла проекта
function checksum(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0xffffffff;
  return (h >>> 0).toString(16);
}

// Собрать объект проекта
export function buildProject(extra = {}) {
  const geojson = buildGeoJSON();
  const payload = {
    format: 'terrimind-project',
    version: PROJECT_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    params: collectParams(),
    regulation:      getRegModel().serialize(),    // нормативные настройки
    buildingParams:  getBuildingParams(),          // параметры застройки (Промпт 1.3)
    socialObjects:   state.socialObjects.map(o => ({ id:o.id, type:o.type, name:o.name, lat:o.lat, lng:o.lng, capacity:o.capacity })),
    contextObjects:  state.contextObjects.map(o => ({ id:o.id, type:o.type, name:o.name, lat:o.lat, lng:o.lng, capacity:o.capacity })),
    stats: {
      parcelArea: textOf('parcelArea'),
      blockCount: textOf('blockCount'),
      blockArea: textOf('blockArea'),
      population: textOf('population'),
      density: textOf('density')
    },
    log: extra.log || [],
    geojson
  };
  // контрольная сумма по геометрии+параметрам
  payload.integrity = checksum(JSON.stringify(payload.geojson) + JSON.stringify(payload.params));
  return payload;
}

function textOf(id) { const el = $(id); return el ? el.textContent : '—'; }

// Проверка целостности при загрузке
export function verifyIntegrity(project) {
  if (!project || !project.integrity) return true; // старый формат — пропускаем
  const calc = checksum(JSON.stringify(project.geojson) + JSON.stringify(project.params));
  return calc === project.integrity;
}

// ── Сохранить проект (диалог "Сохранить как") ──
export async function saveProject() {
  if (!state.parcel) { notifyError('Сначала нарисуйте участок'); return false; }
  const project = buildProject();
  const text = JSON.stringify(project, null, 2);
  const result = await window.terrimind.saveProject(text);
  if (result.ok) {
    state.currentProjectPath = result.filePath;
    markSaved();
    clearDraft();
    notifyOk('Проект сохранён');
    return true;
  }
  if (result.canceled) return false;
  notifyError('Ошибка сохранения: ' + (result.error || 'неизвестно'));
  return false;
}

// ── Открыть проект ──
export async function openProject() {
  if (state.dirty && !confirm('Есть несохранённые изменения. Открыть другой проект?')) return;
  const result = await window.terrimind.openProject();
  if (result.canceled) return;
  if (!result.ok) { notifyError('Ошибка открытия: ' + (result.error || 'неизвестно')); return; }

  let obj;
  try { obj = JSON.parse(result.data); } catch (e) { notifyError('Файл не является корректным JSON'); return; }

  if (obj.format === 'terrimind-project' && !verifyIntegrity(obj)) {
    if (!confirm('Контрольная сумма проекта не совпадает — файл мог быть повреждён. Всё равно открыть?')) return;
  }
  const ok = loadAny(obj);
  if (ok) { state.currentProjectPath = result.filePath || null; notifyOk('Проект открыт'); }
}

// ── GeoJSON экспорт/импорт ──
export async function saveGeoJSON() {
  if (!state.parcel) { notifyError('Сначала нарисуйте участок'); return; }
  const text = JSON.stringify(buildGeoJSON(), null, 2);
  const result = await window.terrimind.saveGeoJSON(text);
  if (result.ok) notifyOk('GeoJSON сохранён');
  else if (!result.canceled) notifyError('Ошибка сохранения: ' + (result.error || 'неизвестно'));
}

export async function importGeoJSON() {
  const result = await window.terrimind.openGeoJSON();
  if (result.canceled) return;
  if (!result.ok) { notifyError('Ошибка открытия: ' + (result.error || 'неизвестно')); return; }
  let obj;
  try { obj = JSON.parse(result.data); } catch (e) { notifyError('Файл не является корректным JSON'); return; }
  loadAny(obj);
}

// ── Автосейв (draft в localStorage) для восстановления после сбоя ──
let autosaveTimer = null;

export function scheduleAutosave() {
  if (!state.parcel) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(writeDraft, 1500);
}

function writeDraft() {
  try {
    const project = buildProject();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(project));
    localStorage.setItem(DRAFT_META_KEY, JSON.stringify({ at: Date.now(), path: state.currentProjectPath || null }));
    setText('autosaveStatus', 'Черновик сохранён ' + new Date().toLocaleTimeString('ru-RU'));
  } catch (e) { /* превышен объём — пропускаем */ }
}

export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(DRAFT_META_KEY); } catch (e) {}
}

// Проверить наличие черновика при запуске (восстановление после сбоя)
export function checkRecovery() {
  let raw, meta;
  try {
    raw = localStorage.getItem(DRAFT_KEY);
    meta = JSON.parse(localStorage.getItem(DRAFT_META_KEY) || 'null');
  } catch (e) { return; }
  if (!raw) return;

  const when = meta && meta.at ? new Date(meta.at).toLocaleString('ru-RU') : 'ранее';
  if (confirm('Обнаружен несохранённый черновик (' + when + '). Восстановить?')) {
    try {
      const obj = JSON.parse(raw);
      loadAny(obj);
      state.currentProjectPath = meta && meta.path ? meta.path : null;
      notifyInfo('Черновик восстановлен');
    } catch (e) { notifyError('Не удалось восстановить черновик'); clearDraft(); }
  } else {
    clearDraft();
  }
}
