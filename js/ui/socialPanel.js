// ui/socialPanel.js — панель социальной инфраструктуры. Промпт 2.2.
// Таблица потребности/обеспеченности, размещение объектов на карте, контекстные объекты.

import { $, on } from '../core/dom.js';
import { state, markDirty } from '../core/state.js';
import { on as onEvent, emit } from '../core/events.js';
import { mapCtx } from '../map/mapCore.js';
import {
  INFRA_OBJECTS, INFRA_ICONS, INFRA_COLORS,
  recalcSocialBalance, getBalance, getInfraObject
} from '../domain/infrastructure/socialInfra.js';
import { notifyInfo, notifyOk } from '../core/toast.js';

const { map, socialLayer } = mapCtx;

// ── Внутреннее состояние панели ───────────────────────────────────────────
let _placementMode = false;         // режим размещения объекта
let _placementType = '';            // тип размещаемого объекта
let _placementCapacity = 100;       // вместимость
let _isContextMode = false;         // true = размещаем contextObject
let _showRadii = true;              // показывать круги доступности

// Leaflet-слои по ID объекта: { markerLayer, circleLayer }
const _layers = new Map();

// ── Инициализация ─────────────────────────────────────────────────────────
export function initSocialPanel() {
  // Слушаем обновление баланса
  onEvent('SOCIAL_BALANCE_UPDATED', ({ balance }) => {
    renderBalanceTable(balance);
    renderObjectLists();
    updateRadiiColors(balance);
  });

  // Кнопка «Разместить объект»
  on('si_place_btn', 'click', startPlacement);
  // Кнопка «Добавить вручную» (contextObjects)
  on('si_add_ctx_btn', 'click', startContextPlacement);
  // Кнопка «Показать/скрыть радиусы»
  on('si_toggle_radii', 'click', toggleRadii);

  // Первоначальный рендер
  renderBalanceTable(getBalance());
  renderObjectLists();
  renderSocialLayer();
}

// ── Таблица потребности/обеспеченности ───────────────────────────────────
function renderBalanceTable(balance) {
  const host = $('si_balance_table');
  if (!host) return;

  if (!balance || balance.population === 0) {
    host.innerHTML = '<tr><td colspan="6" style="color:var(--text-faint);text-align:center;padding:var(--sp-4)">Сначала сгенерируйте кварталы — нужно население для расчёта</td></tr>';
    return;
  }

  host.innerHTML = balance.items.map(item => {
    const hasDeficit  = item.deficit  > 0;
    const hasSurplus  = item.surplus  > 0 && item.deficit === 0;
    const rowClass    = hasDeficit ? 'si-row-deficit' : hasSurplus ? 'si-row-surplus' : 'si-row-zero';
    const icon        = hasDeficit ? '⚠' : hasSurplus ? '✓' : '—';
    const iconCls     = hasDeficit ? 'si-icon-deficit' : hasSurplus ? 'si-icon-surplus' : '';
    const defSurp     = hasDeficit
      ? `<span class="si-deficit">−${item.deficit}</span>`
      : hasSurplus
        ? `<span class="si-surplus">+${item.surplus}</span>`
        : '0';

    return `<tr class="${rowClass}">
      <td><span class="si-icon">${INFRA_ICONS[item.id] || '●'}</span> ${esc(item.name)}</td>
      <td class="si-num">${item.normPer1000}</td>
      <td class="si-num">${item.demand} <span class="si-unit">${esc(item.unitType)}</span></td>
      <td class="si-num">${item.existing}</td>
      <td class="si-num">${item.provided}</td>
      <td class="si-num">${defSurp} <span class="${iconCls}">${icon}</span></td>
    </tr>`;
  }).join('');
}

// ── Список размещённых объектов ───────────────────────────────────────────
function renderObjectLists() {
  renderProjectObjects();
  renderContextObjects();
}

function renderProjectObjects() {
  const host = $('si_project_list');
  if (!host) return;
  if (!state.socialObjects.length) {
    host.innerHTML = '<p class="hint">Нет размещённых объектов. Нажмите «Разместить на карте».</p>';
    return;
  }
  host.innerHTML = state.socialObjects.map(obj => {
    const def = getInfraObject(obj.type) || { name: obj.type };
    return `<div class="si-obj-row">
      <span class="si-icon">${INFRA_ICONS[obj.type] || '●'}</span>
      <span class="si-obj-name">${esc(obj.name || def.name)}</span>
      <span class="si-obj-cap">${obj.capacity} ед.</span>
      <button class="si-del-btn" data-id="${esc(obj.id)}" data-ctx="0" title="Удалить">✕</button>
    </div>`;
  }).join('');
  host.querySelectorAll('.si-del-btn[data-ctx="0"]').forEach(btn => {
    btn.addEventListener('click', () => deleteObject(btn.dataset.id, false));
  });
}

function renderContextObjects() {
  const host = $('si_context_list');
  if (!host) return;
  if (!state.contextObjects.length) {
    host.innerHTML = '<p class="hint">Нет объектов окружения.</p>';
    return;
  }
  host.innerHTML = state.contextObjects.map(obj => {
    const def = getInfraObject(obj.type) || { name: obj.type };
    return `<div class="si-obj-row">
      <span class="si-icon">${INFRA_ICONS[obj.type] || '●'}</span>
      <span class="si-obj-name">${esc(obj.name || def.name)}</span>
      <span class="si-obj-cap">${obj.capacity} ед.</span>
      <button class="si-del-btn" data-id="${esc(obj.id)}" data-ctx="1" title="Удалить">✕</button>
    </div>`;
  }).join('');
  host.querySelectorAll('.si-del-btn[data-ctx="1"]').forEach(btn => {
    btn.addEventListener('click', () => deleteObject(btn.dataset.id, true));
  });
}

// ── Размещение объектов на карте ──────────────────────────────────────────
function getPlacementParams() {
  const sel = $('si_type_select');
  const cap = $('si_capacity');
  const type = sel ? sel.value : '';
  const capacity = cap ? (parseInt(cap.value, 10) || 100) : 100;
  return { type, capacity };
}

function startPlacement() {
  const { type, capacity } = getPlacementParams();
  if (!type) { notifyInfo('Выберите тип объекта'); return; }
  _placementType     = type;
  _placementCapacity = capacity;
  _isContextMode     = false;
  _placementMode     = true;
  map.getContainer().style.cursor = 'crosshair';
  notifyInfo('Кликните на карту для размещения объекта');
  map.once('click', onMapPlacementClick);
}

function startContextPlacement() {
  const { type, capacity } = getPlacementParams();
  if (!type) { notifyInfo('Выберите тип объекта'); return; }
  _placementType     = type;
  _placementCapacity = capacity;
  _isContextMode     = true;
  _placementMode     = true;
  map.getContainer().style.cursor = 'crosshair';
  notifyInfo('Кликните на карту для размещения существующего объекта окружения');
  map.once('click', onMapPlacementClick);
}

function onMapPlacementClick(e) {
  map.getContainer().style.cursor = '';
  _placementMode = false;

  const { lat, lng } = e.latlng;
  const def  = getInfraObject(_placementType) || { name: _placementType };
  const id   = (_isContextMode ? 'ctx' : 'so') + '_' + Date.now().toString(36);
  const obj  = {
    id,
    type:     _placementType,
    name:     def.name,
    lat, lng,
    capacity: _placementCapacity
  };

  if (_isContextMode) {
    state.contextObjects.push(obj);
  } else {
    state.socialObjects.push(obj);
  }

  addObjectToLayer(obj, _isContextMode);
  emit('POPULATION_UPDATED');  // триггерит пересчёт баланса
  renderObjectLists();
  markDirty();
  notifyOk('Объект размещён: ' + def.name);
}

function deleteObject(id, isContext) {
  // Удаляем из state
  if (isContext) {
    state.contextObjects = state.contextObjects.filter(o => o.id !== id);
  } else {
    state.socialObjects = state.socialObjects.filter(o => o.id !== id);
  }
  // Удаляем с карты
  const layers = _layers.get(id);
  if (layers) {
    if (layers.marker) socialLayer.removeLayer(layers.marker);
    if (layers.circle) socialLayer.removeLayer(layers.circle);
    _layers.delete(id);
  }
  emit('POPULATION_UPDATED');
  renderObjectLists();
  markDirty();
}

// ── Отрисовка слоя ────────────────────────────────────────────────────────
export function renderSocialLayer() {
  socialLayer.clearLayers();
  _layers.clear();

  for (const obj of state.socialObjects)  addObjectToLayer(obj, false);
  for (const obj of state.contextObjects) addObjectToLayer(obj, true);
}

function addObjectToLayer(obj, isContext) {
  const def   = getInfraObject(obj.type) || { radiusM: 500, name: obj.type };
  const color = INFRA_COLORS[obj.type] || '#666';
  const icon  = INFRA_ICONS[obj.type] || '●';

  // Маркер
  const divIcon = L.divIcon({
    className: '',
    html: `<div class="si-map-marker" style="background:${isContext ? '#888' : color}">${icon}</div>`,
    iconSize:   [32, 32],
    iconAnchor: [16, 16]
  });
  const marker = L.marker([obj.lat, obj.lng], { icon: divIcon, pane: 'socialPane' });
  marker.bindTooltip(
    `<b>${esc(obj.name || def.name)}</b><br>Вместимость: ${obj.capacity}<br>${isContext ? '(существующий)' : '(проектируемый)'}`,
    { direction: 'top', offset: [0, -18] }
  );
  socialLayer.addLayer(marker);

  // Окружность доступности
  const circle = L.circle([obj.lat, obj.lng], {
    radius:      def.radiusM,
    color,
    weight:      1.5,
    fillColor:   color,
    fillOpacity: 0.07,
    dashArray:   isContext ? '6,4' : null,
    pane:        'socialPane',
    interactive: false
  });
  if (_showRadii) socialLayer.addLayer(circle);

  _layers.set(obj.id, { marker, circle });
}

/** Обновляет цвета кругов по текущему балансу. */
function updateRadiiColors(balance) {
  if (!balance) return;
  const coverageMap = {};
  for (const item of balance.items) coverageMap[item.id] = item.coverage_pct;

  for (const [id, layers] of _layers) {
    if (!layers.circle) continue;
    const obj = [...state.socialObjects, ...state.contextObjects].find(o => o.id === id);
    if (!obj) continue;
    const cov = coverageMap[obj.type] ?? 0;
    const color = cov >= 100 ? '#27ae60' : cov >= 50 ? '#f39c12' : '#e74c3c';
    layers.circle.setStyle({ color, fillColor: color });
  }
}

function toggleRadii() {
  _showRadii = !_showRadii;
  const btn = $('si_toggle_radii');
  if (btn) btn.textContent = _showRadii ? 'Скрыть радиусы' : 'Показать радиусы';

  for (const [, layers] of _layers) {
    if (!layers.circle) continue;
    if (_showRadii) socialLayer.addLayer(layers.circle);
    else socialLayer.removeLayer(layers.circle);
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
