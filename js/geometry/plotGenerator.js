// geometry/plotGenerator.js — генератор земельных участков (plots) внутри кварталов.
// Промпт 1.1: нарезка внутренней зоны квартала на прямоугольные участки с дворами.

import { safeArea, safeIntersect, safeDifference, safeClean, unionAll } from './turfSafe.js';
import { state } from '../core/state.js';
import { emit } from '../core/events.js';
import { getBuildingParams } from '../project/params.js';

const ZONE_PLOT_TYPE = {
  residential: 'residential',
  commercial:  'commercial',
  mixed:       'residential',
  public:      'social',
  recreation:  'green',
  industrial:  'parking',
  special:     'social'
};

// Метры → градусы широты (≈ константа)
const LAT_M = 111000;
// Метры → градусы долготы на заданной широте
function lonM(lat) { return 111000 * Math.cos(lat * Math.PI / 180); }

/** Генерирует земельные участки внутри одного квартала.
 * @param {GeoJSON.Feature} block  – квартал (Polygon)
 * @param {object} params
 * @returns {GeoJSON.Feature[]} массив участков
 */
export function generatePlots(block, params = {}) {
  const bp = getBuildingParams();
  const zone = (block.properties && block.properties.zone) || 'residential';
  const zp   = (bp.zones && bp.zones[zone]) || {};

  const p = Object.assign({
    setbackMain:    bp.setbackMain   ?? 5,
    setbackLocal:   bp.setbackLocal  ?? 3,
    setbackSide:    bp.setbackSide   ?? 2,
    frontageWidth:  zp.frontageWidth ?? 20,
    buildingCoverage: (zp.buildingCoverage ?? 0.3),
    floors:         zp.floors        ?? 9,
    zoneType:       zone
  }, params);

  // 1. Внутренняя зона после отступов
  const setbackKm = Math.max(p.setbackMain, 3) / 1000;
  let innerZone;
  try { innerZone = turf.buffer(block, -setbackKm, { units: 'kilometers' }); } catch (e) { return []; }
  if (!innerZone || safeArea(innerZone) < 200) return [];

  // 2. Размеры bbox внутренней зоны
  const bbox = turf.bbox(innerZone);
  const [minX, minY, maxX, maxY] = bbox;
  const midLat = (minY + maxY) / 2;
  const lm = lonM(midLat);
  const widthM  = (maxX - minX) * lm;
  const heightM = (maxY - minY) * LAT_M;

  const blockId = String((block.properties && block.properties.index) || 'b');

  // 3. Коммерческие = шире
  const fw = p.zoneType === 'commercial' ? Math.max(p.frontageWidth, 35) :
             p.zoneType === 'mixed'      ? p.frontageWidth + 10 : p.frontageWidth;

  // 4. Глубина ряда
  const isLandscape = widthM >= heightM;
  const shortSideM  = Math.min(widthM, heightM);
  const plotDepthM  = Math.max(15, shortSideM / 3);

  const plots = [];
  let plotIdx = 0;

  /**
   * Нарезает полосу (rowPoly) на участки шириной fw метров.
   * isTop определяет сторону (для rowSide).
   */
  function sliceRow(rowPoly, isTop) {
    if (!rowPoly || safeArea(rowPoly) < 50) return;
    const rb = turf.bbox(rowPoly);
    const [rxMin, ryMin, rxMax, ryMax] = rb;

    if (isLandscape) {
      // Нарезаем по X (вертикальные полосы)
      const stepDeg = fw / lm;
      for (let x = rxMin; x < rxMax - stepDeg * 0.05; x += stepDeg) {
        const x2 = Math.min(x + stepDeg, rxMax);
        const rect = turf.polygon([[
          [x, ryMin], [x2, ryMin], [x2, ryMax], [x, ryMax], [x, ryMin]
        ]]);
        let piece = safeIntersect(rect, rowPoly);
        if (!piece || safeArea(piece) < 50) continue;
        piece = safeClean(piece);
        const area = safeArea(piece);
        const pb   = turf.bbox(piece);
        piece.properties = _plotProps(
          `${blockId}_plot_${++plotIdx}`, blockId, p, area,
          (pb[2] - pb[0]) * lm, (pb[3] - pb[1]) * LAT_M,
          isTop ? 'north' : 'south'
        );
        plots.push(piece);
      }
    } else {
      // Нарезаем по Y (горизонтальные полосы)
      const stepDeg = fw / LAT_M;
      for (let y = ryMin; y < ryMax - stepDeg * 0.05; y += stepDeg) {
        const y2 = Math.min(y + stepDeg, ryMax);
        const rect = turf.polygon([[
          [rxMin, y], [rxMax, y], [rxMax, y2], [rxMin, y2], [rxMin, y]
        ]]);
        let piece = safeIntersect(rect, rowPoly);
        if (!piece || safeArea(piece) < 50) continue;
        piece = safeClean(piece);
        const area = safeArea(piece);
        const pb   = turf.bbox(piece);
        piece.properties = _plotProps(
          `${blockId}_plot_${++plotIdx}`, blockId, p, area,
          (pb[2] - pb[0]) * lm, (pb[3] - pb[1]) * LAT_M,
          isTop ? 'east' : 'west'
        );
        plots.push(piece);
      }
    }
  }

  // 5. Создаём две полосы (Север/Юг или Восток/Запад)
  if (isLandscape) {
    const dDeg = plotDepthM / LAT_M;
    const northStrip = turf.polygon([[
      [minX, maxY - dDeg], [maxX, maxY - dDeg], [maxX, maxY], [minX, maxY], [minX, maxY - dDeg]
    ]]);
    const southStrip = turf.polygon([[
      [minX, minY], [maxX, minY], [maxX, minY + dDeg], [minX, minY + dDeg], [minX, minY]
    ]]);
    sliceRow(safeIntersect(northStrip, innerZone), true);
    sliceRow(safeIntersect(southStrip, innerZone), false);
  } else {
    const dDeg = plotDepthM / lm;
    const eastStrip = turf.polygon([[
      [maxX - dDeg, minY], [maxX, minY], [maxX, maxY], [maxX - dDeg, maxY], [maxX - dDeg, minY]
    ]]);
    const westStrip = turf.polygon([[
      [minX, minY], [minX + dDeg, minY], [minX + dDeg, maxY], [minX, maxY], [minX, minY]
    ]]);
    sliceRow(safeIntersect(eastStrip, innerZone), true);
    sliceRow(safeIntersect(westStrip, innerZone), false);
  }

  // 6. Для смешанных зон — чередуем plotType
  if (p.zoneType === 'mixed') {
    plots.forEach((pl, i) => {
      pl.properties.plotType = i % 2 === 0 ? 'residential' : 'commercial';
    });
  }

  return plots;
}

/** Вспомогательная фабрика свойств участка. */
function _plotProps(id, blockId, p, area, fw, depth, rowSide) {
  return {
    id,
    blockId,
    zoneType: p.zoneType,
    area: Math.round(area),
    frontageWidth: Math.round(fw),
    depth: Math.round(depth),
    buildableArea: Math.round(area * (p.buildingCoverage || 0.3)),
    maxFloors: p.floors || 9,
    plotType: ZONE_PLOT_TYPE[p.zoneType] || 'residential',
    rowSide
  };
}

/** Генерирует двор как остаток внутренней зоны после вычитания участков. */
export function generateCourtyard(block, plots, params = {}) {
  const bp = getBuildingParams();
  const setbackKm = Math.max(bp.setbackMain ?? 5, 3) / 1000;

  let innerZone;
  try { innerZone = turf.buffer(block, -setbackKm, { units: 'kilometers' }); } catch (e) { return null; }
  if (!innerZone || safeArea(innerZone) < 100) return null;

  const blockId = String((block.properties && block.properties.index) || 'b');

  if (!plots || plots.length === 0) {
    return Object.assign({}, innerZone, {
      properties: { blockId, type: 'courtyard', area: Math.round(safeArea(innerZone)) }
    });
  }

  // Двор = внутренняя зона − все участки
  let courtyard = innerZone;
  for (const plot of plots) {
    try {
      const d = safeDifference(courtyard, plot);
      if (d) courtyard = d;
    } catch (e) { /* ok */ }
  }

  if (!courtyard || safeArea(courtyard) < 20) return null;

  courtyard = safeClean(courtyard) || courtyard;
  courtyard.properties = {
    blockId,
    type: 'courtyard',
    area: Math.round(safeArea(courtyard))
  };
  return courtyard;
}

/** Полная регенерация участков и дворов для всех кварталов. */
export function regenerateAllPlots() {
  state.plots = {};
  state.courtyards = {};

  for (const block of state.blocks) {
    const blockId = String((block.properties && block.properties.index) || 'b');
    const zone = (block.properties && block.properties.zone) || 'residential';
    const bp = getBuildingParams();
    const zp = (bp.zones && bp.zones[zone]) || {};

    const plots = generatePlots(block, {
      zoneType: zone,
      frontageWidth: zp.frontageWidth,
      buildingCoverage: zp.buildingCoverage,
      floors: zp.floors
    });
    state.plots[blockId] = plots;

    const courtyard = generateCourtyard(block, plots);
    if (courtyard) state.courtyards[blockId] = courtyard;
  }

  emit('plots:updated');
}
