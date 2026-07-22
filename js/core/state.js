// core/state.js — единый источник состояния проекта.
// Все модули читают/пишут сюда, без разрозненных глобальных let.
// Слои Leaflet и геометрия хранятся здесь; UI подписывается через events.

import { emit } from './events.js';

export const state = {
  // Геометрия (GeoJSON Feature / массивы Feature)
  parcel: null,            // L.Layer текущего участка (редактируемый)
  parcelFeature: null,     // GeoJSON участка (кэш)
  blocks: [],              // Feature<Polygon>[] кварталы
  roadAxes: [],            // Feature<LineString>[] оси дорог (источник истины)
  roadsMain: null,         // Feature полигон магистралей
  roadsLocal: null,        // Feature полигон улиц
  roadsService: null,      // Feature полигон сервисных проездов
  roads: null,             // общий полигон дорог (совместимость)
  innerRoads: [],          // Feature[] внутриквартальные дорожки/тротуары

  // Участки, дворы, здания (Промпт 1.1–1.2)
  plots:      {},          // { [blockId]: Plot[] }     — земельные участки
  courtyards: {},          // { [blockId]: Feature }    — дворы
  buildings:  {},          // { [plotId]: Building }    — пятна зданий

  // Социальная инфраструктура (Промпт 2.1–2.2)
  socialObjects:   [],     // размещённые в проекте объекты { id, type, name, lat, lng, capacity }
  contextObjects:  [],     // существующие объекты окружения { id, type, name, lat, lng, capacity }

  // Контекстный слой окружения (contextLayer.js)
  contextLayer:    [],     // { id, contextType, label, status, capacity, geometry, includeInBalance, note }

  // ЗОУИТ — зоны с особыми условиями использования территории (zouit.js)
  zouitLayers:     [],     // { id, zouitType, geometry, bufferM, allowConstruction, allowRoads, note }

  // Флаги
  dirty: false,            // несохранённые изменения
  showLabels: true,        // показывать номера кварталов
  showPlots: true,         // показывать участки
  showBuildings: true,     // показывать здания
  currentProjectPath: null // путь текущего .terrimind.json (для автосейва)
};

// Сброс всей геометрии кроме участка
export function resetGenerated() {
  state.blocks = [];
  state.roadAxes = [];
  state.roadsMain = null;
  state.roadsLocal = null;
  state.roadsService = null;
  state.roads = null;
  state.innerRoads = [];
  state.plots      = {};
  state.courtyards = {};
  state.buildings  = {};
}

// Полный сброс
export function resetAll() {
  state.parcel         = null;
  state.parcelFeature  = null;
  state.socialObjects  = [];
  state.contextObjects = [];
  state.contextLayer   = [];
  state.zouitLayers    = [];
  resetGenerated();
}

// Пометка изменений с событием.
// 'dirty:change' — только при реальном переходе clean→dirty или dirty→clean (для UI/IPC).
// 'project:change' — при каждом изменении (для дебаунса автосейва).
export function markDirty() {
  emit('project:change');
  if (!state.dirty) {
    state.dirty = true;
    emit('dirty:change', true);
  }
}
export function markSaved() {
  state.dirty = false;
  emit('dirty:change', false);
}
