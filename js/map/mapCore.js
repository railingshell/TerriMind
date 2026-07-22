// map/mapCore.js — инициализация Leaflet, панелей и слоёв.
// Экспортирует единый контекст карты (mapCtx) для всех модулей.

// ── ДИАГНОСТИКА: проверяем предусловия ────────────────────────────────────
(function diagMapInit() {
  const checks = [];
  checks.push(['L defined',         typeof L !== 'undefined']);
  checks.push(['L.map function',    typeof L !== 'undefined' && typeof L.map === 'function']);
  checks.push(['L.Draw defined',    typeof L !== 'undefined' && typeof L.Draw !== 'undefined']);
  checks.push(['#map element',      !!document.getElementById('map')]);
  checks.push(['#map has width',    (() => { const el = document.getElementById('map'); return el ? el.offsetWidth > 0 : false; })()]);
  checks.push(['#map has height',   (() => { const el = document.getElementById('map'); return el ? el.offsetHeight > 0 : false; })()]);
  checks.push(['turf defined',      typeof turf !== 'undefined']);

  const pass = checks.filter(([,ok]) => ok).length;
  const fail = checks.filter(([,ok]) => !ok);
  const style = fail.length ? 'background:#c0392b;color:#fff;padding:2px 6px' : 'background:#27ae60;color:#fff;padding:2px 6px';
  console.groupCollapsed(`%c[TerriMind] mapCore pre-checks: ${pass}/${checks.length}`, style);
  checks.forEach(([name, ok]) => console.log(`  ${ok ? '✅' : '❌'} ${name}`));
  if (fail.length) console.warn('[TerriMind] Failing checks:', fail.map(([n]) => n).join(', '));
  console.groupEnd();
})();
// ─────────────────────────────────────────────────────────────────────────

let map;
try {
  map = L.map('map', {
    zoomControl: true,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    wheelDebounceTime: 20,
    fadeAnimation: true,
    zoomAnimation: true,
    markerZoomAnimation: true,
    inertia: true,
    inertiaDeceleration: 2600,
    preferCanvas: false
  }).setView([55.7558, 37.6173], 12);
  console.log('%c[TerriMind] L.map() — OK', 'color:#27ae60');
} catch (err) {
  console.error('[TerriMind] L.map() FAILED:', err);
  throw err; // пробрасываем дальше чтобы видеть полный стектрейс
}

window.map = map;

try {
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  console.log('%c[TerriMind] tileLayer — OK', 'color:#27ae60');
} catch (err) {
  console.error('[TerriMind] tileLayer FAILED:', err);
}

// Панели с явным z-index (порядок отрисовки снизу вверх)
function pane(name, z, noPointer) {
  try {
    map.createPane(name);
    map.getPane(name).style.zIndex = z;
    if (noPointer) map.getPane(name).style.pointerEvents = 'none';
  } catch (err) {
    console.error(`[TerriMind] pane('${name}') FAILED:`, err);
  }
}
pane('roadsPane',      410);
pane('zouitPane',      405);
pane('contextPane',    408);
pane('blocksPane',     420);
pane('courtyardsPane', 422, true);
pane('plotsPane',      424);
pane('buildingsPane',  426);
pane('innerPane',      428);
pane('socialPane',     440);
pane('labelsPane',     430, true);
pane('editPane',       640, false);

// Слои
const drawnItems     = new L.FeatureGroup().addTo(map);
const zouitLayer     = new L.FeatureGroup().addTo(map);
const contextLayer   = new L.FeatureGroup().addTo(map);
const roadsLayer     = new L.FeatureGroup().addTo(map);
const blocksLayer    = new L.FeatureGroup().addTo(map);
const courtyardsLayer= new L.FeatureGroup().addTo(map);
const plotsLayer     = new L.FeatureGroup().addTo(map);
const buildingsLayer = new L.FeatureGroup().addTo(map);
const innerLayer     = new L.FeatureGroup().addTo(map);
const socialLayer    = new L.FeatureGroup().addTo(map);
const labelsLayer    = new L.FeatureGroup().addTo(map);

console.log('%c[TerriMind] All layers created — OK', 'color:#27ae60');

// Диагностика размеров контейнера карты после инициализации
setTimeout(() => {
  const el = document.getElementById('map');
  if (!el) { console.error('[TerriMind] #map element NOT FOUND after init'); return; }
  const w = el.offsetWidth, h = el.offsetHeight;
  const hasLeaflet = el.classList.contains('leaflet-container');
  const tileCount  = el.querySelectorAll('.leaflet-tile').length;
  const style = (w > 0 && h > 0) ? 'color:#27ae60' : 'color:#e74c3c';
  console.log(`%c[TerriMind] #map size: ${w}×${h}px | leaflet-container: ${hasLeaflet} | tiles: ${tileCount}`, style);
  if (w === 0 || h === 0) {
    console.warn('[TerriMind] ⚠ Map has ZERO size — calling invalidateSize()');
    try { map.invalidateSize(); } catch (e) { console.error('[TerriMind] invalidateSize() failed:', e); }
  }
}, 500);

export const mapCtx = {
  map,
  drawnItems,
  zouitLayer,
  contextLayer,
  roadsLayer,
  blocksLayer,
  courtyardsLayer,
  plotsLayer,
  buildingsLayer,
  innerLayer,
  socialLayer,
  labelsLayer
};

export function fitTo(layer, padding = [40, 40]) {
  try {
    const b = layer.getBounds();
    if (b && b.isValid()) map.flyToBounds(b, { padding, duration: 0.55 });
  } catch (e) { /* ok */ }
}

export function invalidateSoon(ms = 160) {
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, ms);
}
