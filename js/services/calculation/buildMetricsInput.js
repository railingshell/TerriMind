// services/calculation/buildMetricsInput.js — сборка входа для движка ТЭП из описания проекта.
// Чистая функция (без turf/DOM). Превращает список кварталов с площадями и зональными
// параметрами в MetricsInput (в т.ч. синтезирует «здания» из кварталов по нормативам зоны).

import { nonNegative } from '../../domain/units.js';

/**
 * @param {object} proj
 * @property {number} parcelAreaM2
 * @property {object[]} blocks — [{ areaM2, zone, footprintCoef, floors, residentialShare, popCoef }]
 * @property {object} roads — { mainM2, localM2, serviceM2 }
 * @property {object} inner — { sidewalkM2, pathM2 }
 * @property {object} applied — применённые нормативы по категориям { build_coefficient:{value}, floors:{value}, ... }
 * @property {object} params — { areaPerPerson, householdSize, avgFlatM2, dayNightRatio }
 * @property {object} fart — состав КИТ
 * @property {number} regulationExcludedM2, clippedLossM2, conflictAreaM2
 */
export function buildMetricsInput(proj) {
  const p = proj || {};
  const applied = p.applied || {};
  const appliedNum = (cat, def) => {
    const v = applied[cat] && applied[cat].value;
    return Number.isFinite(v) ? v : def;
  };

  const zoneAreaM2 = {};
  const buildings = [];
  let blocksAreaM2 = 0;
  let footprintM2 = 0;
  let greeneryM2 = 0;
  let publicSpaceM2 = 0;
  let commercialM2 = 0;
  let socialM2 = 0;

  for (const b of p.blocks || []) {
    const area = nonNegative(b.areaM2) || 0;
    const zone = b.zone || 'residential';
    blocksAreaM2 += area;
    zoneAreaM2[zone] = (zoneAreaM2[zone] || 0) + area;

    // Норматив застройки: сначала применённое правило, затем зональный параметр блока
    const kz = appliedNum('build_coefficient', b.footprintCoef);
    const floors = appliedNum('floors', b.floors);
    const residShare = Number.isFinite(b.residentialShare) ? b.residentialShare : 0;

    const footprint = area * (Number.isFinite(kz) ? kz : 0);
    footprintM2 += footprint;

    // Синтетическое «здание» квартала
    buildings.push({
      footprintM2: footprint,
      floorAreaM2: footprint * (Number.isFinite(floors) ? floors : 0),
      undergroundM2: nonNegative(b.undergroundM2) || 0,
      residentialShare: residShare,
      floorsAbove: Number.isFinite(floors) ? floors : 0,
      sections: b.sections || 1,
      zone
    });

    // Категоризация площадей по зоне
    if (zone === 'recreation') greeneryM2 += area;
    if (zone === 'public') publicSpaceM2 += area * 0.5;
    if (zone === 'commercial') commercialM2 += footprint * (Number.isFinite(floors) ? floors : 1);
    if (zone === 'special') socialM2 += area;
  }

  const roads = p.roads || {};
  const inner = p.inner || {};

  const designAreaM2 = Math.max(0, (nonNegative(p.parcelAreaM2) || 0) - (nonNegative(p.regulationExcludedM2) || 0));
  const calcTerritoryM2 = designAreaM2;

  return {
    parcelAreaM2: nonNegative(p.parcelAreaM2) || 0,
    designAreaM2,
    calcTerritoryM2,
    blocksAreaM2,
    footprintM2,
    roadsMainM2: nonNegative(roads.mainM2) || 0,
    roadsLocalM2: nonNegative(roads.localM2) || 0,
    roadsServiceM2: nonNegative(roads.serviceM2) || 0,
    sidewalkM2: nonNegative(inner.sidewalkM2) || 0,
    pathM2: nonNegative(inner.pathM2) || 0,
    greeneryM2,
    publicSpaceM2,
    commercialM2,
    socialM2,
    parkingM2: nonNegative(p.parkingM2) || 0,
    parkingSpaces: nonNegative(p.parkingSpaces) || 0,
    clippedLossM2: nonNegative(p.clippedLossM2) || 0,
    regulationExcludedM2: nonNegative(p.regulationExcludedM2) || 0,
    conflictAreaM2: nonNegative(p.conflictAreaM2) || 0,
    zoneAreaM2,
    // Если есть реальные здания — используем их вместо синтетических
    buildings: (p.realBuildings && p.realBuildings.length > 0)
      ? p.realBuildings.map(rb => ({
          footprintM2:     rb.footprintArea   || 0,
          floorAreaM2:     rb.totalFloorArea  || 0,
          residentialArea: rb.residentialArea || 0,
          undergroundM2:   0,
          residentialShare: rb.totalFloorArea > 0
            ? (rb.residentialArea || 0) / rb.totalFloorArea
            : 0,
          floorsAbove:     rb.floors          || 1,
          sections:        1,
          zone:            'residential'
        }))
      : buildings,
    params: p.params || {},
    fart: p.fart || {}
  };
}
