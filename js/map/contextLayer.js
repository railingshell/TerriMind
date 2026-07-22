// map/contextLayer.js — слой контекста территории (существующее окружение проекта).
// Добавление, удаление, импорт из GeoJSON, ручное рисование, отрисовка на карте.

import { state, markDirty } from '../core/state.js';
import { emit } from '../core/events.js';
import { mapCtx } from './mapCore.js';
import { notifyInfo, notifyOk, notifyError } from '../core/toast.js';

const { map, contextLayer: ctxLayerGroup } = mapCtx;

// ── Типы контекстных объектов ─────────────────────────────────────────────
export const CONTEXT_TYPES = Object.freeze([
  { type: 'road_existing',      label: 'Существующая дорога',      geometry: 'LineString', color: '#607d8b' },
  { type: 'building_exist',     label: 'Существующее здание',      geometry: 'Polygon',    color: '#795548' },
  { type: 'school_exist',       label: 'Существующая школа',       geometry: 'Point',      color: '#1565c0' },
  { type: 'kindergarten_exist', label: 'Существующий ДОУ',         geometry: 'Point',      color: '#e65100' },
  { type: 'clinic_exist',       label: 'Существующая поликлиника', geometry: 'Point',      color: '#c62828' },
  { type: 'green_exist',        label: 'Существующее озеленение',  geometry: 'Polygon',    color: '#2e7d32' },
  { type: 'water_exist',        label: 'Водный объект',            geometry: 'Polygon',    color: '#0277bd' },
  { type: 'cadastral',          label: 'Кадастровый участок',      geometry: 'Polygon',    color: '#6a1b9a' },
  { type: 'utility_line',       label: 'Инженерная сеть',          geometry: 'LineString', color: '#f57f17' }
]);

/** Найти тип контекстного объекта по коду. */
export function getContextType(type) {
  return CONTEXT_TYPES.find(t => t.type === type) || CONTEXT_TYPES[0];
}

// ── Стили по статусу ──────────────────────────────────────────────────────
function styleFor(obj) {
  const def   = getContextType(obj.contextType);
  const color = def.color;
  switch (obj.status) {
    case 'planned':
      return { color, weight: 2, dashArray: '8 4', fillColor: color, fillOpacity: 0.12 };
    case 'demolish':
      return { color: '#d32f2f', weight: 2, dashArray: '6 3', fillColor: '#d32f2f', fillOpacity: 0.12 };
    case 'external_ref':
      return { color, weight: 1, dashArray: '2 4', fillColor: color, fillOpacity: 0.08 };
    default: // existing
      return { color, weight: 1.5, fillColor: color, fillOpacity: 0.20 };
  }
}

// ── CRUD операции ─────────────────────────────────────────────────────────

/** Добавить контекстный объект в state.contextLayer. */
export function addContextObject(obj) {
  if (!obj || !obj.geometry) return;
  if (!obj.id) obj.id = 'ctx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  obj.status          = obj.status          || 'existing';
  obj.includeInBalance= obj.includeInBalance !== false;
  obj.note            = obj.note            || '';
  obj.capacity        = obj.capacity        ?? null;

  state.contextLayer.push(obj);
  _addToMap(obj);
  emit('CONTEXT_UPDATED');
  markDirty();
}

/** Удалить контекстный объект. */
export function removeContextObject(id) {
  const idx = state.contextLayer.findIndex(o => o.id === id);
  if (idx === -1) return;
  state.contextLayer.splice(idx, 1);
  _removeFromMap(id);
  emit('CONTEXT_UPDATED');
  markDirty();
}

// ── Полная перерисовка ────────────────────────────────────────────────────

/** Отрисовать все объекты контекстного слоя. */
export function renderContextLayer() {
  ctxLayerGroup.clearLayers();
  _leafletLayers.clear();
  for (const obj of state.contextLayer) _addToMap(obj);
}

// ── Импорт из GeoJSON ──────────────────────────────────────────────────────

/**
 * Импортировать контекстный слой из GeoJSON FeatureCollection.
 * Автоматически определяет типы по полям properties.
 */
export function importContextFromGeoJSON(geojson) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    notifyError('Ожидается FeatureCollection');
    return 0;
  }
  let added = 0;
  for (const f of geojson.features) {
    if (!f || !f.geometry) continue;
    const contextType = autoRecognizeType(f.properties, f.geometry.type);
    const obj = {
      id:             'ctx_' + Date.now().toString(36) + '_' + (added++),
      contextType,
      label:          (f.properties && (f.properties.name || f.properties.label)) || getContextType(contextType).label,
      status:         _recognizeStatus(f.properties),
      capacity:       (f.properties && (f.properties.capacity || f.properties.вместимость)) ?? null,
      geometry:       f.geometry,
      includeInBalance: true,
      note:           (f.properties && (f.properties.note || f.properties.desc || '')) || ''
    };
    addContextObject(obj);
  }
  if (added > 0) notifyOk('Импортировано объектов контекста: ' + added);
  return added;
}

/** Авто-определение типа по properties и типу геометрии. */
function autoRecognizeType(props, geomType) {
  const v = Object.values(props || {}).join(' ').toLowerCase();
  if (/highway|road|street|дорог/.test(v)                   ) return 'road_existing';
  if (/school|школ|education|образовани/.test(v)            ) return 'school_exist';
  if (/kindergarten|детский сад|дошкол|дou|дою/.test(v)     ) return 'kindergarten_exist';
  if (/clinic|hospital|поликлиника|больниц|медицин/.test(v) ) return 'clinic_exist';
  if (/green|park|лес|парк|озелен|grass|forest/.test(v)     ) return 'green_exist';
  if (/water|river|lake|вода|озеро|река|пруд/.test(v)       ) return 'water_exist';
  if (/cadastr|кадастр/.test(v)                             ) return 'cadastral';
  if (/utility|pipe|cable|инженер|сеть|трубопр|кабел/.test(v)) return 'utility_line';
  if (geomType === 'LineString' || geomType === 'MultiLineString') return 'road_existing';
  if (geomType === 'Point')                                       return 'building_exist';
  return 'building_exist';
}

function _recognizeStatus(props) {
  const v = Object.values(props || {}).join(' ').toLowerCase();
  if (/снос|demolish/.test(v))   return 'demolish';
  if (/проект|planned|plan/.test(v)) return 'planned';
  if (/внеш|external/.test(v))   return 'external_ref';
  return 'existing';
}

// ── Ручное рисование ──────────────────────────────────────────────────────
let _pendingDrawType = '';

/**
 * Начать рисование контекстного объекта через Leaflet-draw.
 * @param {string} contextType — тип объекта
 * @param {string} geomHint    — 'Polygon'|'LineString'|'Point' (опционально)
 */
export function startDrawingContext(contextType, geomHint) {
  _pendingDrawType = contextType;
  const typeDef = getContextType(contextType);
  const geom    = geomHint || typeDef.geometry;
  const drawControl = _getDrawHandler(geom);
  if (drawControl) {
    drawControl.enable();
    notifyInfo('Нарисуйте ' + typeDef.label + ' на карте');
  }
}

function _getDrawHandler(geomType) {
  const opts = { shapeOptions: { color: '#3498db', weight: 2 } };
  if (geomType === 'LineString') return new L.Draw.Polyline(map, opts);
  if (geomType === 'Point')      return new L.Draw.Marker(map, {});
  return new L.Draw.Polygon(map, { ...opts, showArea: false });
}

// Слушаем событие L.Draw.Event.CREATED для контекстных объектов
map.on(L.Draw.Event.CREATED, (e) => {
  if (!_pendingDrawType) return;
  const type = _pendingDrawType;
  _pendingDrawType = '';

  let geometry;
  try { geometry = e.layer.toGeoJSON().geometry; } catch (err) { return; }

  const typeDef = getContextType(type);
  addContextObject({
    contextType: type,
    label:       typeDef.label,
    status:      'existing',
    geometry,
    includeInBalance: true,
    note: ''
  });
});

// ── Карта: внутренние функции ─────────────────────────────────────────────
const _leafletLayers = new Map(); // id → L.Layer

function _addToMap(obj) {
  if (!obj.geometry) return;
  const style  = styleFor(obj);
  const label  = esc(obj.label || getContextType(obj.contextType).label);
  const note   = obj.note ? `<br><i>${esc(obj.note)}</i>` : '';
  const status = { existing: 'существующий', planned: 'проектируемый', demolish: 'под снос', external_ref: 'внешний' };
  const tooltip = `<b>${label}</b><br>Статус: ${status[obj.status] || obj.status}${note}`;

  let layer;
  const gt = obj.geometry.type;
  if (gt === 'Point' || gt === 'MultiPoint') {
    const coords = obj.geometry.type === 'Point' ? obj.geometry.coordinates : obj.geometry.coordinates[0];
    layer = L.circleMarker([coords[1], coords[0]], {
      radius: 7, ...style, pane: 'contextPane'
    });
  } else {
    layer = L.geoJSON({ type: 'Feature', geometry: obj.geometry, properties: {} }, {
      style: () => ({ ...style, pane: 'contextPane' }),
      pane: 'contextPane'
    });
  }

  layer.bindTooltip(tooltip, { sticky: true });
  layer.on('click', (e) => {
    if (e.originalEvent) L.DomEvent.stop(e);
    emit('context:selected', obj);
  });

  ctxLayerGroup.addLayer(layer);
  _leafletLayers.set(obj.id, layer);
}

function _removeFromMap(id) {
  const layer = _leafletLayers.get(id);
  if (layer) { ctxLayerGroup.removeLayer(layer); _leafletLayers.delete(id); }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
