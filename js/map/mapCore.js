// map/mapCore.js — инициализация Leaflet, панелей и слоёв.
// Экспортирует единый контекст карты (mapCtx) для всех модулей.

const map = L.map('map', {
  zoomControl: true,
  zoomSnap: 0.25,          // плавный «полу-зум» — CAD-ощущение
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 90, // мягче колесо
  wheelDebounceTime: 20,
  fadeAnimation: true,
  zoomAnimation: true,
  markerZoomAnimation: true,
  inertia: true,
  inertiaDeceleration: 2600,
  preferCanvas: false
}).setView([55.7558, 37.6173], 12);

window.map = map; // доступ из inline-скрипта index.html (invalidateSize)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Панели с явным z-index (порядок отрисовки снизу вверх)
function pane(name, z, noPointer) {
  map.createPane(name);
  map.getPane(name).style.zIndex = z;
  if (noPointer) map.getPane(name).style.pointerEvents = 'none';
}
pane('roadsPane',      410);
pane('blocksPane',     420);
pane('courtyardsPane', 422, true);  // дворы — поверх кварталов, без pointer
pane('plotsPane',      424);        // участки — поверх дворов
pane('buildingsPane',  426);        // здания — поверх участков
pane('innerPane',      428);
pane('socialPane',     440);        // социальные объекты — поверх всего контента
pane('labelsPane',     430, true);
pane('editPane',       640, false);

// Слои (FeatureGroup), добавлены в порядке отрисовки
const drawnItems     = new L.FeatureGroup().addTo(map);   // участок
const roadsLayer     = new L.FeatureGroup().addTo(map);
const blocksLayer    = new L.FeatureGroup().addTo(map);
const courtyardsLayer= new L.FeatureGroup().addTo(map);   // дворы
const plotsLayer     = new L.FeatureGroup().addTo(map);   // земельные участки
const buildingsLayer = new L.FeatureGroup().addTo(map);   // здания
const innerLayer     = new L.FeatureGroup().addTo(map);
const socialLayer    = new L.FeatureGroup().addTo(map);   // соцобъекты + радиусы
const labelsLayer    = new L.FeatureGroup().addTo(map);

export const mapCtx = {
  map,
  drawnItems,
  roadsLayer,
  blocksLayer,
  courtyardsLayer,
  plotsLayer,
  buildingsLayer,
  innerLayer,
  socialLayer,
  labelsLayer
};

// Плавный fit по границам с анимацией
export function fitTo(layer, padding = [40, 40]) {
  try {
    const b = layer.getBounds();
    if (b && b.isValid()) map.flyToBounds(b, { padding, duration: 0.55 });
  } catch (e) { /* ok */ }
}

export function invalidateSoon(ms = 160) {
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, ms);
}
