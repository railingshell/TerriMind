// project/loader.js — загрузка GeoJSON/проекта в состояние + рендер.

import { mapCtx, fitTo } from '../map/mapCore.js';
import { state, resetAll, markSaved } from '../core/state.js';
import { emit } from '../core/events.js';
import { parseGeoJSON } from './geojson.js';
import { applyParams } from './params.js';
import { renderAll } from '../map/render.js';
import { updateParcelArea, updateStats } from './stats.js';
import { attachParcelEditing } from '../map/parcelEdit.js';
import { notifyError } from '../core/toast.js';

const { drawnItems } = mapCtx;

export function loadGeoJSON(geojson) {
  const { error, groups } = parseGeoJSON(geojson);
  if (error) { notifyError(error); return false; }

  drawnItems.clearLayers();
  resetAll();

  // Участок
  const parcelLayer = L.geoJSON(groups.parcel, { style: { color: '#e67e22', weight: 2 } });
  parcelLayer.eachLayer((layer) => {
    state.parcel = layer;
    drawnItems.addLayer(layer);
  });
  if (state.parcel) {
    state.parcelFeature = state.parcel.toGeoJSON();
    attachParcelEditing();
  }

  // Дороги-полигоны по типу
  for (const rf of groups.roads) {
    const rt = rf.properties && rf.properties.roadType;
    if (rt === 'main') state.roadsMain = rf;
    else if (rt === 'local') state.roadsLocal = rf;
    else if (rt === 'service') state.roadsService = rf;
    else state.roads = rf;
  }
  if (!state.roads && (state.roadsMain || state.roadsLocal)) {
    state.roads = state.roadsLocal || state.roadsMain;
  }

  // Оси
  state.roadAxes = groups.axes.slice();

  // Кварталы
  groups.blocks.forEach((f, i) => {
    if (!f.properties) f.properties = {};
    if (f.properties.index === undefined) f.properties.index = i + 1;
    if (f.properties.zone === undefined) f.properties.zone = 'residential';
    state.blocks.push(f);
  });

  // Внутриквартальные
  state.innerRoads = groups.inner.slice();

  renderAll();
  updateParcelArea();
  updateStats();
  emit('geometry:loaded');

  fitTo(drawnItems);
  return true;
}

export function detectFormat(obj) {
  if (obj && obj.format === 'terrimind-project') return 'project';
  if (obj && obj.type === 'FeatureCollection' && Array.isArray(obj.features)) return 'geojson';
  return 'unknown';
}

export function loadProject(project) {
  if (!project || project.format !== 'terrimind-project') {
    notifyError('Неподдерживаемый формат: ожидается проект TerriMind');
    return false;
  }
  applyParams(project.params);
  if (project.geojson) loadGeoJSON(project.geojson);
  markSaved();
  return true;
}

export function loadAny(obj) {
  const kind = detectFormat(obj);
  if (kind === 'project') return loadProject(obj);
  if (kind === 'geojson') { const ok = loadGeoJSON(obj); if (ok) markSaved(); return ok; }
  notifyError('Неподдерживаемый формат. Ожидается проект TerriMind или GeoJSON.');
  return false;
}
