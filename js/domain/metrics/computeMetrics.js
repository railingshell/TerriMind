// domain/metrics/computeMetrics.js — ЕДИНЫЙ движок ТЭП (чистое ядро).
// Вход: нормализованный снимок проекта (areas + params + regulation), уже извлечённый из геометрии
// в services/calculation. Здесь только арифметика, без turf/DOM/Electron.
//
// Прозрачно реализует:
//   Коэффициент застройки  = Σ пятен застройки / расчётная площадь территории
//   Коэффициент использования (КИТ) = Σ учитываемых этажных площадей / расчётная площадь территории
// Состав учитываемых площадей КИТ настраивается (fartComposition).

import { makeMetric, METRIC_CATEGORY, VALIDITY, COMPLIANCE } from './metricSchema.js';
import { safeDivide, m2ToHa, nonNegative } from '../units.js';

/**
 * @typedef {object} MetricsInput
 * @property {number} parcelAreaM2            площадь исходного участка
 * @property {number} designAreaM2            площадь в границах проектирования (обычно = parcel − исключённое)
 * @property {number} calcTerritoryM2         расчётная площадь территории (знаменатель КЗ/КИТ)
 * @property {number} blocksAreaM2            суммарная площадь кварталов
 * @property {number} footprintM2             суммарная площадь пятен застройки
 * @property {number} roadsMainM2
 * @property {number} roadsLocalM2
 * @property {number} roadsServiceM2
 * @property {number} sidewalkM2
 * @property {number} pathM2
 * @property {number} greeneryM2
 * @property {number} parkingM2
 * @property {number} clippedLossM2           площадь, потерянная при геометрической обрезке
 * @property {number} regulationExcludedM2    площадь, исключённая нормативами
 * @property {number} conflictAreaM2          площадь участков с конфликтами
 * @property {object} zoneAreaM2              { zoneKey: area }
 * @property {object[]} buildings             [{ footprintM2, floorsAbove, floorsBelow, floorAreaM2, undergroundM2, residentialShare, popCoef, zone }]
 * @property {object} params                  { areaPerPerson, dayNightRatio, householdSize, avgFlatM2 }
 * @property {object} fart                    { includeUnderground, includeParking, includeTechFloors, includeMainOnly }
 */

const DEFAULT_FART = Object.freeze({
  includeUnderground: false,
  includeParking: false,
  includeTechFloors: true,
  includeMainOnly: false
});

/**
 * Собирает надземную/подземную/учитываемую площадь по зданиям согласно составу КИТ.
 */
export function aggregateBuildings(buildings, fart) {
  const f = Object.assign({}, DEFAULT_FART, fart || {});
  let above = 0, below = 0, living = 0, nonLiving = 0, counted = 0;
  let floorsSum = 0, floorsMax = -Infinity, floorsMin = Infinity, count = 0, sections = 0;
  let footprint = 0;

  for (const b of buildings || []) {
    const fa = nonNegative(b.floorAreaM2) || 0;          // надземная поэтажная площадь
    const under = nonNegative(b.undergroundM2) || 0;     // подземная
    const rShare = Math.min(Math.max(b.residentialShare ?? 0, 0), 1);
    const fp = nonNegative(b.footprintM2) || 0;

    above += fa;
    below += under;
    footprint += fp;
    living += fa * rShare;
    nonLiving += fa * (1 - rShare);

    // Состав учитываемой площади КИТ
    let c = fa;
    if (f.includeUnderground) c += under;
    if (!f.includeParking) c -= (nonNegative(b.parkingFloorM2) || 0);
    if (f.includeMainOnly) c = (nonNegative(b.mainRoomsM2) || fa); // только основные помещения, если заданы
    counted += Math.max(c, 0);

    const fl = Number.isFinite(b.floorsAbove) ? b.floorsAbove : 0;
    if (fl > 0) {
      floorsSum += fl; count += 1;
      if (fl > floorsMax) floorsMax = fl;
      if (fl < floorsMin) floorsMin = fl;
    }
    sections += Number.isFinite(b.sections) ? b.sections : 1;
  }

  return {
    aboveM2: above,
    belowM2: below,
    livingM2: living,
    nonLivingM2: nonLiving,
    countedFloorAreaM2: counted,
    footprintM2: footprint,
    avgFloors: count ? floorsSum / count : null,
    maxFloors: count ? floorsMax : null,
    minFloors: count ? floorsMin : null,
    buildingCount: count,
    sections
  };
}

/**
 * Главный расчёт ТЭП. Возвращает { metrics: Metric[], byId: {id: Metric} }.
 * Никогда не возвращает NaN/Infinity/отрицательных значений — вместо этого validity-статус.
 */
export function computeMetrics(input) {
  const inp = input || {};
  const params = inp.params || {};
  const fart = Object.assign({}, DEFAULT_FART, inp.fart || {});
  const metrics = [];
  const add = (m) => { metrics.push(m); return m; };

  const parcelM2 = nonNegative(inp.parcelAreaM2);
  const designM2 = nonNegative(inp.designAreaM2 ?? inp.parcelAreaM2);
  const calcTerr = nonNegative(inp.calcTerritoryM2 ?? inp.designAreaM2 ?? inp.parcelAreaM2);
  const bAgg = aggregateBuildings(inp.buildings, fart);
  const footprint = nonNegative(inp.footprintM2 ?? bAgg.footprintM2) || 0;

  // ── Территория ──
  add(makeMetric({
    id: 'parcel_area_m2', label: 'Площадь участка', category: METRIC_CATEGORY.TERRITORY,
    unit: 'м²', raw: parcelM2, dependencies: ['parcelGeometry'],
    calcSource: 'geometry', formula: 'geodesicArea(parcel)',
    explanation: 'Геодезическая площадь границы участка.'
  }));
  add(makeMetric({
    id: 'parcel_area_ha', label: 'Площадь участка', category: METRIC_CATEGORY.TERRITORY,
    unit: 'га', raw: m2ToHa(parcelM2), digits: 4, dependencies: ['parcel_area_m2'],
    formula: 'parcelAreaM2 / 10000', numerator: parcelM2, denominator: 10000
  }));
  add(makeMetric({
    id: 'design_area_m2', label: 'Площадь в границах проектирования', category: METRIC_CATEGORY.TERRITORY,
    unit: 'м²', raw: designM2, dependencies: ['parcelGeometry', 'regulationExcluded']
  }));
  add(makeMetric({
    id: 'calc_territory_m2', label: 'Расчётная площадь территории', category: METRIC_CATEGORY.TERRITORY,
    unit: 'м²', raw: calcTerr, dependencies: ['design_area_m2'],
    explanation: 'Знаменатель коэффициентов застройки и использования территории.'
  }));
  add(makeMetric({
    id: 'blocks_area_m2', label: 'Площадь кварталов', category: METRIC_CATEGORY.TERRITORY,
    unit: 'м²', raw: nonNegative(inp.blocksAreaM2), dependencies: ['blocksGeometry']
  }));
  add(makeMetric({
    id: 'footprint_area_m2', label: 'Площадь пятен застройки', category: METRIC_CATEGORY.TERRITORY,
    unit: 'м²', raw: footprint, dependencies: ['buildings']
  }));

  const roadsMain = nonNegative(inp.roadsMainM2) || 0;
  const roadsLocal = nonNegative(inp.roadsLocalM2) || 0;
  const roadsService = nonNegative(inp.roadsServiceM2) || 0;
  const sidewalk = nonNegative(inp.sidewalkM2) || 0;
  const path = nonNegative(inp.pathM2) || 0;
  const streetsM2 = roadsLocal;
  const roadsTotal = roadsMain + roadsLocal + roadsService;

  add(makeMetric({ id: 'roads_main_m2', label: 'Площадь магистралей', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: roadsMain, dependencies: ['roads'] }));
  add(makeMetric({ id: 'roads_streets_m2', label: 'Площадь улиц', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: streetsM2, dependencies: ['roads'] }));
  add(makeMetric({ id: 'roads_service_m2', label: 'Площадь проездов', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: roadsService, dependencies: ['roads'] }));
  add(makeMetric({ id: 'roads_total_m2', label: 'Площадь УДС', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: roadsTotal, formula: 'main + streets + service', dependencies: ['roads'] }));
  add(makeMetric({ id: 'sidewalk_area_m2', label: 'Площадь тротуаров', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: sidewalk, dependencies: ['inner'] }));
  add(makeMetric({ id: 'path_area_m2', label: 'Площадь пешеходных маршрутов', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: path, dependencies: ['inner'] }));
  add(makeMetric({ id: 'greenery_area_m2', label: 'Площадь озеленения', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: nonNegative(inp.greeneryM2) || 0, dependencies: ['zones'] }));
  add(makeMetric({ id: 'public_space_m2', label: 'Площадь общественных пространств', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: nonNegative(inp.publicSpaceM2) || 0, dependencies: ['zones'] }));
  add(makeMetric({ id: 'parking_area_m2', label: 'Площадь парковок', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: nonNegative(inp.parkingM2) || 0, dependencies: ['zones'] }));
  add(makeMetric({ id: 'social_area_m2', label: 'Площадь территорий соц. объектов', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: nonNegative(inp.socialM2) || 0, dependencies: ['zones'] }));
  add(makeMetric({ id: 'clipped_loss_m2', label: 'Потеряно при обрезке', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: nonNegative(inp.clippedLossM2) || 0, dependencies: ['geometry'] }));
  add(makeMetric({ id: 'regulation_excluded_m2', label: 'Исключено нормативами', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: nonNegative(inp.regulationExcludedM2) || 0, dependencies: ['regulation'] }));
  add(makeMetric({ id: 'conflict_area_m2', label: 'Площадь конфликтов', category: METRIC_CATEGORY.TERRITORY, unit: 'м²', raw: nonNegative(inp.conflictAreaM2) || 0, dependencies: ['regulation'] }));

  // Зоны по типам
  const zoneAreaM2 = inp.zoneAreaM2 || {};
  const zoneTotal = Object.values(zoneAreaM2).reduce((s, v) => s + (nonNegative(v) || 0), 0);
  for (const [zone, area] of Object.entries(zoneAreaM2)) {
    add(makeMetric({
      id: 'zone_area_' + zone, label: 'Зона: ' + zone, category: METRIC_CATEGORY.TERRITORY,
      unit: 'м²', raw: nonNegative(area) || 0, dependencies: ['zones'],
      explanation: 'Суммарная площадь кварталов функциональной зоны «' + zone + '».'
    }));
    const share = safeDivide((nonNegative(area) || 0) * 100, zoneTotal);
    add(makeMetric({
      id: 'zone_share_' + zone, label: 'Доля зоны: ' + zone, category: METRIC_CATEGORY.BALANCE,
      unit: '%', raw: share, digits: 1, dependencies: ['zones'],
      formula: 'zoneArea / Σzones · 100', numerator: area, denominator: zoneTotal,
      validity: share === null ? VALIDITY.DIVISION_BY_ZERO : VALIDITY.VALID
    }));
  }

  // ── Застройка ──
  add(makeMetric({ id: 'total_building_m2', label: 'Общая площадь зданий', category: METRIC_CATEGORY.BUILDING, unit: 'м²', raw: bAgg.aboveM2 + bAgg.belowM2, formula: 'надземная + подземная', dependencies: ['buildings'] }));
  add(makeMetric({ id: 'above_ground_m2', label: 'Надземная площадь', category: METRIC_CATEGORY.BUILDING, unit: 'м²', raw: bAgg.aboveM2, dependencies: ['buildings'] }));
  add(makeMetric({ id: 'underground_m2', label: 'Подземная площадь', category: METRIC_CATEGORY.BUILDING, unit: 'м²', raw: bAgg.belowM2, dependencies: ['buildings'] }));
  add(makeMetric({ id: 'living_m2', label: 'Жилая площадь', category: METRIC_CATEGORY.BUILDING, unit: 'м²', raw: bAgg.livingM2, dependencies: ['buildings'] }));
  add(makeMetric({ id: 'non_living_m2', label: 'Нежилая площадь', category: METRIC_CATEGORY.BUILDING, unit: 'м²', raw: bAgg.nonLivingM2, dependencies: ['buildings'] }));
  add(makeMetric({ id: 'commercial_m2', label: 'Коммерческая площадь', category: METRIC_CATEGORY.BUILDING, unit: 'м²', raw: nonNegative(inp.commercialM2) || 0, dependencies: ['zones'] }));
  add(makeMetric({ id: 'building_count', label: 'Количество зданий', category: METRIC_CATEGORY.BUILDING, unit: 'шт', raw: bAgg.buildingCount, dependencies: ['buildings'] }));
  add(makeMetric({ id: 'sections_count', label: 'Количество секций', category: METRIC_CATEGORY.BUILDING, unit: 'шт', raw: bAgg.sections, dependencies: ['buildings'] }));
  add(makeMetric({ id: 'avg_floors', label: 'Средняя этажность', category: METRIC_CATEGORY.BUILDING, unit: 'эт', digits: 1, raw: bAgg.avgFloors, dependencies: ['buildings'] }));
  add(makeMetric({ id: 'max_floors', label: 'Макс. этажность', category: METRIC_CATEGORY.BUILDING, unit: 'эт', raw: bAgg.maxFloors, dependencies: ['buildings'] }));
  add(makeMetric({ id: 'min_floors', label: 'Мин. этажность', category: METRIC_CATEGORY.BUILDING, unit: 'эт', raw: bAgg.minFloors, dependencies: ['buildings'] }));

  // ── Коэффициент застройки (прозрачно) ──
  const buildCoefRaw = safeDivide(footprint, calcTerr);
  add(makeMetric({
    id: 'build_coefficient', label: 'Коэффициент застройки', category: METRIC_CATEGORY.COEFFICIENT,
    unit: '', digits: 3, raw: buildCoefRaw,
    formula: 'Σ пятен застройки / расчётная площадь территории',
    numerator: footprint, denominator: calcTerr,
    displayFormat: '{value}',
    dependencies: ['footprint_area_m2', 'calc_territory_m2'],
    validity: buildCoefRaw === null ? VALIDITY.DIVISION_BY_ZERO : VALIDITY.VALID,
    explanation: 'Отношение суммарной площади пятен застройки к расчётной площади территории.'
  }));

  // ── Коэффициент использования территории (КИТ / FAR), настраиваемый состав ──
  const fartRaw = safeDivide(bAgg.countedFloorAreaM2, calcTerr);
  const fartComposition = [
    'надземная',
    fart.includeUnderground ? '+ подземная' : null,
    fart.includeParking ? '+ парковки' : '− парковки',
    fart.includeMainOnly ? '(только основные помещения)' : null,
    fart.includeTechFloors ? null : '(без тех. этажей)'
  ].filter(Boolean).join(' ');
  add(makeMetric({
    id: 'floor_area_ratio', label: 'Коэффициент использования территории', category: METRIC_CATEGORY.COEFFICIENT,
    unit: '', digits: 3, raw: fartRaw,
    formula: 'Σ учитываемых этажных площадей / расчётная площадь территории',
    numerator: bAgg.countedFloorAreaM2, denominator: calcTerr,
    displayFormat: '{value}',
    dependencies: ['above_ground_m2', 'calc_territory_m2', 'fartComposition'],
    validity: fartRaw === null ? VALIDITY.DIVISION_BY_ZERO : VALIDITY.VALID,
    explanation: 'Состав учитываемых площадей: ' + (fartComposition || 'надземная') + '.'
  }));

  // Коэф. интенсивности использования (учитывает подземную всегда)
  const kitiRaw = safeDivide(bAgg.aboveM2 + bAgg.belowM2, calcTerr);
  add(makeMetric({
    id: 'intensity_coefficient', label: 'Коэф. интенсивности использования', category: METRIC_CATEGORY.COEFFICIENT,
    unit: '', digits: 3, raw: kitiRaw, displayFormat: '{value}',
    formula: '(надземная + подземная) / расчётная площадь территории',
    numerator: bAgg.aboveM2 + bAgg.belowM2, denominator: calcTerr,
    validity: kitiRaw === null ? VALIDITY.DIVISION_BY_ZERO : VALIDITY.VALID
  }));

  // Плотность застройки (% застройки)
  const buildDensity = safeDivide(footprint * 100, calcTerr);
  add(makeMetric({
    id: 'build_density', label: 'Плотность застройки', category: METRIC_CATEGORY.COEFFICIENT,
    unit: '%', digits: 1, raw: buildDensity,
    formula: 'Σ пятен застройки / расчётная площадь территории · 100',
    numerator: footprint, denominator: calcTerr,
    validity: buildDensity === null ? VALIDITY.DIVISION_BY_ZERO : VALIDITY.VALID
  }));

  // Отношение площади зданий к площади участка
  add(makeMetric({
    id: 'building_to_parcel', label: 'Здания / участок', category: METRIC_CATEGORY.COEFFICIENT,
    unit: '', digits: 3, raw: safeDivide(bAgg.aboveM2, parcelM2), displayFormat: '{value}',
    numerator: bAgg.aboveM2, denominator: parcelM2, formula: 'надземная / площадь участка'
  }));

  // ── Население и обеспеченность ──
  const areaPerPerson = Number.isFinite(params.areaPerPerson) && params.areaPerPerson > 0 ? params.areaPerPerson : 30;
  const population = safeDivide(bAgg.livingM2, areaPerPerson);
  add(makeMetric({
    id: 'population', label: 'Расчётное население', category: METRIC_CATEGORY.POPULATION,
    unit: 'чел.', raw: population,
    formula: 'жилая площадь / норма на человека',
    numerator: bAgg.livingM2, denominator: areaPerPerson,
    dependencies: ['living_m2', 'params.areaPerPerson'],
    validity: population === null ? VALIDITY.DIVISION_BY_ZERO : VALIDITY.VALID
  }));

  const dayNightRatio = Number.isFinite(params.dayNightRatio) ? params.dayNightRatio : 1.15;
  add(makeMetric({ id: 'population_permanent', label: 'Постоянное население', category: METRIC_CATEGORY.POPULATION, unit: 'чел.', raw: population, dependencies: ['population'] }));
  add(makeMetric({ id: 'population_day', label: 'Дневное население', category: METRIC_CATEGORY.POPULATION, unit: 'чел.', raw: population === null ? null : population * dayNightRatio, formula: 'население · дневной коэффициент', dependencies: ['population'] }));

  const householdSize = Number.isFinite(params.householdSize) && params.householdSize > 0 ? params.householdSize : 2.5;
  add(makeMetric({ id: 'households', label: 'Домохозяйства', category: METRIC_CATEGORY.POPULATION, unit: 'шт', raw: population === null ? null : population / householdSize, numerator: population, denominator: householdSize, dependencies: ['population'] }));

  const avgFlatM2 = Number.isFinite(params.avgFlatM2) && params.avgFlatM2 > 0 ? params.avgFlatM2 : 55;
  add(makeMetric({ id: 'flats', label: 'Кол-во квартир (≈)', category: METRIC_CATEGORY.POPULATION, unit: 'шт', raw: safeDivide(bAgg.livingM2, avgFlatM2), numerator: bAgg.livingM2, denominator: avgFlatM2, dependencies: ['living_m2'] }));

  // Плотность населения
  const parcelHa = m2ToHa(calcTerr);
  const popDensity = population === null ? null : safeDivide(population, parcelHa);
  add(makeMetric({
    id: 'population_density', label: 'Плотность населения', category: METRIC_CATEGORY.POPULATION,
    unit: 'чел./га', raw: popDensity, digits: 1,
    formula: 'население / расчётная площадь (га)',
    numerator: population, denominator: parcelHa,
    dependencies: ['population', 'calc_territory_m2'],
    validity: popDensity === null ? VALIDITY.DIVISION_BY_ZERO : VALIDITY.VALID
  }));

  // Обеспеченность
  add(makeMetric({ id: 'living_provision', label: 'Обеспеченность жильём', category: METRIC_CATEGORY.POPULATION, unit: 'м²/чел.', digits: 1, raw: safeDivide(bAgg.livingM2, population), numerator: bAgg.livingM2, denominator: population }));
  add(makeMetric({ id: 'greenery_provision', label: 'Обеспеченность озеленением', category: METRIC_CATEGORY.POPULATION, unit: 'м²/чел.', digits: 1, raw: safeDivide(nonNegative(inp.greeneryM2) || 0, population), numerator: inp.greeneryM2, denominator: population }));
  add(makeMetric({ id: 'parking_provision', label: 'Обеспеченность парковками', category: METRIC_CATEGORY.POPULATION, unit: 'мест/чел.', digits: 3, raw: safeDivide(nonNegative(inp.parkingSpaces) || 0, population), numerator: inp.parkingSpaces, denominator: population }));
  add(makeMetric({ id: 'public_provision', label: 'Обеспеченность обществ. простр.', category: METRIC_CATEGORY.POPULATION, unit: 'м²/чел.', digits: 1, raw: safeDivide(nonNegative(inp.publicSpaceM2) || 0, population), numerator: inp.publicSpaceM2, denominator: population }));

  // ── Баланс территории ──
  const accountedM2 = (nonNegative(inp.blocksAreaM2) || 0) + roadsTotal + (nonNegative(inp.greeneryM2) || 0) + sidewalk + path + (nonNegative(inp.publicSpaceM2) || 0);
  add(makeMetric({
    id: 'territory_balance', label: 'Баланс территории (учтено)', category: METRIC_CATEGORY.BALANCE,
    unit: '%', digits: 1, raw: safeDivide(accountedM2 * 100, calcTerr),
    formula: '(кварталы + УДС + озеленение + пешеходные) / расч. территория · 100',
    numerator: accountedM2, denominator: calcTerr,
    dependencies: ['blocks_area_m2', 'roads_total_m2', 'greenery_area_m2']
  }));

  const byId = {};
  for (const m of metrics) byId[m.id] = m;
  return { metrics, byId };
}
