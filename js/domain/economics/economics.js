// domain/economics/economics.js — предварительная экономика проекта (сценарный калькулятор).
// НЕ обещание результата. Чистые функции. Цены НЕ зашиты — приходят во входных параметрах.

import { safeDivide, round, nonNegative } from '../units.js';

/**
 * @typedef {object} EconomicInputs
 * @property {number} buildCostPerM2       стоимость строительства 1 м² (по типу — усреднённо)
 * @property {number} landscapingCost      благоустройство (всего)
 * @property {number} roadsCost            дороги (всего)
 * @property {number} utilitiesCost        инженерная инфраструктура
 * @property {number} parkingCost          парковки
 * @property {number} designCostFraction   проектирование (доля от стройки)
 * @property {number} landCost             участок
 * @property {number} extraCapex           доп. капзатраты
 * @property {number} contingencyFraction  резерв непредвиденных (доля)
 * @property {number} salePricePerM2       цена реализации 1 м²
 * @property {number} sellableFraction     доля продаваемой площади
 * @property {number} opexFraction         операционные расходы (доля от выручки)
 * @property {number} discountRate         ставка дисконтирования (доля/год)
 * @property {number} inflationRate        инфляция (доля/год)
 * @property {number} durationYears        длительность
 * @property {string} currency
 * @property {string} priceDate
 */

/**
 * Считает экономику для набора площадей проекта.
 * @param {object} project — { sellableAreaM2, totalBuildingM2, population, parcelHa, blocks }
 * @param {EconomicInputs} inputs
 * @param {number[]} [phasing] — распределение выручки по годам (доли, сумма 1)
 */
export function computeEconomics(project, inputs, phasing) {
  const p = project || {};
  const i = inputs || {};

  const totalBuildM2 = nonNegative(p.totalBuildingM2) || 0;
  const sellableM2 = nonNegative(p.sellableAreaM2) ??
    (totalBuildM2 * (clampFraction(i.sellableFraction, 0.7)));

  const buildCostPerM2 = nonNegative(i.buildCostPerM2) || 0;
  const buildCost = totalBuildM2 * buildCostPerM2;
  const designCost = buildCost * clampFraction(i.designCostFraction, 0.08);
  const roadsCost = nonNegative(i.roadsCost) || 0;
  const utilitiesCost = nonNegative(i.utilitiesCost) || 0;
  const landscapingCost = nonNegative(i.landscapingCost) || 0;
  const parkingCost = nonNegative(i.parkingCost) || 0;
  const socialCost = nonNegative(i.socialCost) || 0;
  const landCost = nonNegative(i.landCost) || 0;
  const extraCapex = nonNegative(i.extraCapex) || 0;

  const directCost = buildCost + designCost + roadsCost + utilitiesCost +
    landscapingCost + parkingCost + socialCost + landCost + extraCapex;
  const contingency = directCost * clampFraction(i.contingencyFraction, 0.1);
  const totalInvestment = directCost + contingency;

  const salePricePerM2 = nonNegative(i.salePricePerM2) || 0;
  const revenue = sellableM2 * salePricePerM2;
  const opex = revenue * clampFraction(i.opexFraction, 0);
  const grossProfit = revenue - totalInvestment;
  const netProfit = grossProfit - opex;
  const margin = safeDivide(netProfit * 100, revenue);

  const population = nonNegative(p.population) || 0;
  const parcelHa = nonNegative(p.parcelHa) || 0;
  const blocksCount = nonNegative(p.blocksCount) || 0;

  // Простой срок окупаемости (лет)
  const durationYears = nonNegative(i.durationYears) || 1;
  const annualNet = safeDivide(netProfit, durationYears);
  const simplePayback = (annualNet && annualNet > 0) ? safeDivide(totalInvestment, annualNet) : null;

  // Дисконтированный денежный поток + NPV
  const dcf = discountedCashFlow({
    totalInvestment, revenue, opex,
    discountRate: i.discountRate, durationYears, phasing
  });

  // Точка безубыточности (продаваемая площадь, при которой netProfit = 0)
  const breakEvenM2 = salePricePerM2 > 0 ? safeDivide(totalInvestment, salePricePerM2 * (1 - clampFraction(i.opexFraction, 0))) : null;

  return {
    currency: i.currency || 'RUB',
    priceDate: i.priceDate || null,
    totalInvestment: round(totalInvestment, 0),
    buildCost: round(buildCost, 0),
    roadsCost: round(roadsCost, 0),
    utilitiesCost: round(utilitiesCost, 0),
    landscapingCost: round(landscapingCost, 0),
    socialCost: round(socialCost, 0),
    parkingCost: round(parkingCost, 0),
    designCost: round(designCost, 0),
    contingency: round(contingency, 0),
    revenue: round(revenue, 0),
    opex: round(opex, 0),
    grossProfit: round(grossProfit, 0),
    netProfit: round(netProfit, 0),
    margin: margin === null ? null : round(margin, 1),
    costPerResident: population > 0 ? round(safeDivide(totalInvestment, population), 0) : null,
    costPerHa: parcelHa > 0 ? round(safeDivide(totalInvestment, parcelHa), 0) : null,
    costPerBlock: blocksCount > 0 ? round(safeDivide(totalInvestment, blocksCount), 0) : null,
    simplePaybackYears: simplePayback === null ? null : round(simplePayback, 1),
    npv: dcf.npv === null ? null : round(dcf.npv, 0),
    dcf: dcf.flows,
    breakEvenSellableM2: breakEvenM2 === null ? null : round(breakEvenM2, 0)
  };
}

/** Дисконтированный поток и NPV. Возвращает { npv, flows[] }. */
export function discountedCashFlow({ totalInvestment, revenue, opex, discountRate, durationYears, phasing }) {
  const rate = Number.isFinite(discountRate) ? discountRate : 0;
  const years = Math.max(1, Math.round(nonNegative(durationYears) || 1));
  const dist = normalizePhasing(phasing, years);

  const netRevenue = revenue - opex;
  const flows = [];
  let npv = -totalInvestment; // капзатраты в год 0
  flows.push({ year: 0, cash: round(-totalInvestment, 0), discounted: round(-totalInvestment, 0) });

  for (let y = 1; y <= years; y++) {
    const cash = netRevenue * (dist[y - 1] || 0);
    const disc = cash / Math.pow(1 + rate, y);
    npv += disc;
    flows.push({ year: y, cash: round(cash, 0), discounted: round(disc, 0) });
  }
  return { npv, flows };
}

/** Анализ чувствительности: варьирует один фактор ±deltas и возвращает netProfit. */
export function sensitivity(project, inputs, factor, deltas = [-0.2, -0.1, 0, 0.1, 0.2]) {
  const out = [];
  for (const d of deltas) {
    const modified = Object.assign({}, inputs);
    const modProject = Object.assign({}, project);
    switch (factor) {
      case 'buildCostPerM2': modified.buildCostPerM2 = (inputs.buildCostPerM2 || 0) * (1 + d); break;
      case 'salePricePerM2': modified.salePricePerM2 = (inputs.salePricePerM2 || 0) * (1 + d); break;
      case 'floorAreaRatio': modProject.totalBuildingM2 = (project.totalBuildingM2 || 0) * (1 + d); modProject.sellableAreaM2 = (project.sellableAreaM2 || 0) * (1 + d); break;
      case 'floors': modProject.totalBuildingM2 = (project.totalBuildingM2 || 0) * (1 + d); modProject.sellableAreaM2 = (project.sellableAreaM2 || 0) * (1 + d); break;
      case 'residentialShare': modProject.sellableAreaM2 = (project.sellableAreaM2 || 0) * (1 + d); break;
      default: break;
    }
    const r = computeEconomics(modProject, modified);
    out.push({ delta: d, netProfit: r.netProfit, npv: r.npv, margin: r.margin });
  }
  return out;
}

/** Три стандартных сценария. */
export function buildScenarios(project, baseInputs) {
  const optimistic = Object.assign({}, baseInputs, {
    salePricePerM2: (baseInputs.salePricePerM2 || 0) * 1.15,
    buildCostPerM2: (baseInputs.buildCostPerM2 || 0) * 0.95
  });
  const conservative = Object.assign({}, baseInputs, {
    salePricePerM2: (baseInputs.salePricePerM2 || 0) * 0.9,
    buildCostPerM2: (baseInputs.buildCostPerM2 || 0) * 1.1
  });
  return {
    base: computeEconomics(project, baseInputs),
    optimistic: computeEconomics(project, optimistic),
    conservative: computeEconomics(project, conservative)
  };
}

function clampFraction(v, def) {
  if (!Number.isFinite(v)) return def;
  return Math.min(Math.max(v, 0), 1);
}

function normalizePhasing(phasing, years) {
  if (Array.isArray(phasing) && phasing.length) {
    const sum = phasing.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    if (sum > 0) return phasing.map((x) => (Number.isFinite(x) ? x : 0) / sum);
  }
  return new Array(years).fill(1 / years);
}
