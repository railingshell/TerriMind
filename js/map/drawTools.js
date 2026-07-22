// map/drawTools.js — рисование участка, генерация, дорожные инструменты.
// Оркестратор: связывает кнопки UI с движками геометрии.

import { mapCtx } from './mapCore.js';
import { state, markDirty, resetGenerated, resetAll } from '../core/state.js';
import { emit } from '../core/events.js';
import { $, on, getNum, getStr } from '../core/dom.js';
import { notifyError, notifyInfo } from '../core/toast.js';
import { generateBlocks, renumber } from '../geometry/blockGenerator.js';
import { buildGridAxes, buildRoads, autoConnect, carveRoadsFromBlocks } from '../geometry/roadEngine.js';
import { buildInnerProfiles } from '../geometry/innerProfiles.js';
import { renderAll, clearRenderLayers } from './render.js';
import { updateParcelArea, updateStats } from '../project/stats.js';
import { attachParcelEditing } from './parcelEdit.js';

const { map, drawnItems } = mapCtx;

let tracingRoad = false;

// Множители сценария
const SCENARIOS = {
  dense:    { block: 0.7, street: 0.5 },
  balanced: { block: 1.0, street: 1.0 },
  free:     { block: 1.0, street: 2.0 }
};

// leaflet-draw control (только полигон + корзина)
const drawControl = new L.Control.Draw({
  draw: {
    polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#e67e22' } },
    polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false
  },
  edit: { featureGroup: drawnItems, remove: true }
});
map.addControl(drawControl);

// ── Кнопки участка ──
function startDrawParcel() {
  new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
}

function clearParcel() {
  drawnItems.clearLayers();
  resetAll();
  clearRenderLayers();
  updateParcelArea();
  updateStats();
  syncButtons();
  emit('parcel:cleared');
}

// ── Генерация ──
export function doGenerate() {
  if (!state.parcel) return;

  const baseBlock = getNum('blockSize', 80);
  const baseStreet = getNum('streetWidth', 20);
  if (!(baseBlock > 0)) { notifyError('Размер квартала должен быть больше 0'); return; }

  const mult = SCENARIOS[getStr('scenario', 'balanced')] || SCENARIOS.balanced;
  const opts = {
    blockSize: baseBlock * mult.block,
    streetWidth: baseStreet * mult.street,
    angle: getNum('gridAngle', 0),
    autoSize: !!($('autoSize') && $('autoSize').checked),
    autoAngle: !!($('autoAngle') && $('autoAngle').checked)
  };

  resetGenerated();
  clearRenderLayers();

  const parcel = state.parcelFeature || state.parcel.toGeoJSON();
  state.parcelFeature = parcel;

  const t0 = performance.now();
  const { blocks, grid } = generateBlocks(parcel, opts);
  state.blocks = blocks;

  // Оси сетки + дороги
  state.roadAxes = buildGridAxes(parcel, grid, opts.streetWidth);
  rebuildRoads();

  renderAll();
  updateStats();
  syncButtons();
  markDirty();
  console.log('Сгенерировано кварталов:', blocks.length, 'за', Math.round(performance.now() - t0), 'мс');
}

// Перестроить дороги-полигоны из осей (+ carve service из кварталов)
function rebuildRoads() {
  const parcel = state.parcelFeature || (state.parcel && state.parcel.toGeoJSON());
  if (!parcel) return;
  state.blocks = renumber(carveRoadsFromBlocks(state.blocks, state.roadAxes));
  const roads = buildRoads(parcel, state.roadAxes, getNum('mainRoadWidth', 30));
  state.roadsMain = roads.main;
  state.roadsLocal = roads.local;
  state.roadsService = roads.service;
  state.roads = roads.all;
}

// ── Ручная трассировка дороги ──
function startTraceRoad() {
  if (!state.parcel) { notifyError('Сначала нарисуйте участок'); return; }
  tracingRoad = true;
  new L.Draw.Polyline(map, { shapeOptions: { color: '#2b303b', weight: 3 } }).enable();
}

function addManualRoad(layer) {
  let line;
  try { line = layer.toGeoJSON(); } catch (e) { return; }
  if (!line || !line.geometry || line.geometry.type !== 'LineString') return;
  if (line.geometry.coordinates.length < 2) return;

  const width = getNum('streetWidth', 20);
  line.properties = Object.assign({}, line.properties, { roadType: 'service', width, origin: 'manual' });
  state.roadAxes.push(line);
  rebuildRoads();
  renderAll();
  updateStats();
  markDirty();
  syncButtons();
}

function clearManualRoads() {
  state.roadAxes = state.roadAxes.filter(a => !(a.properties && (a.properties.origin === 'manual' || a.properties.origin === 'auto')));
  rebuildRoads();
  renderAll();
  updateStats();
  markDirty();
  syncButtons();
}

function doAutoConnect() {
  if (!state.parcel || !state.blocks.length) return;
  const parcel = state.parcelFeature || state.parcel.toGeoJSON();
  if (!state.roadAxes.length) { notifyError('Нет дорожной сети. Сначала сгенерируйте кварталы.'); return; }
  const connectors = autoConnect(parcel, state.blocks, state.roadAxes, getNum('streetWidth', 20));
  if (!connectors.length) { notifyInfo('Все кварталы уже имеют выход к дорогам.'); return; }
  state.roadAxes.push(...connectors);
  rebuildRoads();
  renderAll();
  updateStats();
  markDirty();
  syncButtons();
  notifyInfo('Авто-выходы добавлены: ' + connectors.length);
}

function doInnerProfiles() {
  if (!state.blocks.length) { notifyError('Сначала сгенерируйте кварталы'); return; }
  state.innerRoads = buildInnerProfiles(state.blocks);
  renderAll();
  updateStats();
  markDirty();
}

// ── Доступность кнопок ──
function hasManualRoads() {
  return state.roadAxes.some(a => a.properties && (a.properties.origin === 'manual' || a.properties.origin === 'auto'));
}
export function syncButtons() {
  const set = (id, disabled) => { const el = $(id); if (el) el.disabled = disabled; };
  set('generateBtn', !state.parcel);
  set('clearBtn', !state.parcel);
  set('traceRoadBtn', !state.parcel);
  set('autoConnectBtn', !state.blocks.length);
  set('innerProfilesBtn', !state.blocks.length);
  set('clearManualRoadsBtn', !hasManualRoads());
  set('editParcelBtn', !state.parcel);
  set('saveBtn', !state.blocks.length);
}

// ── События leaflet-draw ──
map.on(L.Draw.Event.CREATED, (e) => {
  if (tracingRoad && e.layerType === 'polyline') {
    tracingRoad = false;
    addManualRoad(e.layer);
    return;
  }
  drawnItems.clearLayers();
  resetAll();
  clearRenderLayers();
  state.parcel = e.layer;
  state.parcelFeature = e.layer.toGeoJSON();
  drawnItems.addLayer(state.parcel);
  attachParcelEditing();
  updateParcelArea();
  updateStats();   // сброс ТЭП-панели после очистки предыдущего проекта
  syncButtons();
  markDirty();
  emit('parcel:created');
});

map.on(L.Draw.Event.EDITED, () => {
  if (state.parcel) state.parcelFeature = state.parcel.toGeoJSON();
  resetGenerated();
  clearRenderLayers();
  updateParcelArea();
  updateStats();   // сброс ТЭП: кварталы сброшены, показатели должны обнулиться
  syncButtons();
  markDirty();
});

map.on(L.Draw.Event.DELETED, () => {
  clearParcel();
});

// ── Привязка кнопок ──
export function initDrawTools() {
  on('drawBtn', 'click', startDrawParcel);
  on('clearBtn', 'click', clearParcel);
  on('generateBtn', 'click', doGenerate);
  on('traceRoadBtn', 'click', startTraceRoad);
  on('clearManualRoadsBtn', 'click', clearManualRoads);
  on('autoConnectBtn', 'click', doAutoConnect);
  on('innerProfilesBtn', 'click', doInnerProfiles);
  syncButtons();
}
