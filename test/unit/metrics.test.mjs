import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, aggregateBuildings } from '../../js/domain/metrics/computeMetrics.js';

function get(res, id) { return res.byId[id]; }

test('empty project: no NaN/Infinity, no_data statuses', () => {
  const res = computeMetrics({});
  for (const m of res.metrics) {
    assert.ok(m.raw === null || Number.isFinite(m.raw), `${m.id} raw finite or null`);
    assert.ok(m.rounded === null || Number.isFinite(m.rounded), `${m.id} rounded finite or null`);
    assert.ok(!(typeof m.raw === 'number' && m.raw < 0), `${m.id} not negative`);
  }
  assert.equal(get(res, 'population').raw, 0, 'empty = genuine zero people');
  assert.equal(get(res, 'build_coefficient').validity, 'division_by_zero');
});

test('parcel area m2 + ha', () => {
  const res = computeMetrics({ parcelAreaM2: 20000 });
  assert.equal(get(res, 'parcel_area_m2').raw, 20000);
  assert.equal(get(res, 'parcel_area_ha').raw, 2);
});

test('build coefficient = footprint / calc territory (transparent)', () => {
  const res = computeMetrics({
    parcelAreaM2: 10000, calcTerritoryM2: 10000, footprintM2: 2500
  });
  const kz = get(res, 'build_coefficient');
  assert.equal(kz.raw, 0.25);
  assert.equal(kz.numerator, 2500);
  assert.equal(kz.denominator, 10000);
  assert.match(kz.formula, /пятен застройки/);
});

test('build coefficient division by zero -> null + status', () => {
  const res = computeMetrics({ footprintM2: 1000, calcTerritoryM2: 0 });
  const kz = get(res, 'build_coefficient');
  assert.equal(kz.raw, null);
  assert.equal(kz.validity, 'division_by_zero');
});

test('FAR (КИТ) counts above-ground by default, excludes underground', () => {
  const buildings = [
    { footprintM2: 1000, floorAreaM2: 9000, undergroundM2: 2000, residentialShare: 0.75, floorsAbove: 9 }
  ];
  const res = computeMetrics({ calcTerritoryM2: 10000, buildings });
  const far = get(res, 'floor_area_ratio');
  assert.equal(far.raw, 0.9, 'above only: 9000/10000');
});

test('FAR (КИТ) includeUnderground changes composition', () => {
  const buildings = [
    { footprintM2: 1000, floorAreaM2: 9000, undergroundM2: 2000, residentialShare: 0.75, floorsAbove: 9 }
  ];
  const res = computeMetrics({ calcTerritoryM2: 10000, buildings, fart: { includeUnderground: true } });
  const far = get(res, 'floor_area_ratio');
  assert.equal(far.raw, 1.1, 'with underground: 11000/10000');
});

test('КЗ и КИТ различаются (не путаются)', () => {
  const buildings = [{ footprintM2: 2500, floorAreaM2: 22500, residentialShare: 0.7, floorsAbove: 9 }];
  const res = computeMetrics({ calcTerritoryM2: 10000, footprintM2: 2500, buildings });
  const kz = get(res, 'build_coefficient').raw;
  const kit = get(res, 'floor_area_ratio').raw;
  assert.equal(kz, 0.25);
  assert.equal(kit, 2.25);
  assert.notEqual(kz, kit);
});

test('population = living / areaPerPerson; density chel/ga', () => {
  const buildings = [{ footprintM2: 2500, floorAreaM2: 22500, residentialShare: 0.7, floorsAbove: 9 }];
  const res = computeMetrics({ parcelAreaM2: 10000, calcTerritoryM2: 10000, buildings, params: { areaPerPerson: 30 } });
  const living = get(res, 'living_m2').rounded; // 22500*0.7 = 15750 (rounded, float-noise removed)
  assert.equal(living, 15750);
  const pop = get(res, 'population').rounded;    // 15750/30 = 525
  assert.equal(pop, 525);
  const dens = get(res, 'population_density').rounded; // 525 / 1 ha = 525
  assert.equal(dens, 525);
});

test('param change: areaPerPerson affects population', () => {
  const buildings = [{ footprintM2: 2500, floorAreaM2: 22500, residentialShare: 0.7, floorsAbove: 9 }];
  const base = computeMetrics({ calcTerritoryM2: 10000, buildings, params: { areaPerPerson: 30 } });
  const changed = computeMetrics({ calcTerritoryM2: 10000, buildings, params: { areaPerPerson: 20 } });
  assert.ok(get(changed, 'population').raw > get(base, 'population').raw);
});

test('zone distribution + shares sum ~100%', () => {
  const res = computeMetrics({ calcTerritoryM2: 10000, zoneAreaM2: { residential: 6000, public: 2000, recreation: 2000 } });
  const shares = ['residential', 'public', 'recreation'].map(z => get(res, 'zone_share_' + z).raw);
  const sum = shares.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 0.001, 'shares sum to 100');
});

test('territory balance computed', () => {
  const res = computeMetrics({ calcTerritoryM2: 10000, blocksAreaM2: 7000, roadsLocalM2: 2000, greeneryM2: 1000 });
  const bal = get(res, 'territory_balance').raw; // 10000/10000*100
  assert.equal(bal, 100);
});

test('aggregateBuildings: multiple buildings avg/max/min floors', () => {
  const agg = aggregateBuildings([
    { floorAreaM2: 9000, floorsAbove: 9, footprintM2: 1000, residentialShare: 1 },
    { floorAreaM2: 5000, floorsAbove: 5, footprintM2: 1000, residentialShare: 0 }
  ], {});
  assert.equal(agg.buildingCount, 2);
  assert.equal(agg.avgFloors, 7);
  assert.equal(agg.maxFloors, 9);
  assert.equal(agg.minFloors, 5);
  assert.equal(agg.livingM2, 9000);
  assert.equal(agg.nonLivingM2, 5000);
});

test('negative area input -> null (guarded)', () => {
  const res = computeMetrics({ parcelAreaM2: -500 });
  assert.equal(get(res, 'parcel_area_m2').raw, null);
  assert.equal(get(res, 'parcel_area_m2').validity, 'no_data');
});
