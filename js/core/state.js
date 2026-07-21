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

  // Флаги
  dirty: false,            // несохранённые изменения
  showLabels: true,        // показывать номера кварталов
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
}

// Полный сброс
export function resetAll() {
  state.parcel = null;
  state.parcelFeature = null;
  resetGenerated();
}

// Пометка изменений с событием
export function markDirty() {
  if (!state.dirty) { state.dirty = true; emit('dirty:change', true); }
  else emit('dirty:change', true);
}
export function markSaved() {
  state.dirty = false;
  emit('dirty:change', false);
}
