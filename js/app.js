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
import {
  saveProject, openProject, saveGeoJSON, importGeoJSON,
  scheduleAutosave, checkRecovery
} from './project/persistence.js';
import { exportPNG, exportPDF } from './project/exporters.js';
import { initPresets } from './ui/presetsPanel.js';
import { initLayersPanel } from './ui/layersPanel.js';
import { initDirtyIndicator } from './ui/dirtyIndicator.js';
import { initLicensePanel } from './ui/licensePanel.js';

// ── Индикатор dirty + автосейв на каждое изменение ──
initDirtyIndicator();
onEvent('dirty:change', (d) => { if (d) scheduleAutosave(); });
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
