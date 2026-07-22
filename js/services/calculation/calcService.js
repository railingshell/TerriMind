// services/calculation/calcService.js — оркестратор расчёта ТЭП в renderer.
// Читает геометрию (state + turf/Leaflet), собирает описание проекта, вызывает ЕДИНЫЙ движок
// (domain/metrics), сохраняет результат и эмитит 'metrics:update'. Не содержит формул —
// вся арифметика в domain. Заменяет расчётную логику stats.js.

import { state } from '../../core/state.js';
import { safeArea } from '../../geometry/turfSafe.js';
import { ZONES, zoneOf } from '../../zones/zoneConfig.js';
import { emit } from '../../core/events.js';
import { getNum } from '../../core/dom.js';
import { buildMetricsInput } from './buildMetricsInput.js';
import { computeMetrics } from '../../domain/metrics/computeMetrics.js';
import { getRegModel } from '../../renderer/features/regulations/regModel.js';
import { getBuildingParams } from '../../project/params.js';

// Последний результат расчёта (для UI/экспорта/экономики)
let lastMetrics = null;
export function getMetrics() { return lastMetrics; }
export function getMetric(id) { return lastMetrics && lastMetrics.byId[id]; }

/** Геодезическая площадь участка (Leaflet, фолбэк turf). */
export function parcelAreaM2() {
  if (!state.parcel) return 0;
  try {
    const latlngs = state.parcel.getLatLngs()[0];
    return L.GeometryUtil.geodesicArea(latlngs);
  } catch (e) {
    return state.parcelFeature ? safeArea(state.parcelFeature) : 0;
  }
}

/** Собирает описание проекта из состояния для передачи в движок ТЭП. */
export function collectProject() {
  const reg = getRegModel();
  const applied = reg ? reg.appliedMap() : {};
  const manualFallback = {
    footprintCoef: getNum('buildCoef', 0.25),
    floors: getNum('floors', 9),
    residShare: getNum('residShare', 0.7)
  };

  const blocks = state.blocks.map((b) => {
    const zone = zoneOf(b);
    const zc = ZONES[zone] || ZONES.residential;
    return {
      areaM2: safeArea(b),
      zone,
      // приоритет: зональный норматив -> ручной ввод
      footprintCoef: Number.isFinite(zc.buildCoef) ? zc.buildCoef : manualFallback.footprintCoef,
      floors: Number.isFinite(zc.floors) ? zc.floors : manualFallback.floors,
      residentialShare: Number.isFinite(zc.residShare) ? zc.residShare * (zc.popCoef ?? 1) : manualFallback.residShare,
      popCoef: zc.popCoef ?? 1
    };
  });

  let sidewalkM2 = 0, pathM2 = 0;
  for (const f of state.innerRoads || []) {
    const a = safeArea(f);
    if (f.properties && f.properties.kind === 'sidewalk') sidewalkM2 += a; else pathM2 += a;
  }

  return {
    parcelAreaM2: parcelAreaM2(),
    blocks,
    roads: {
      mainM2: state.roadsMain ? safeArea(state.roadsMain) : 0,
      localM2: state.roadsLocal ? safeArea(state.roadsLocal) : 0,
      serviceM2: state.roadsService ? safeArea(state.roadsService) : 0
    },
    inner: { sidewalkM2, pathM2 },
    applied,
    params: {
      areaPerPerson: getNum('areaPerPerson', 30),
      householdSize: getNum('householdSize', 2.5),
      avgFlatM2: getNum('avgFlatM2', 55),
      dayNightRatio: 1.15,
      apartmentMix: getBuildingParams().apartmentMix
    },
    fart: reg ? reg.fartComposition() : {},
    // Реальные здания (если были сгенерированы в buildingGenerator)
    realBuildings: Object.values(state.buildings).filter(Boolean).map(bld => {
      const p = bld.properties || {};
      return {
        footprintArea:   p.footprintArea   || 0,
        totalFloorArea:  p.totalFloorArea  || 0,
        residentialArea: p.residentialArea || 0,
        commercialArea:  p.commercialArea  || 0,
        floors:          p.floors          || 1,
        blockId:         p.blockId         || ''
      };
    })
  };
}

/** Полный пересчёт ТЭП. Возвращает { metrics, byId }. Эмитит 'metrics:update'. */
export function recalcMetrics() {
  const project = collectProject();
  const input = buildMetricsInput(project);
  lastMetrics = computeMetrics(input);
  emit('metrics:update', lastMetrics);
  return lastMetrics;
}
