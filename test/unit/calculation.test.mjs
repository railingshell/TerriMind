import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricsInput } from '../../js/services/calculation/buildMetricsInput.js';
import { computeMetrics } from '../../js/domain/metrics/computeMetrics.js';

test('builds input from blocks, aggregates zone areas', () => {
  const inp = buildMetricsInput({
    parcelAreaM2: 10000,
    blocks: [
      { areaM2: 6000, zone: 'residential', footprintCoef: 0.3, floors: 9, residentialShare: 0.7 },
      { areaM2: 2000, zone: 'recreation', footprintCoef: 0.02, floors: 1, residentialShare: 0 }
    ]
  });
  assert.equal(inp.blocksAreaM2, 8000);
  assert.equal(inp.zoneAreaM2.residential, 6000);
  assert.equal(inp.zoneAreaM2.recreation, 2000);
  assert.equal(inp.greeneryM2, 2000, 'recreation -> greenery');
  assert.equal(inp.buildings.length, 2);
});

test('footprint uses applied build_coefficient rule over block coef', () => {
  const inp = buildMetricsInput({
    parcelAreaM2: 10000,
    blocks: [{ areaM2: 10000, zone: 'residential', footprintCoef: 0.5, floors: 9, residentialShare: 0.7 }],
    applied: { build_coefficient: { value: 0.3 } }
  });
  assert.equal(inp.footprintM2, 3000, 'rule 0.3 wins over block 0.5');
});

test('applied floors rule feeds FAR', () => {
  const inp = buildMetricsInput({
    parcelAreaM2: 10000,
    blocks: [{ areaM2: 10000, zone: 'residential', footprintCoef: 0.3, floors: 5, residentialShare: 0.7 }],
    applied: { build_coefficient: { value: 0.3 }, floors: { value: 12 } }
  });
  const b = inp.buildings[0];
  assert.equal(b.floorsAbove, 12);
  assert.equal(b.floorAreaM2, 3000 * 12);
});

test('regulationExcluded reduces design/calc territory', () => {
  const inp = buildMetricsInput({ parcelAreaM2: 10000, regulationExcludedM2: 2000, blocks: [] });
  assert.equal(inp.designAreaM2, 8000);
  assert.equal(inp.calcTerritoryM2, 8000);
});

test('full: buildMetricsInput -> computeMetrics coherent', () => {
  const inp = buildMetricsInput({
    parcelAreaM2: 10000,
    blocks: [{ areaM2: 10000, zone: 'residential', footprintCoef: 0.3, floors: 9, residentialShare: 0.7 }],
    applied: { build_coefficient: { value: 0.3 } },
    params: { areaPerPerson: 30 }
  });
  const res = computeMetrics(inp);
  assert.equal(res.byId.build_coefficient.raw, 0.3);
  // living = footprint(3000)*floors(9)*resid(0.7) = 18900; pop = 18900/30 = 630
  assert.equal(res.byId.population.rounded, 630);
});

test('empty project safe', () => {
  const inp = buildMetricsInput({});
  const res = computeMetrics(inp);
  assert.equal(res.byId.population.raw, 0);
  assert.equal(res.byId.build_coefficient.validity, 'division_by_zero');
});
