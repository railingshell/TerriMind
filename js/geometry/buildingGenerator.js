// geometry/buildingGenerator.js — генератор пятен зданий (building footprints).
// Промпт 1.2: для каждого участка генерирует здание по морфотипу.

import { safeArea, safeIntersect, safeDifference, safeClean } from './turfSafe.js';
import { state } from '../core/state.js';
import { emit } from '../core/events.js';
import { getBuildingParams } from '../project/params.js';

const KM = { units: 'kilometers' };

/** Дефолтные параметры по морфотипу и зоне. */
export function getMorphotypeDefaults(morphotype, zoneType) {
  const base = {
    perimeter:    { frontSetback: 0, sideSetback: 3, rearSetback: 4, coverageRatio: 0.55 },
    freestanding: { frontSetback: 3, sideSetback: 4, rearSetback: 6, coverageRatio: 0.40 },
    tower:        { frontSetback: 5, sideSetback: 8, rearSetback: 8, coverageRatio: 0.20 },
    section:      { frontSetback: 2, sideSetback: 4, rearSetback: 6, coverageRatio: 0.45 },
    courtyard:    { frontSetback: 0, sideSetback: 3, rearSetback: 0, coverageRatio: 0.50 }
  }[morphotype] || { frontSetback: 3, sideSetback: 4, rearSetback: 6, coverageRatio: 0.40 };

  // Коммерческая — более плотная застройка
  if (zoneType === 'commercial') {
    base.coverageRatio = Math.min(base.coverageRatio + 0.1, 0.7);
    base.frontSetback  = 0;
  }
  return base;
}

/**
 * Генерирует пятно здания для одного участка.
 * @param {GeoJSON.Feature} plot   — земельный участок
 * @param {object} params          — { morphotype, floors, buildingCoverage, residentialShare, commercialShare, frontSetback, sideSetback, rearSetback }
 * @returns {GeoJSON.Feature | null}
 */
export function generateBuilding(plot, params = {}) {
  const pp = plot.properties || {};
  const bp = getBuildingParams();
  const zone = pp.zoneType || 'residential';
  const zp   = (bp.zones && bp.zones[zone]) || {};

  const morphotype      = params.morphotype      ?? zp.morphotype      ?? 'section';
  const floors          = params.floors          ?? zp.floors          ?? 9;
  const residShare      = (params.residentialShare ?? (zp.residShare ?? 75)) / 100;
  const commShare       = (params.commercialShare  ?? (zp.commShare  ?? 10)) / 100;
  const defs            = getMorphotypeDefaults(morphotype, zone);
  const frontSetback    = params.frontSetback ?? defs.frontSetback;
  const sideSetback     = params.sideSetback  ?? defs.sideSetback;
  const rearSetback     = params.rearSetback  ?? defs.rearSetback;

  // Минимальный равномерный отступ для буфера
  const minSetback = Math.max(1, Math.min(frontSetback, sideSetback));
  const bufKm = minSetback / 1000;

  let buildable;
  try { buildable = turf.buffer(plot, -bufKm, KM); } catch (e) { return null; }
  if (!buildable || safeArea(buildable) < 10) return null;

  const bbox = turf.bbox(buildable);
  const [minX, minY, maxX, maxY] = bbox;
  const midLat = (minY + maxY) / 2;
  const LAT_M = 111000;
  const LON_M = 111000 * Math.cos(midLat * Math.PI / 180);
  const wM = (maxX - minX) * LON_M;
  const hM = (maxY - minY) * LAT_M;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let footprint = null;

  switch (morphotype) {

    case 'freestanding': {
      // Здание занимает всю buildable зону (уже обрезанную по отступам)
      footprint = buildable;
      break;
    }

    case 'perimeter': {
      // Здание по периметру: кольцо толщиной buildingDepthM
      const buildingDepthM = Math.max(6, Math.min(wM, hM) * 0.25);
      let inner;
      try { inner = turf.buffer(buildable, -(buildingDepthM / 1000), KM); } catch (e) {}
      if (inner && safeArea(inner) > 20) {
        const diff = safeDifference(buildable, inner);
        footprint = diff || buildable;
      } else {
        footprint = buildable;
      }
      break;
    }

    case 'tower': {
      // Башня: квадрат 15–20% площади участка в центре
      const plotArea = safeArea(plot);
      const towerArea = plotArea * 0.18;
      const side = Math.sqrt(towerArea); // м
      const hsDegLon = (side / 2) / LON_M;
      const hsDegLat = (side / 2) / LAT_M;
      const raw = turf.polygon([[
        [cx - hsDegLon, cy - hsDegLat],
        [cx + hsDegLon, cy - hsDegLat],
        [cx + hsDegLon, cy + hsDegLat],
        [cx - hsDegLon, cy + hsDegLat],
        [cx - hsDegLon, cy - hsDegLat]
      ]]);
      footprint = safeIntersect(raw, plot) || raw;
      break;
    }

    case 'section': {
      // Секционный дом: прямоугольник с соотношением 1:4–1:6
      const ratio = 5; // ширина : длина
      let sw, sh;
      if (wM >= hM) {
        // длинная ось E–W
        sw = Math.min(wM * 0.9, hM * ratio) / LON_M / 2;
        sh = Math.min(hM * 0.7, wM / ratio) / LAT_M / 2;
      } else {
        // длинная ось N–S
        sw = Math.min(wM * 0.7, hM / ratio) / LON_M / 2;
        sh = Math.min(hM * 0.9, wM * ratio) / LAT_M / 2;
      }
      sw = Math.max(sw, 3 / LON_M);
      sh = Math.max(sh, 3 / LAT_M);
      const raw = turf.polygon([[
        [cx - sw, cy - sh], [cx + sw, cy - sh],
        [cx + sw, cy + sh], [cx - sw, cy + sh],
        [cx - sw, cy - sh]
      ]]);
      footprint = safeIntersect(raw, buildable) || raw;
      break;
    }

    case 'courtyard': {
      // П-образное здание: buildable минус открытый двор с одной стороны
      const rowSide = pp.rowSide || 'north';
      const openFraction = 0.45; // доля открытой стороны по ширине
      const depthFraction = 0.5; // как далеко заходит двор

      const ow = (maxX - minX) * openFraction;
      const ox = cx - ow / 2;

      let holeRect;
      if (rowSide === 'north' || rowSide === 'east') {
        const hBottom = minY + (maxY - minY) * (1 - depthFraction);
        holeRect = turf.polygon([[
          [ox, hBottom], [ox + ow, hBottom],
          [ox + ow, maxY], [ox, maxY],
          [ox, hBottom]
        ]]);
      } else {
        const hTop = minY + (maxY - minY) * depthFraction;
        holeRect = turf.polygon([[
          [ox, minY], [ox + ow, minY],
          [ox + ow, hTop], [ox, hTop],
          [ox, minY]
        ]]);
      }
      const diff = safeDifference(buildable, holeRect);
      footprint = diff || buildable;
      break;
    }

    default:
      footprint = buildable;
  }

  if (!footprint) return null;
  footprint = safeClean(footprint) || footprint;
  const footprintArea = safeArea(footprint);
  if (footprintArea < 10) return null;

  const totalFloorArea = footprintArea * floors;
  footprint.properties = {
    id:              `${pp.id || 'p'}_bld`,
    plotId:          pp.id || '',
    blockId:         pp.blockId || '',
    morphotype,
    floors,
    footprintArea:   Math.round(footprintArea),
    totalFloorArea:  Math.round(totalFloorArea),
    residentialArea: Math.round(totalFloorArea * residShare),
    commercialArea:  Math.round(totalFloorArea * commShare),
    height:          floors * 3.0
  };
  return footprint;
}

/** Генерирует здания для всех участков в state.plots. */
export function generateAllBuildings() {
  state.buildings = {};

  const bp = getBuildingParams();

  for (const [blockId, plots] of Object.entries(state.plots)) {
    // Определяем зону из первого участка
    for (const plot of plots) {
      const zone = (plot.properties && plot.properties.zoneType) || 'residential';
      const zp   = (bp.zones && bp.zones[zone]) || {};

      const bld = generateBuilding(plot, {
        morphotype:       zp.morphotype       ?? 'section',
        floors:           zp.floors           ?? 9,
        residentialShare: zp.residShare       ?? 75,
        commercialShare:  zp.commShare        ?? 10,
        frontSetback:     zp.frontSetback     ?? 3,
        sideSetback:      zp.sideSetback      ?? 4,
        rearSetback:      zp.rearSetback      ?? 6
      });
      if (bld) {
        state.buildings[bld.properties.plotId] = bld;
      }
    }
  }

  emit('buildings:updated');
}
