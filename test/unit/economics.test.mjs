import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEconomics, discountedCashFlow, sensitivity, buildScenarios } from '../../js/domain/economics/economics.js';

const project = { totalBuildingM2: 100000, sellableAreaM2: 70000, population: 2000, parcelHa: 5, blocksCount: 10 };
const inputs = {
  buildCostPerM2: 50000, salePricePerM2: 150000, sellableFraction: 0.7,
  designCostFraction: 0.08, contingencyFraction: 0.1, opexFraction: 0,
  roadsCost: 100000000, utilitiesCost: 200000000, durationYears: 4, discountRate: 0.1, currency: 'RUB'
};

test('base scenario: investment, revenue, profit', () => {
  const r = computeEconomics(project, inputs);
  assert.equal(r.buildCost, 5000000000); // 100000*50000
  assert.equal(r.revenue, 10500000000);  // 70000*150000
  assert.ok(r.totalInvestment > r.buildCost, 'includes design+roads+contingency');
  assert.ok(r.netProfit > 0);
  assert.ok(r.margin > 0 && r.margin <= 100);
});

test('cost per resident / ha / block', () => {
  const r = computeEconomics(project, inputs);
  assert.equal(r.costPerResident, Math.round(r.totalInvestment / 2000));
  assert.equal(r.costPerHa, Math.round(r.totalInvestment / 5));
  assert.equal(r.costPerBlock, Math.round(r.totalInvestment / 10));
});

test('optimistic > base > conservative net profit', () => {
  const s = buildScenarios(project, inputs);
  assert.ok(s.optimistic.netProfit > s.base.netProfit);
  assert.ok(s.base.netProfit > s.conservative.netProfit);
});

test('NPV computed with discount', () => {
  const r = computeEconomics(project, inputs);
  assert.ok(Number.isFinite(r.npv));
  // NPV should be less than undiscounted net (discounting reduces future cash)
  assert.ok(r.npv < r.grossProfit);
});

test('NPV zero discount rate = sum of cash - investment', () => {
  const dcf = discountedCashFlow({ totalInvestment: 1000, revenue: 2000, opex: 0, discountRate: 0, durationYears: 2 });
  // year0: -1000, y1: 1000, y2: 1000 => npv = 1000
  assert.equal(dcf.npv, 1000);
});

test('break-even sellable area', () => {
  const r = computeEconomics(project, inputs);
  assert.ok(r.breakEvenSellableM2 > 0);
  assert.ok(r.breakEvenSellableM2 < project.sellableAreaM2, 'profitable project breaks even below actual sellable');
});

test('missing data -> null, no NaN', () => {
  const r = computeEconomics({}, {});
  assert.equal(r.totalInvestment, 0);
  assert.equal(r.margin, null, 'no revenue -> margin null (not NaN)');
  assert.equal(r.costPerResident, null);
  assert.equal(r.simplePaybackYears, null);
});

test('sensitivity to floor area ratio', () => {
  const s = sensitivity(project, inputs, 'floorAreaRatio');
  assert.equal(s.length, 5);
  const base = s.find((x) => x.delta === 0);
  const plus = s.find((x) => x.delta === 0.2);
  assert.ok(plus.netProfit > base.netProfit, 'more FAR -> more sellable -> more profit');
});

test('sensitivity to sale price', () => {
  const s = sensitivity(project, inputs, 'salePricePerM2');
  const minus = s.find((x) => x.delta === -0.2);
  const plus = s.find((x) => x.delta === 0.2);
  assert.ok(plus.netProfit > minus.netProfit);
});

test('all outputs finite or null (no NaN/Infinity)', () => {
  const r = computeEconomics(project, inputs);
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), k + ' finite');
  }
});
