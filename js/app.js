// app.js — точка входа. Инициализирует модули и связывает UI.
// Заменяет прежний монолит map.js. Загружается как <script type="module">.

import './map/mapCore.js';
import { state, markDirty } from './core/state.js';
import { on as onEvent } from './core/events.js';
import { $, on } from './core/dom.js';
import { initDrawTools, syncButtons } from './map/drawTools.js';
import { toggleParcelEdit } from './map/parcelEdit.js';
import { renderLabels } from './map/render.js';
import { updateStats, updateParcelArea } from './project/stats.js';
import { notifyInfo, notifyError } from './core/toast.js';
import {
  saveProject, openProject, saveGeoJSON, importGeoJSON,
  scheduleAutosave, checkRecovery
} from './project/persistence.js';
import { exportPNG, exportPDF } from './project/exporters.js';
import { initPresets } from './ui/presetsPanel.js';
import { initLayersPanel } from './ui/layersPanel.js';
import { initDirtyIndicator } from './ui/dirtyIndicator.js';
import { initLicensePanel } from './ui/licensePanel.js';
import { getRegModel } from './renderer/features/regulations/regModel.js';
import { loadBuildingParams } from './project/params.js';
import { initBuildingPanel } from './ui/buildingPanel.js';
import { initSocialPanel, renderSocialLayer } from './ui/socialPanel.js';
import { regenerateAllPlots } from './geometry/plotGenerator.js';
import { generateAllBuildings } from './geometry/buildingGenerator.js';
import { renderPlots, renderBuildings, renderCourtyards } from './map/render.js';
import { recalcSocialBalance, setPopulation } from './domain/infrastructure/socialInfra.js';
import { renderContextLayer, addContextObject, importContextFromGeoJSON, startDrawingContext, CONTEXT_TYPES } from './map/contextLayer.js';
import { renderZouit, computeZouitConflicts, addZouit, importZouitFromGeoJSON } from './domain/zouit.js';

// ── Нормативные профили: загружаем из localStorage при старте ──
getRegModel().loadProfiles();
// ── Параметры застройки: загружаем из localStorage ──
loadBuildingParams();

// ── Индикатор dirty + автосейв на каждое изменение ──
initDirtyIndicator();
// 'project:change' — каждое изменение → дебаунс автосейва
// 'dirty:change'   — только переход состояния → UI/IPC (в dirtyIndicator)
onEvent('project:change', scheduleAutosave);
onEvent('stats:update', () => updateStats());

// ── Инструменты рисования/генерации ──
initDrawTools();

// ── Пересчёт ТЭП/dirty при смене параметров ──
['floors', 'buildCoef', 'residShare', 'areaPerPerson'].forEach((id) => {
  on(id, 'input', () => { if (state.blocks.length) updateStats(); markDirty(); });
});
['scenario', 'blockSize', 'streetWidth', 'mainRoadWidth', 'gridAngle'].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', markDirty);
});
['autoSize', 'autoAngle'].forEach((id) => on(id, 'change', markDirty));

// ── Редактирование участка (кнопка) ──
on('editParcelBtn', 'click', () => {
  const active = toggleParcelEdit();
  const btn = $('editParcelBtn');
  if (btn) btn.classList.toggle('active', active);
});

// ── Слой номеров (legacy toggle остаётся рабочим) ──
on('toggleLabels', 'change', (e) => {
  state.showLabels = e.target.checked;
  renderLabels();
  markDirty();
});

// ── Проект/экспорт ──
on('saveProjectBtn', 'click', saveProject);
on('openProjectBtn', 'click', openProject);
on('saveBtn', 'click', saveGeoJSON);
on('importBtn', 'click', importGeoJSON);
on('exportPngBtn', 'click', exportPNG);
on('exportPdfBtn', 'click', exportPDF);

// ── Панели ──
initPresets();
initLayersPanel();
initLicensePanel();
initBuildingPanel();
initSocialPanel();

// ── Социальная инфраструктура: обновление при изменении населения ──
onEvent('metrics:update', (metrics) => {
  const pop = (metrics && metrics.byId && metrics.byId.population) ? (metrics.byId.population.raw || 0) : 0;
  setPopulation(pop);
  recalcSocialBalance();   // emit SOCIAL_BALANCE_UPDATED → socialPanel обновится
});

// ── Социальный слой: обновить после загрузки проекта ──
onEvent('geometry:loaded', () => {
  renderSocialLayer();
  renderContextLayer();
  renderZouit();
  recalcSocialBalance();
  computeZouitConflicts();
});

// ── ЗОУИТ: пересчитываем конфликты при изменении зданий ──
onEvent('buildings:updated', () => computeZouitConflicts());
onEvent('CONTEXT_UPDATED',   () => computeZouitConflicts());

// ── Контекстный слой: кнопки управления ──
on('ctx_draw_btn', 'click', () => {
  const sel = $('ctx_draw_type');
  if (sel) startDrawingContext(sel.value);
});
on('ctx_import_btn', 'click', () => { const el = $('ctx_file_input'); if (el) el.click(); });
const ctxFileInput = $('ctx_file_input');
if (ctxFileInput) {
  ctxFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const geojson = JSON.parse(ev.target.result);
        importContextFromGeoJSON(geojson);
        renderContextLayer();
      } catch (err) { notifyError && notifyError('Ошибка чтения GeoJSON'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

// ── ЗОУИТ: кнопки управления ──
on('zouit_draw_btn', 'click', () => {
  const sel = $('zouit_type_select');
  const buf = $('zouit_buffer');
  if (!sel) return;
  const type = sel.value;
  const bufM = buf ? parseInt(buf.value, 10) || 20 : 20;
  // Начинаем рисовать полигон; ЗОУИТ добавится после L.Draw.Event.CREATED
  const { mapCtx: mc } = { mapCtx };
  notifyInfo && notifyInfo('Нарисуйте зону ЗОУИТ на карте');
  window.__pendingZouitType = type;
  window.__pendingZouitBuf  = bufM;
  new L.Draw.Polygon(mapCtx.map, { shapeOptions: { color: '#e74c3c', weight: 2 } }).enable();
});
on('zouit_import_btn', 'click', () => { const el = $('zouit_file_input'); if (el) el.click(); });
const zouitFileInput = $('zouit_file_input');
if (zouitFileInput) {
  zouitFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const geojson = JSON.parse(ev.target.result);
        importZouitFromGeoJSON(geojson);
        renderZouit();
      } catch (err) {}
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}
on('zouit_calc_btn', 'click', () => { computeZouitConflicts(); updateStats(); });

// Перехватываем L.Draw.Event.CREATED для ЗОУИТ (если задан тип)
if (typeof L !== 'undefined') {
  mapCtx.map.on(L.Draw.Event.CREATED, (e) => {
    if (!window.__pendingZouitType) return;
    const type = window.__pendingZouitType;
    const bufM = window.__pendingZouitBuf || 20;
    window.__pendingZouitType = '';
    let geometry;
    try { geometry = e.layer.toGeoJSON().geometry; } catch (err) { return; }
    addZouit({ zouitType: type, geometry, bufferM: bufM, note: '' });
    renderZouit();
    computeZouitConflicts();
    updateStats();
    markDirty();
  });
}

// ── Регенерация застройки по событию ──
onEvent('buildings:regenerate', () => {
  if (!state.blocks.length) return;
  regenerateAllPlots();
  generateAllBuildings();
  renderCourtyards();
  renderPlots();
  renderBuildings();
  updateStats();
  markDirty();
});

// ── main просит сохранить перед закрытием ──
if (window.terrimind && window.terrimind.onRequestSaveBeforeClose) {
  window.terrimind.onRequestSaveBeforeClose(async () => {
    let ok = false;
    try { ok = await saveProject(); } catch (e) { ok = false; }
    try { window.terrimind.sendCloseSaveResult(ok); } catch (e) {}
  });
}

// ── Начальная синхронизация ──
updateParcelArea();
updateStats();
syncButtons();

// ── Восстановление после сбоя (черновик) ──
window.addEventListener('load', () => { checkRecovery(); });
