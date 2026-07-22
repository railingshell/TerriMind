import { describe, test, expect } from '@jest/globals'
import {
  calculateDemand,
  calculateProjectedSupply,
  calculateExternalSupply,
  buildInfrastructureBalance,
  estimateAgeStructure,
  DEMO_NORMATIVE_STANDARDS
} from '../../src/renderer/services/infrastructure-demand/demandEngine'
import type { InfrastructureObject, ExternalInfrastructureObject } from '../../src/shared/types/infrastructure'
import { generateId, nowISO } from '../../src/shared/utils/id'

function mockInfraObject(type: string, capacity: number, existence: 'existing' | 'projected' = 'projected'): InfrastructureObject {
  const now = nowISO()
  return {
    id: generateId(), category: 'education', type: type as any,
    name: 'Test', geometry: { type: 'Point', coordinates: [0, 0] },
    capacity, capacityUnit: 'place',
    buildingArea: 1000, parcelArea: 2000, floors: 3,
    targetGroup: 'children-7-18', serviceRadius: 500, maxAccessTimeMinutes: 10,
    entrances: [], parkingSpots: 10, existence, activation: 'active',
    dataSource: { type: 'manual', label: 'Test' }, confidence: 'confirmed',
    violations: [], userMetadata: {}, createdAt: now, updatedAt: now
  }
}

function mockExternalObject(type: string, capacity: number, share: number): ExternalInfrastructureObject {
  return {
    id: generateId(), type: type as any, name: 'External',
    position: [100, 100], capacity, capacityUnit: 'place',
    isIncluded: true, availableShare: share,
    reliability: 'medium', isCurrentlyOperating: true, hasAccessRestriction: false,
    dataSource: { type: 'imported-geojson', label: 'Test' }, importedAt: nowISO()
  }
}

describe('calculateDemand', () => {
  test('calculates school demand by children-7-18', () => {
    const params = { population: 5000, apartments: 2000, workplaces: 500, children03: 200, children37: 200, children718: 500, elderly: 750 }
    const schoolStd = DEMO_NORMATIVE_STANDARDS.find(s => s.type === 'school')!
    const demand = calculateDemand(params, [schoolStd])
    const expected = Math.ceil(500 * schoolStd.ratePerUnit) // 100% of children-7-18 × rate
    expect(demand.get('school')).toBe(expected)
  })

  test('returns 0 for population=0', () => {
    const params = estimateAgeStructure(0, 0)
    const demand = calculateDemand(params, DEMO_NORMATIVE_STANDARDS)
    for (const [, v] of demand) {
      expect(v).toBe(0)
    }
  })
})

describe('calculateProjectedSupply', () => {
  test('sums active projected objects', () => {
    const objs = [
      mockInfraObject('school', 500, 'projected'),
      mockInfraObject('school', 300, 'projected'),
      mockInfraObject('school', 200, 'existing') // should not count
    ]
    expect(calculateProjectedSupply(objs, 'school')).toBe(800)
  })

  test('ignores disabled objects', () => {
    const obj = { ...mockInfraObject('school', 500), activation: 'disabled' as any }
    expect(calculateProjectedSupply([obj], 'school')).toBe(0)
  })
})

describe('calculateExternalSupply', () => {
  test('applies availableShare correctly', () => {
    const ext = mockExternalObject('polyclinic', 1000, 0.3)
    expect(calculateExternalSupply([ext], 'polyclinic')).toBe(300)
  })

  test('excludes not-included objects', () => {
    const ext = { ...mockExternalObject('school', 500, 0.5), isIncluded: false }
    expect(calculateExternalSupply([ext], 'school')).toBe(0)
  })

  test('excludes non-operating objects', () => {
    const ext = { ...mockExternalObject('school', 500, 0.5), isCurrentlyOperating: false }
    expect(calculateExternalSupply([ext], 'school')).toBe(0)
  })
})

describe('buildInfrastructureBalance', () => {
  test('correctly identifies deficit', () => {
    const balance = buildInfrastructureBalance(
      'school', 'Школа', 'student',
      1000, 'test',
      [mockInfraObject('school', 300)],
      [],
      5000, true
    )
    expect(balance.deficit).toBe(700)
    expect(balance.surplus).toBe(0)
    expect(balance.coveragePercent).toBeCloseTo(30, 0)
  })

  test('correctly identifies surplus', () => {
    const balance = buildInfrastructureBalance(
      'school', 'Школа', 'student',
      500, 'test',
      [mockInfraObject('school', 800)],
      [],
      5000, false
    )
    expect(balance.surplus).toBe(300)
    expect(balance.deficit).toBe(0)
  })

  test('marks demo values in explanation', () => {
    const balance = buildInfrastructureBalance(
      'school', 'Школа', 'student',
      100, 'test', [], [], 1000, true
    )
    expect(balance.assumptions.some(a => a.includes('демонстрационный'))).toBe(true)
  })

  test('external supply uses share factor', () => {
    const ext = mockExternalObject('school', 1000, 0.4)
    const balance = buildInfrastructureBalance(
      'school', 'Школа', 'student',
      500, 'test', [], [ext], 5000, false
    )
    // external supply = floor(1000 * 0.4) = 400
    expect(balance.existingAvailableCapacity).toBe(400)
  })

  test('zero demand results in 100% coverage', () => {
    const balance = buildInfrastructureBalance(
      'school', 'Школа', 'student',
      0, 'test', [], [], 0, false
    )
    expect(balance.coveragePercent).toBe(100)
  })
})

describe('estimateAgeStructure', () => {
  test('returns consistent structure', () => {
    const p = estimateAgeStructure(10000, 4000)
    expect(p.population).toBe(10000)
    expect(p.apartments).toBe(4000)
    expect(p.children03).toBeGreaterThan(0)
    expect(p.children718).toBeGreaterThan(0)
    expect(p.elderly).toBeGreaterThan(0)
  })
})
