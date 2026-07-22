import { describe, test, expect } from '@jest/globals'
import {
  computeSuitabilityCell,
  normalizeWeights,
  DEFAULT_SUITABILITY_SETTINGS
} from '../../src/renderer/services/suitability-analysis/suitabilityEngine'
import type { SuitabilityInputs } from '../../src/renderer/services/suitability-analysis/suitabilityEngine'
import { makeRect } from '../../src/shared/utils/geometry'

const baseInputs: SuitabilityInputs = {
  projectGeometry: makeRect(0, 0, 1000, 1000),
  constraints: [],
  hasRoadAccess: true,
  hasPedestrianAccess: true,
  nearestInfrastructureMetres: 200,
  estimatedCostPerM2: 500,
  settings: DEFAULT_SUITABILITY_SETTINGS
}

describe('computeSuitabilityCell', () => {
  test('returns cell with fully explainable score', () => {
    const cell = computeSuitabilityCell(100, 100, 50, baseInputs)
    expect(cell.isFullyExplainable).toBe(true)
    expect(cell.criterionScores.length).toBeGreaterThan(0)
    cell.criterionScores.forEach(s => {
      expect(s.explanation).toBeTruthy()
      expect(s.normalizedScore).toBeGreaterThanOrEqual(0)
      expect(s.normalizedScore).toBeLessThanOrEqual(1)
    })
  })

  test('critically prohibited cell has score 0', () => {
    // Place an absolute-prohibition constraint at the cell position
    const constraint = {
      id: 'c1', name: 'No-build', category: 'no-build-zone' as const,
      geometry: makeRect(0, 0, 500, 500) as any, // covers our cell at (100, 100)
      geometryType: 'polygon' as const, severity: 'absolute' as const,
      action: 'prohibit-placement' as const, confidence: 'confirmed' as const,
      isConfirmed: true, dataSource: { type: 'manual' as const, label: 'Test' },
      priority: 1, userMetadata: {}, createdAt: '', updatedAt: ''
    }
    const inputs: SuitabilityInputs = { ...baseInputs, constraints: [constraint] }
    const cell = computeSuitabilityCell(100, 100, 50, inputs)
    expect(cell.isCriticallyProhibited).toBe(true)
    expect(cell.totalScore).toBe(0)
    expect(cell.suitabilityClass).toBe('unsuitable')
  })

  test('no road access lowers score', () => {
    const withAccess = computeSuitabilityCell(100, 100, 50, baseInputs)
    const noAccess = computeSuitabilityCell(100, 100, 50, { ...baseInputs, hasRoadAccess: false })
    expect(withAccess.totalScore).toBeGreaterThan(noAccess.totalScore)
  })

  test('each score has contribution field', () => {
    const cell = computeSuitabilityCell(100, 100, 50, baseInputs)
    for (const s of cell.criterionScores) {
      expect(typeof s.contribution).toBe('number')
    }
  })
})

describe('normalizeWeights', () => {
  test('active weights sum to 1 after normalization', () => {
    const weights = DEFAULT_SUITABILITY_SETTINGS.weights
    const normalized = normalizeWeights(weights)
    const activeSum = normalized.filter(w => w.isEnabled).reduce((s, w) => s + w.weight, 0)
    expect(activeSum).toBeCloseTo(1, 4)
  })

  test('disabled weights become 0', () => {
    const weights = DEFAULT_SUITABILITY_SETTINGS.weights.map((w, i) =>
      i === 0 ? { ...w, isEnabled: false } : w
    )
    const normalized = normalizeWeights(weights)
    const disabled = normalized.find(w => !w.isEnabled)
    expect(disabled?.weight).toBe(0)
  })
})
