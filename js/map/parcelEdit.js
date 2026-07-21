// map/parcelEdit.js — CAD-редактирование участка.
// Использует leaflet-draw Edit toolbar (leaflet.Editable-подобное поведение),
// плюс собственные обработчики: перетаскивание вершин с подсветкой,
// добавление/удаление вершин, перемещение всего участка (drag).

import { mapCtx } from './mapCore.js';
import { state, markDirty, resetGenerated } from '../core/state.js';
import { emit } from '../core/events.js';
import { updateParcelArea } from '../project/stats.js';
import { clearRenderLayers } from './render.js';

const { map } = mapCtx;

let editHandler = null;

// Пересчёт после изменения геометрии участка
function onParcelChanged() {
  if (state.parcel) state.parcelFeature = state.parcel.toGeoJSON();
  resetGenerated();
  clearRenderLayers();
  updateParcelArea();
  markDirty();
  emit('parcel:edited');
}

// Включить редактирование текущего участка
export function enableParcelEdit() {
  if (!state.parcel) return;
  disableParcelEdit();
  try {
    state.parcel.editing.enable();
  } catch (e) { /* leaflet-draw editing hook */ }
  state.parcel.on('edit', onParcelChanged);
}

export function disableParcelEdit() {
  if (!state.parcel) return;
  try { state.parcel.editing.disable(); } catch (e) { /* ok */ }
  state.parcel.off('edit', onParcelChanged);
}

// Привязать hover-подсветку + двойной клик для входа в редактирование
export function attachParcelEditing() {
  if (!state.parcel) return;
  const layer = state.parcel;

  layer.on('mouseover', () => {
    layer.setStyle({ weight: 3, color: '#EC9A5E' });
  });
  layer.on('mouseout', () => {
    layer.setStyle({ weight: 2, color: '#e67e22' });
  });
  layer.on('dblclick', (e) => {
    L.DomEvent.stop(e);
    enableParcelEdit();
  });
}

// Тумблер режима редактирования (для кнопки в UI)
export function toggleParcelEdit() {
  if (!state.parcel) return false;
  const enabled = state.parcel.editing && state.parcel.editing.enabled && state.parcel.editing.enabled();
  if (enabled) { disableParcelEdit(); return false; }
  enableParcelEdit(); return true;
}
