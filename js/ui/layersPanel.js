// ui/layersPanel.js — переработанная панель слоёв.
// Возможности: видимость (toggle), блокировка (lock), прозрачность (opacity),
// порядок (bring to front / send back по панелям), цветные индикаторы.
// Работает через существующие слои mapCtx и панели z-index.

import { mapCtx } from '../map/mapCore.js';
import { state } from '../core/state.js';
import { renderLabels } from '../map/render.js';
import { markDirty } from '../core/state.js';
import { $ } from '../core/dom.js';
import { ZONES } from '../zones/zoneConfig.js';

// Легенда зон (все 7 типов)
export function renderZonesLegend() {
  const host = $('zonesLegend');
  if (!host) return;
  host.innerHTML = '';
  for (const key of Object.keys(ZONES)) {
    const z = ZONES[key];
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML =
      '<span class="label"><span class="swatch" style="background:' + z.fillColor +
      ';display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:7px;vertical-align:middle"></span>' +
      z.label + '</span>';
    host.appendChild(row);
  }
}

const { map, drawnItems, blocksLayer, roadsLayer, innerLayer, labelsLayer } = mapCtx;

// Реестр управляемых слоёв (группы + метаданные)
const LAYERS = [
  { id: 'parcel', name: 'Участок',      color: '#e67e22', group: 'base',     layer: drawnItems,  pane: null },
  { id: 'blocks', name: 'Кварталы',     color: '#3498db', group: 'planning', layer: blocksLayer, pane: 'blocksPane' },
  { id: 'roads',  name: 'Дороги',       color: '#3d4451', group: 'planning', layer: roadsLayer,  pane: 'roadsPane' },
  { id: 'inner',  name: 'Дорожки',      color: '#cfcbc3', group: 'planning', layer: innerLayer,  pane: 'innerPane' },
  { id: 'labels', name: 'Номера',       color: '#111827', group: 'planning', layer: labelsLayer, pane: 'labelsPane' }
];

const GROUPS = {
  base:     { name: 'Основа' },
  planning: { name: 'Планировка' }
};

const layerState = {}; // id -> { visible, locked, opacity }

function initState() {
  for (const l of LAYERS) layerState[l.id] = { visible: true, locked: false, opacity: 1 };
}

function setVisible(id, visible) {
  const cfg = LAYERS.find(l => l.id === id);
  if (!cfg) return;
  layerState[id].visible = visible;
  if (id === 'labels') {
    state.showLabels = visible;
    const cb = $('toggleLabels'); if (cb) cb.checked = visible;
    renderLabels();
    return;
  }
  if (visible) { if (!map.hasLayer(cfg.layer)) map.addLayer(cfg.layer); }
  else { if (map.hasLayer(cfg.layer)) map.removeLayer(cfg.layer); }
}

function setOpacity(id, opacity) {
  const cfg = LAYERS.find(l => l.id === id);
  if (!cfg) return;
  layerState[id].opacity = opacity;
  if (cfg.pane) {
    const p = map.getPane(cfg.pane);
    if (p) p.style.opacity = opacity;
  } else {
    // участок — через setStyle на слоях
    cfg.layer.eachLayer(ly => { if (ly.setStyle) ly.setStyle({ opacity, fillOpacity: opacity * 0.3 }); });
  }
}

function setLocked(id, locked) {
  const cfg = LAYERS.find(l => l.id === id);
  if (!cfg) return;
  layerState[id].locked = locked;
  // блокировка = отключение pointer-events на панели (нельзя кликать/редактировать)
  if (cfg.pane) {
    const p = map.getPane(cfg.pane);
    if (p) p.style.pointerEvents = locked ? 'none' : (cfg.id === 'labels' ? 'none' : '');
  } else {
    cfg.layer.eachLayer(ly => {
      if (locked) { if (ly.dragging) ly.dragging.disable(); }
    });
  }
}

// Построить DOM панели
export function initLayersPanel() {
  initState();
  renderZonesLegend();
  const host = $('layersPanel');
  if (!host) return;
  host.innerHTML = '';

  for (const gKey of Object.keys(GROUPS)) {
    const group = document.createElement('div');
    group.className = 'layer-group';
    const title = document.createElement('div');
    title.className = 'layer-group-title';
    title.textContent = GROUPS[gKey].name;
    group.appendChild(title);

    for (const cfg of LAYERS.filter(l => l.group === gKey)) {
      group.appendChild(buildRow(cfg));
    }
    host.appendChild(group);
  }
}

function buildRow(cfg) {
  const row = document.createElement('div');
  row.className = 'layer-item';
  const st = layerState[cfg.id];

  row.innerHTML = `
    <span class="li-swatch" style="background:${cfg.color}"></span>
    <span class="li-name">${cfg.name}</span>
    <button class="li-btn li-lock" title="Блокировать">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    </button>
    <button class="li-btn li-eye" title="Скрыть / показать">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    </button>
    <input class="li-opacity" type="range" min="0.1" max="1" step="0.05" value="${st.opacity}" title="Прозрачность">
  `;

  const eye = row.querySelector('.li-eye');
  const lock = row.querySelector('.li-lock');
  const opacity = row.querySelector('.li-opacity');

  eye.addEventListener('click', () => {
    const v = !layerState[cfg.id].visible;
    setVisible(cfg.id, v);
    eye.classList.toggle('off', !v);
    row.classList.toggle('hidden-layer', !v);
    markDirty();
  });
  lock.addEventListener('click', () => {
    const v = !layerState[cfg.id].locked;
    setLocked(cfg.id, v);
    lock.classList.toggle('on', v);
    row.classList.toggle('locked-layer', v);
  });
  opacity.addEventListener('input', () => {
    setOpacity(cfg.id, parseFloat(opacity.value));
  });

  return row;
}
