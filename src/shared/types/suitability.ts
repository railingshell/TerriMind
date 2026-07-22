// TerriMind — Suitability analysis domain model — Stage 5

import type { StableId, DataQuality } from './common'
import type { GeoPolygon } from './geometry'

export type SuitabilityClass = 'unsuitable' | 'poor' | 'fair' | 'good' | 'excellent'

export type SuitabilityCriterion =
  | 'build-permission'
  | 'strict-prohibitions'
  | 'terrain-slope'
  | 'terrain-data-coverage'
  | 'road-access'
  | 'pedestrian-access'
  | 'infrastructure-proximity'
  | 'engineering-constraints'
  | 'sanitary-constraints'
  | 'available-area'
  | 'development-complexity'
  | 'preparation-cost'
  | 'custom'

export interface SuitabilityCriterionWeight {
  criterion: SuitabilityCriterion
  customLabel?: string
  weight: number          // 0..1, sum of all active = 1.0
  isEnabled: boolean
  description: string
}

export interface SuitabilityCriterionScore {
  criterion: SuitabilityCriterion
  rawValue: number        // domain value (slope %, cost, etc.)
  rawUnit: string
  normalizedScore: number // 0..1
  weightedScore: number   // normalizedScore * weight
  contribution: number    // % of total score from this criterion
  explanation: string
  dataQuality: DataQuality
  dataSource: string
}

export interface SuitabilityCell {
  x: number
  y: number
  cellSize: number
  totalScore: number       // 0..1
  suitabilityClass: SuitabilityClass
  criterionScores: SuitabilityCriterionScore[]
  isCriticallyProhibited: boolean  // any absolute-prohibition constraint present
  readonly isFullyExplainable: true
}

/** Suitability map for the entire project territory */
export interface SuitabilityMap {
  id: StableId
  projectId: StableId
  scenarioId?: StableId
  computedAt: string

  cells: SuitabilityCell[]
  cellSize: number         // metres

  // Weights used
  weights: SuitabilityCriterionWeight[]

  // Summary
  suitableArea: number     // m2 (good + excellent)
  fairArea: number
  poorArea: number         // m2 (poor + unsuitable)
  prohibitedArea: number
  totalArea: number
  avgScore: number

  quality: DataQuality
  assumptions: string[]
  limitations: string[]

  /** Critical: every score must be explainable, no hidden coefficients */
  readonly isFullyExplainable: true
}

/** User-saved suitability analysis settings */
export interface SuitabilitySettings {
  weights: SuitabilityCriterionWeight[]
  slopeThresholds: {
    gentle: number   // %
    moderate: number
    steep: number
  }
  proximityWeights: {
    schoolMetres: number
    kindergartenMetres: number
    healthcareMetres: number
    transitMetres: number
  }
  costThresholds: {
    lowCostRubPerM2: number
    highCostRubPerM2: number
  }
}
