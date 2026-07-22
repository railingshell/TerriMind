// map/render.js — отрисовка геометрии на карте с CAD-полировкой.
// hover, выделение, плавные переходы. Клик по кварталу — смена зоны.

import { mapCtx } from './mapCore.js';
import { state, markDirty } from '../core/state.js';
import { emit } from '../core/events.js';
import { centerOf } from '../geometry/turfSafe.js';
import { zoneOf, zoneStyle, nextZone, ROAD_STYLES, INNER_STYLES } from '../zones/zoneConfig.js';

const { blocksLayer, roadsLayer, innerLayer, labelsLayer,
        plotsLayer, buildingsLayer, courtyardsLayer } = mapCtx;

// ── Стили участков по plotType ──
const PLOT_STYLES = {
  residential: { color: '#c0692a', weight: 1, fillColor: '#f5cba7', fillOpacity: 0.55 },
  commercial:  { color: '#1a5276', weight: 1, fillColor: '#aed6f1', fillOpacity: 0.55 },
  social:      { color: '#1e8449', weight: 1, fillColor: '#a9dfbf', fillOpacity: 0.55 },
  parking:     { color: '#7d6608', weight: 1, fillColor: '#f9e79f', fillOpacity: 0.55 },
  green:       { color: '#1d6832', weight: 1, fillColor: '#a9dfbf', fillOpacity: 0.55 }
};
const PLOT_HOVER = { weight: 2.5, fillOpacity: 0.75 };

// ── Стили зданий по морфотипу ──
const BUILDING_STYLES = {
  perimeter:    { color: '#8e5a2a', weight: 1, fillColor: '#E8C4A0', fillOpacity: 0.85 },
  section:      { color: '#2c5f8a', weight: 1, fillColor: '#C4D4E8', fillOpacity: 0.85 },
  tower:        { color: '#5b3a8a', weight: 1, fillColor: '#D4C4E8', fillOpacity: 0.85 },
  freestanding: { color: '#27652e', weight: 1, fillColor: '#C4E8D4', fillOpacity: 0.85 },
  courtyard:    { color: '#6b4c1a', weight: 1, fillColor: '#E8D4A0', fillOpacity: 0.85 }
};

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

/** Отрисовка земельных участков (plots). */
export function renderPlots() {
  plotsLayer.clearLayers();
  if (!state.showPlots) return;
  const allPlots = Object.values(state.plots).flat();
  for (const plot of allPlots) {
    const ptype = (plot.properties && plot.properties.plotType) || 'residential';
    const style = PLOT_STYLES[ptype] || PLOT_STYLES.residential;
    const layer = L.geoJSON(plot, { pane: 'plotsPane', style });

    layer.on('mouseover', () => layer.setStyle(Object.assign({}, style, PLOT_HOVER)));
    layer.on('mouseout',  () => layer.setStyle(style));
    layer.on('click', (e) => {
      if (e.originalEvent) L.DomEvent.stop(e);
      const p = plot.properties;
      if (!p) return;
      L.popup({ className: 'tm-popup' })
        .setLatLng(e.latlng)
        .setContent(
          `<b>Участок ${p.id}</b><br>
           Тип: ${p.plotType}<br>
           Площадь: ${(p.area || 0).toLocaleString('ru-RU')} м²<br>
           Ширина фронта: ${p.frontageWidth || '—'} м<br>
           Глубина: ${p.depth || '—'} м<br>
           Застраиваемая: ${(p.buildableArea || 0).toLocaleString('ru-RU')} м²<br>
           Макс. этажей: ${p.maxFloors || '—'}`
        ).openOn(mapCtx.map);
    });
    layer.addTo(plotsLayer);
  }
}

/** Отрисовка дворов. */
export function renderCourtyards() {
  courtyardsLayer.clearLayers();
  for (const courtyard of Object.values(state.courtyards)) {
    if (!courtyard) continue;
    L.geoJSON(courtyard, {
      pane: 'courtyardsPane',
      style: { color: '#1d6832', weight: 0.8, fillColor: '#27ae60', fillOpacity: 0.22 }
    }).addTo(courtyardsLayer);
  }
}

/** Отрисовка зданий. */
export function renderBuildings() {
  buildingsLayer.clearLayers();
  if (!state.showBuildings) return;
  for (const bld of Object.values(state.buildings)) {
    if (!bld) continue;
    const morph = (bld.properties && bld.properties.morphotype) || 'freestanding';
    const style = BUILDING_STYLES[morph] || BUILDING_STYLES.freestanding;
    const layer = L.geoJSON(bld, { pane: 'buildingsPane', style });

    layer.on('click', (e) => {
      if (e.originalEvent) L.DomEvent.stop(e);
      const p = bld.properties;
      if (!p) return;
      L.popup({ className: 'tm-popup' })
        .setLatLng(e.latlng)
        .setContent(
          `<b>Здание</b><br>
           Морфотип: ${p.morphotype}<br>
           Этажей: ${p.floors}<br>
           Пятно: ${(p.footprintArea || 0).toLocaleString('ru-RU')} м²<br>
           Общая площадь: ${(p.totalFloorArea || 0).toLocaleString('ru-RU')} м²<br>
           Жилая: ${(p.residentialArea || 0).toLocaleString('ru-RU')} м²<br>
           Коммерческая: ${(p.commercialArea || 0).toLocaleString('ru-RU')} м²<br>
           Высота: ${p.height || '—'} м`
        ).openOn(mapCtx.map);
    });
    layer.addTo(buildingsLayer);
  }
}

// Полная перерисовка сгенерированной геометрии.
// Намеренно НЕ эмитит stats:update — вызывающий код (drawTools, loader)
// сам вызывает updateStats() после renderAll(), что исключает двойной пересчёт.
export function renderAll() {
  renderRoads();
  redrawBlocks();
  renderInner();
  renderLabels();
  renderCourtyards();
  renderPlots();
  renderBuildings();
}

export function clearRenderLayers() {
  blocksLayer.clearLayers();
  roadsLayer.clearLayers();
  labelsLayer.clearLayers();
  innerLayer.clearLayers();
  plotsLayer.clearLayers();
  buildingsLayer.clearLayers();
  courtyardsLayer.clearLayers();
  selectedIndex = null;
}
