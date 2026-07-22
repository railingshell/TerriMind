// TerriMind — Suitability analysis engine
// Every score is explainable — no hidden coefficients.
// Users can inspect each criterion weight and raw value.

import type {
  SuitabilityMap,
  SuitabilityCell,
  SuitabilityClass,
  SuitabilityCriterion,
  SuitabilityCriterionScore,
  SuitabilityCriterionWeight,
  SuitabilitySettings,
  SuitabilitySettings as Settings
} from '@shared/types/suitability'
import type { TerritorialConstraint } from '@shared/types/constraints'
import type { ElevationGrid } from '@shared/types/terrain'
import type { GeoPolygon } from '@shared/types/geometry'
import { generateId, nowISO } from '@shared/utils/id'
import { polygonArea, pointInPolygon } from '@shared/utils/geometry'
import { calculateSlopeAt } from '../terrain-analysis/terrainEngine'

export const DEFAULT_SUITABILITY_SETTINGS: SuitabilitySettings = {
  weights: [
    { criterion: 'build-permission', weight: 0.25, isEnabled: true, description: 'Разрешённость строительства', customLabel: undefined },
    { criterion: 'strict-prohibitions', weight: 0.20, isEnabled: true, description: 'Строгие запреты (СЗЗ, ОКН, водоохранные)', customLabel: undefined },
    { criterion: 'terrain-slope', weight: 0.15, isEnabled: true, description: 'Уклон рельефа', customLabel: undefined },
    { criterion: 'road-access', weight: 0.15, isEnabled: true, description: 'Доступность по дорогам', customLabel: undefined },
    { criterion: 'pedestrian-access', weight: 0.10, isEnabled: true, description: 'Пешеходная доступность', customLabel: undefined },
    { criterion: 'infrastructure-proximity', weight: 0.10, isEnabled: true, description: 'Близость инфраструктуры', customLabel: undefined },
    { criterion: 'preparation-cost', weight: 0.05, isEnabled: true, description: 'Ориентировочная стоимость подготовки', customLabel: undefined }
  ],
  slopeThresholds: { gentle: 2, moderate: 5, steep: 10 },
  proximityWeights: {
    schoolMetres: 500, kindergartenMetres: 300,
    healthcareMetres: 1000, transitMetres: 500
  },
  costThresholds: { lowCostRubPerM2: 1000, highCostRubPerM2: 10000 }
}

export interface SuitabilityInputs {
  projectGeometry: GeoPolygon
  constraints: TerritorialConstraint[]
  elevationGrid?: ElevationGrid
  hasRoadAccess: boolean
  hasPedestrianAccess: boolean
  nearestInfrastructureMetres: number
  estimatedCostPerM2: number
  settings: SuitabilitySettings
}

/** 
 * Compute suitability for one cell/zone.
 * All criteria and scores are returned for full transparency.
 */
export function computeSuitabilityCell(
  cellX: number,
  cellY: number,
  cellSize: number,
  inputs: SuitabilityInputs
): SuitabilityCell {
  const pos: [number, number] = [cellX + cellSize / 2, cellY + cellSize / 2]
  const { settings, constraints, elevationGrid } = inputs

  const activeWeights = settings.weights.filter(w => w.isEnabled)
  const totalWeight = activeWeights.reduce((s, w) => s + w.weight, 0)
  const normalizedWeights = activeWeights.map(w => ({
    ...w,
    weight: totalWeight > 0 ? w.weight / totalWeight : 1 / activeWeights.length
  }))

  const scores: SuitabilityCriterionScore[] = []
  let isCriticallyProhibited = false

  for (const w of normalizedWeights) {
    const score = scoreCriterion(w.criterion, pos, inputs, w.weight)
    scores.push(score)
    if (w.criterion === 'build-permission' && score.normalizedScore === 0) {
      isCriticallyProhibited = true
    }
    if (w.criterion === 'strict-prohibitions' && score.normalizedScore === 0) {
      isCriticallyProhibited = true
    }
  }

  const totalScore = isCriticallyProhibited
    ? 0
    : scores.reduce((s, sc) => s + sc.weightedScore, 0)

  // Contribution
  for (const sc of scores) {
    sc.contribution = totalScore > 0 ? (sc.weightedScore / totalScore) * 100 : 0
  }

  return {
    x: cellX,
    y: cellY,
    cellSize,
    totalScore: Math.round(totalScore * 1000) / 1000,
    suitabilityClass: scoreToClass(isCriticallyProhibited ? 0 : totalScore),
    criterionScores: scores,
    isCriticallyProhibited,
    isFullyExplainable: true as const
  }
}

function scoreCriterion(
  criterion: SuitabilityCriterion,
  pos: [number, number],
  inputs: SuitabilityInputs,
  weight: number
): SuitabilityCriterionScore {
  const { settings, constraints, elevationGrid } = inputs

  switch (criterion) {
    case 'build-permission': {
      const prohibited = constraints.some(c =>
        c.severity === 'absolute' &&
        c.geometry.type === 'Polygon' &&
        pointInPolygon(pos, c.geometry as GeoPolygon)
      )
      const score = prohibited ? 0 : 1
      return makeScore(criterion, score, weight, 'Разрешена ли застройка', prohibited ? 0 : 1, 'да/нет',
        prohibited ? 'В зоне абсолютного запрета' : 'Ограничений нет')
    }

    case 'strict-prohibitions': {
      const strictCount = constraints.filter(c =>
        (c.severity === 'absolute' || c.severity === 'strict') &&
        c.geometry.type === 'Polygon' &&
        pointInPolygon(pos, c.geometry as GeoPolygon)
      ).length
      const score = strictCount === 0 ? 1 : Math.max(0, 1 - strictCount * 0.4)
      return makeScore(criterion, score, weight, 'Строгие ограничения', strictCount, 'ед.',
        strictCount === 0 ? 'Нет строгих ограничений' : `Попадает в ${strictCount} строгих ограничений`)
    }

    case 'terrain-slope': {
      if (!elevationGrid) {
        return makeScore(criterion, 0.5, weight, 'Уклон рельефа', NaN, '%', 'Данные рельефа отсутствуют — принято 0.5 (неопределённо)', 'unknown')
      }
      const col = Math.floor((pos[0] - elevationGrid.originX) / elevationGrid.cellSize)
      const row = Math.floor((pos[1] - elevationGrid.originY) / elevationGrid.cellSize)
      const info = calculateSlopeAt(elevationGrid, col, row)
      if (!info) {
        return makeScore(criterion, 0.5, weight, 'Уклон рельефа', NaN, '%', 'Нет данных для этой ячейки', 'unknown')
      }
      const { slopePercent } = info
      const th = settings.slopeThresholds
      let score: number
      if (slopePercent < th.gentle) score = 1.0
      else if (slopePercent < th.moderate) score = 0.8
      else if (slopePercent < th.steep) score = 0.5
      else score = 0.1
      return makeScore(criterion, score, weight, 'Уклон', slopePercent, '%',
        `Уклон ${slopePercent.toFixed(1)}% — ${info.classification}`)
    }

    case 'road-access': {
      const score = inputs.hasRoadAccess ? 1.0 : 0.0
      return makeScore(criterion, score, weight, 'Доступность по дорогам', score, '',
        score === 1 ? 'Дорожный доступ есть' : 'Дорожный доступ отсутствует')
    }

    case 'pedestrian-access': {
      const score = inputs.hasPedestrianAccess ? 1.0 : 0.3
      return makeScore(criterion, score, weight, 'Пешеходная доступность', score, '',
        score === 1 ? 'Пешеходный доступ есть' : 'Пешеходный доступ ограничен')
    }

    case 'infrastructure-proximity': {
      const d = inputs.nearestInfrastructureMetres
      let score: number
      if (d <= 300) score = 1.0
      else if (d <= 600) score = 0.8
      else if (d <= 1000) score = 0.5
      else score = 0.2
      return makeScore(criterion, score, weight, 'До ближайшего объекта', d, 'м',
        `${d} м до ближайшего инфраструктурного объекта`)
    }

    case 'preparation-cost': {
      const cost = inputs.estimatedCostPerM2
      const { lowCostRubPerM2, highCostRubPerM2 } = settings.costThresholds
      const score = cost <= lowCostRubPerM2 ? 1.0 :
        cost >= highCostRubPerM2 ? 0.1 :
        1 - (cost - lowCostRubPerM2) / (highCostRubPerM2 - lowCostRubPerM2) * 0.9
      return makeScore(criterion, score, weight, 'Стоимость подготовки', cost, 'руб/м²',
        `~${cost.toLocaleString()} руб/м² — ${score >= 0.7 ? 'низкая' : score >= 0.4 ? 'средняя' : 'высокая'} стоимость`)
    }

    default:
      return makeScore(criterion, 0.5, weight, criterion, 0, '', 'Критерий не реализован', 'unknown')
  }
}

function makeScore(
  criterion: SuitabilityCriterion,
  normalizedScore: number,
  weight: number,
  label: string,
  rawValue: number,
  rawUnit: string,
  explanation: string,
  quality: 'high' | 'medium' | 'low' | 'unknown' = 'medium'
): SuitabilityCriterionScore {
  return {
    criterion,
    rawValue,
    rawUnit,
    normalizedScore: Math.max(0, Math.min(1, normalizedScore)),
    weightedScore: Math.max(0, Math.min(1, normalizedScore)) * weight,
    contribution: 0,  // filled after all scores computed
    explanation,
    dataQuality: quality,
    dataSource: 'suitability-engine-v5'
  }
}

function scoreToClass(score: number): SuitabilityClass {
  if (score < 0.1) return 'unsuitable'
  if (score < 0.35) return 'poor'
  if (score < 0.6) return 'fair'
  if (score < 0.8) return 'good'
  return 'excellent'
}

/** Normalise weights so they sum to 1 */
export function normalizeWeights(weights: SuitabilityCriterionWeight[]): SuitabilityCriterionWeight[] {
  const active = weights.filter(w => w.isEnabled)
  const total = active.reduce((s, w) => s + w.weight, 0)
  if (total === 0 || !isFinite(total)) return weights
  return weights.map(w => ({
    ...w,
    weight: w.isEnabled ? w.weight / total : 0
  }))
}
