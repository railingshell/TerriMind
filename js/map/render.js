// map/render.js — отрисовка геометрии на карте с CAD-полировкой.
// hover, выделение, плавные переходы. Клик по кварталу — смена зоны.

import { mapCtx } from './mapCore.js';
import { state, markDirty } from '../core/state.js';
import { emit } from '../core/events.js';
import { centerOf } from '../geometry/turfSafe.js';
import { zoneOf, zoneStyle, nextZone, ROAD_STYLES, INNER_STYLES } from '../zones/zoneConfig.js';

const { blocksLayer, roadsLayer, innerLayer, labelsLayer } = mapCtx;

let selectedIndex = null;

function baseBlockStyle(zone) {
  const zs = zoneStyle(zone);
  return { color: zs.color, weight: 1, fillColor: zs.fillColor, fillOpacity: 0.45 };
}
function hoverBlockStyle(zone) {
  const zs = zoneStyle(zone);
  return { color: zs.color, weight: 2, fillColor: zs.fillColor, fillOpacity: 0.6 };
}
function selectedBlockStyle(zone) {
  const zs = zoneStyle(zone);
  return { color: '#E08A4B', weight: 2.5, fillColor: zs.fillColor, fillOpacity: 0.62 };
}

// Один квартал
function drawBlock(piece) {
  const zone = zoneOf(piece);
  const layer = L.geoJSON(piece, { pane: 'blocksPane', style: baseBlockStyle(zone) });
  const idx = piece.properties && piece.properties.index;
  layer._tmFeature = piece; // ссылка на исходную геометрию для рестайла

  layer.on('mouseover', () => {
    if (idx === selectedIndex) return;
    layer.setStyle(hoverBlockStyle(zoneOf(piece)));
  });
  layer.on('mouseout', () => {
    if (idx === selectedIndex) return;
    layer.setStyle(baseBlockStyle(zoneOf(piece)));
  });
  layer.on('click', (e) => {
    if (e.originalEvent) L.DomEvent.stop(e);
    if (e.originalEvent && e.originalEvent.shiftKey) {
      selectedIndex = (selectedIndex === idx) ? null : idx;
      redrawBlocks();
      return;
    }
    // Смена зоны — рестайлим только этот слой (без полной перерисовки).
    piece.properties.zone = nextZone(zoneOf(piece));
    layer.setStyle(idx === selectedIndex ? selectedBlockStyle(zoneOf(piece)) : baseBlockStyle(zoneOf(piece)));
    markDirty();
    emit('stats:update');
  });

  if (idx === selectedIndex) layer.setStyle(selectedBlockStyle(zone));
  layer.addTo(blocksLayer);
}

export function redrawBlocks() {
  blocksLayer.clearLayers();
  state.blocks.forEach(drawBlock);
}

export function renderLabels() {
  labelsLayer.clearLayers();
  if (!state.showLabels) return;
  for (const b of state.blocks) {
    const c = centerOf(b);
    if (!c) continue;
    const coords = c.geometry.coordinates;
    const idx = (b.properties && b.properties.index) || '';
    const icon = L.divIcon({ className: 'block-label', html: '<span>' + idx + '</span>', iconSize: null });
    L.marker([coords[1], coords[0]], { icon, pane: 'labelsPane', interactive: false }).addTo(labelsLayer);
  }
}

export function renderRoads() {
  roadsLayer.clearLayers();
  const add = (f, style) => { if (f) L.geoJSON(f, { pane: 'roadsPane', style }).addTo(roadsLayer); };
  add(state.roadsLocal, ROAD_STYLES.local);
  add(state.roadsService, ROAD_STYLES.service);
  add(state.roadsMain, ROAD_STYLES.main);
  // фолбэк-общий, если иерархия не построилась
  if (!state.roadsLocal && !state.roadsMain && !state.roadsService) add(state.roads, ROAD_STYLES.generic);
}

export function renderInner() {
  innerLayer.clearLayers();
  // тротуары под дорожками
  const sorted = state.innerRoads.slice().sort((a, b) => {
    const ak = (a.properties && a.properties.kind) === 'sidewalk' ? 0 : 1;
    const bk = (b.properties && b.properties.kind) === 'sidewalk' ? 0 : 1;
    return ak - bk;
  });
  for (const f of sorted) {
    const kind = (f.properties && f.properties.kind) === 'sidewalk' ? 'sidewalk' : 'path';
    L.geoJSON(f, { pane: 'innerPane', style: INNER_STYLES[kind] }).addTo(innerLayer);
  }
}

// Полная перерисовка сгенерированной геометрии
export function renderAll() {
  renderRoads();
  redrawBlocks();
  renderInner();
  renderLabels();
  emit('stats:update');
}

export function clearRenderLayers() {
  blocksLayer.clearLayers();
  roadsLayer.clearLayers();
  labelsLayer.clearLayers();
  innerLayer.clearLayers();
  selectedIndex = null;
}
