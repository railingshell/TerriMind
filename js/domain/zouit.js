// domain/zouit.js — ЗОУИТ: зоны с особыми условиями использования территории.
// Промпт: расчёт конфликтов, доступной площади, рендер зон.

import { state } from '../core/state.js';
import { emit } from '../core/events.js';
import { safeIntersect, safeArea, safeBuffer, unionAll, safeIntersects } from '../geometry/turfSafe.js';
import { notifyError, notifyOk } from '../core/toast.js';
import { mapCtx } from '../map/mapCore.js';

const { zouitLayer } = mapCtx;

// ── Справочник типов ЗОУИТ ────────────────────────────────────────────────
export const ZOUIT_TYPES = Object.freeze([
  { code: 'power_line',   label: 'Охранная зона ЛЭП',            defaultWidth: 20,   construction: false, roads: true,  color: '#f39c12' },
  { code: 'sanitary',     label: 'Санитарно-защитная зона',       defaultWidth: 50,   construction: false, roads: true,  color: '#e67e22' },
  { code: 'water_prot',   label: 'Водоохранная зона',             defaultWidth: 50,   construction: false, roads: false, color: '#2980b9' },
  { code: 'utility_zone', label: 'Охранная зона инженерной сети', defaultWidth: 5,    construction: false, roads: true,  color: '#8e44ad' },
  { code: 'heritage',     label: 'Зона культурного наследия',     defaultWidth: null, construction: false, roads: true,  color: '#7d5a3c' },
  { code: 'airport',      label: 'Зона аэропорта',                defaultWidth: null, construction: false, roads: false, color: '#c0392b' },
  { code: 'flood',        label: 'Зона затопления',               defaultWidth: null, construction: false, roads: false, color: '#16a085' },
  { code: 'red_line',     label: 'Красная линия',                 defaultWidth: null, construction: false, roads: true,  color: '#e74c3c' },
  { code: 'servitude',    label: 'Сервитут',                      defaultWidth: null, construction: null,  roads: null,  color: '#95a5a6' }
]);

export function getZouitType(code) {
  return ZOUIT_TYPES.find(t => t.code === code) || ZOUIT_TYPES[ZOUIT_TYPES.length - 1];
}

// ── Внутреннее состояние ──────────────────────────────────────────────────
let _lastConflicts   = [];
let _availableAreaM2 = null;

export function getZouitConflicts()   { return _lastConflicts;   }
export function getAvailableAreaM2()  { return _availableAreaM2; }

// ── CRUD ──────────────────────────────────────────────────────────────────

/** Добавить ЗОУИТ-зону в state.zouitLayers. */
export function addZouit(zouit) {
  if (!zouit || !zouit.geometry) return;
  if (!zouit.id) zouit.id = 'zouit_' + Date.now().toString(36);
  const def = getZouitType(zouit.zouitType);
  zouit.allowConstruction = zouit.allowConstruction ?? def.construction ?? true;
  zouit.allowRoads        = zouit.allowRoads        ?? def.roads        ?? true;
  zouit.note              = zouit.note              || '';
  zouit.bufferM           = zouit.bufferM           ?? def.defaultWidth ?? null;

  state.zouitLayers.push(zouit);
  _addZouitToMap(zouit);
  computeZouitConflicts();
  emit('CONTEXT_UPDATED');
}

/** Удалить ЗОУИТ-зону. */
export function removeZouit(id) {
  const idx = state.zouitLayers.findIndex(z => z.id === id);
  if (idx === -1) return;
  state.zouitLayers.splice(idx, 1);
  _removeZouitFromMap(id);
  computeZouitConflicts();
  emit('CONTEXT_UPDATED');
}

// ── Импорт из GeoJSON ──────────────────────────────────────────────────────

export function importZouitFromGeoJSON(geojson) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    notifyError('Ожидается FeatureCollection');
    return 0;
  }
  let added = 0;
  for (const f of geojson.features) {
    if (!f || !f.geometry) continue;
    const zouitType = _autoRecognizeZouit(f.properties);
    const bufferM   = f.properties && f.properties.bufferM;
    addZouit({
      zouitType,
      geometry: f.geometry,
      bufferM:  bufferM ? Number(bufferM) : null,
      note: (f.properties && (f.properties.note || f.properties.desc || '')) || ''
    });
    added++;
  }
  if (added > 0) notifyOk('Импортировано ЗОУИТ: ' + added);
  return added;
}

function _autoRecognizeZouit(props) {
  const v = Object.values(props || {}).join(' ').toLowerCase();
  if (/лэп|power.line|электр/.test(v))     return 'power_line';
  if (/санитар|sanitary/.test(v))           return 'sanitary';
  if (/водоохран|water.prot/.test(v))       return 'water_prot';
  if (/инженер|utility/.test(v))            return 'utility_zone';
  if (/насле|heritage|памятник/.test(v))    return 'heritage';
  if (/аэропорт|airport/.test(v))           return 'airport';
  if (/затоп|flood/.test(v))               return 'flood';
  if (/красн.лин|red.line/.test(v))         return 'red_line';
  if (/сервитут|servitude/.test(v))         return 'servitude';
  return 'sanitary';
}

// ── Вычисление конфликтов ─────────────────────────────────────────────────

/**
 * Пересечь все запрещающие ЗОУИТ с пятнами зданий и возвратить массив конфликтов.
 * Также обновляет _availableAreaM2.
 */
export function computeZouitConflicts() {
  const conflicts = [];

  // Все ЗОУИТ как полигоны (LineString → буфер)
  const restrictive = state.zouitLayers.filter(z => z.allowConstruction === false);
  const zouitPolys  = restrictive.map(z => ({
    id:      z.id,
    type:    z.zouitType,
    polygon: _toPolygon(z)
  })).filter(z => z.polygon);

  // Конфликты со зданиями
  for (const [plotId, bld] of Object.entries(state.buildings)) {
    if (!bld || !bld.geometry) continue;
    for (const zp of zouitPolys) {
      let intersects = false;
      try { intersects = safeIntersects(bld, zp.polygon); } catch (e) {}
      if (!intersects) continue;
      const inter = safeIntersect(bld, zp.polygon);
      const area  = inter ? Math.round(safeArea(inter)) : 0;
      const def   = getZouitType(zp.type);
      conflicts.push({
        buildingId:   bld.properties && bld.properties.id,
        zouitId:      zp.id,
        conflictType: 'building_in_zone',
        area,
        severity:     def.construction === false ? 'critical' : 'warning',
        zouitLabel:   def.label
      });
    }
  }

  // Конфликты с осевыми дорогами (road_in_zone для no-road ЗОУИТ)
  const noRoad = state.zouitLayers.filter(z => z.allowRoads === false);
  const noRoadPolys = noRoad.map(z => ({ id: z.id, type: z.zouitType, polygon: _toPolygon(z) })).filter(z => z.polygon);
  for (const ax of state.roadAxes) {
    for (const zp of noRoadPolys) {
      let intersects = false;
      try { intersects = safeIntersects(ax, zp.polygon); } catch (e) {}
      if (!intersects) continue;
      conflicts.push({
        buildingId:   null,
        zouitId:      zp.id,
        conflictType: 'road_in_zone',
        area:         0,
        severity:     'warning',
        zouitLabel:   getZouitType(zp.type).label
      });
    }
  }

  _lastConflicts = conflicts;

  // Доступная площадь = площадь участка − union запрещающих ЗОУИТ внутри участка
  _availableAreaM2 = _calcAvailableArea(zouitPolys);

  // Обновить подсветку конфликтующих зданий
  _highlightConflictingBuildings(conflicts);

  emit('ZOUIT_CONFLICTS_UPDATED', conflicts);
  return conflicts;
}

function _calcAvailableArea(zouitPolys) {
  if (!state.parcelFeature) return null;
  const parcelArea = Math.round(safeArea(state.parcelFeature));
  if (!zouitPolys.length) return parcelArea;

  // Обрезаем каждый ЗОУИТ по участку
  const clipped = zouitPolys
    .map(zp => safeIntersect(zp.polygon, state.parcelFeature))
    .filter(Boolean);
  if (!clipped.length) return parcelArea;

  const united = unionAll(clipped);
  const zouitArea = united ? Math.round(safeArea(united)) : 0;
  return Math.max(0, parcelArea - zouitArea);
}

/** Конвертировать геометрию ЗОУИТ в полигон (буфер для линий). */
function _toPolygon(z) {
  const geom = z.geometry;
  if (!geom) return null;
  const gtype = geom.type;
  const feature = { type: 'Feature', geometry: geom, properties: {} };

  if (gtype === 'Polygon' || gtype === 'MultiPolygon') return feature;

  if (gtype === 'LineString' || gtype === 'MultiLineString') {
    const bufKm = (z.bufferM || 5) / 1000;
    return safeBuffer(feature, bufKm, { units: 'kilometers' });
  }
  return null;
}

// ── Рендер ────────────────────────────────────────────────────────────────
const _zouitLayers  = new Map();    // id → L.Layer (zona)
const _bldHighlight = new Map();    // buildingId → L.Layer (подсветка)

export function renderZouit() {
  zouitLayer.clearLayers();
  _zouitLayers.clear();
  for (const z of state.zouitLayers) _addZouitToMap(z);
}

function _addZouitToMap(z) {
  const def   = getZouitType(z.zouitType);
  const color = def.color;
  const poly  = _toPolygon(z);
  if (!poly) return;

  const style = {
    color, weight: 1.5, dashArray: '6 3',
    fillColor: color, fillOpacity: 0.18
  };
  const layer = L.geoJSON(poly, {
    style: () => style,
    pane: 'zouitPane'
  });
  layer.bindTooltip(
    `<b>${esc(def.label)}</b>` +
    (def.construction === false ? '<br>⛔ Строительство запрещено' : '') +
    (def.roads === false ? '<br>⛔ Дороги запрещены' : '') +
    (z.note ? `<br>${esc(z.note)}` : ''),
    { sticky: true }
  );
  zouitLayer.addLayer(layer);
  _zouitLayers.set(z.id, layer);
}

function _removeZouitFromMap(id) {
  const layer = _zouitLayers.get(id);
  if (layer) { zouitLayer.removeLayer(layer); _zouitLayers.delete(id); }
}

/** Подсветить конфликтующие здания красным контуром. */
function _highlightConflictingBuildings(conflicts) {
  // Убрать старые подсветки
  for (const layer of _bldHighlight.values()) {
    try { mapCtx.buildingsLayer.removeLayer(layer); } catch (e) {}
  }
  _bldHighlight.clear();

  const conflictIds = new Set(conflicts.filter(c => c.buildingId).map(c => c.buildingId));
  for (const bld of Object.values(state.buildings)) {
    if (!bld || !bld.geometry) continue;
    const id = bld.properties && bld.properties.id;
    if (!conflictIds.has(id)) continue;
    const hl = L.geoJSON(bld, {
      style: () => ({ color: '#e74c3c', weight: 3, fillOpacity: 0, dashArray: '4 2' }),
      pane: 'zouitPane'
    });
    mapCtx.buildingsLayer.addLayer(hl);
    _bldHighlight.set(id, hl);
  }
}

/** Показать конкретный конфликт на карте. */
export function focusConflict(conflict) {
  const bldId = conflict.buildingId;
  const bld   = bldId ? state.buildings[bldId] : null;
  if (bld && bld.geometry) {
    try {
      const b = L.geoJSON(bld).getBounds();
      if (b.isValid()) mapCtx.map.flyToBounds(b, { padding: [60, 60], duration: 0.6 });
    } catch (e) {}
    return;
  }
  // Найти ЗОУИТ
  const z = state.zouitLayers.find(z => z.id === conflict.zouitId);
  if (z) {
    const poly = _toPolygon(z);
    if (poly) {
      try {
        const b = L.geoJSON(poly).getBounds();
        if (b.isValid()) mapCtx.map.flyToBounds(b, { padding: [60, 60], duration: 0.6 });
      } catch (e) {}
    }
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
