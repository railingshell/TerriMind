import { describe, test, expect } from '@jest/globals'
import {
  analyzeConstraintConflicts,
  calculateConstrainedAreaBreakdown
} from '../../src/renderer/services/constraint-analysis/constraintEngine'
import type { TerritorialConstraint } from '../../src/shared/types/constraints'
import type { LandParcel } from '../../src/shared/types/parcels'
import type { Building } from '../../src/shared/types/buildings'
import { makeRect } from '../../src/shared/utils/geometry'
import { generateId, nowISO } from '../../src/shared/utils/id'

function mockConstraint(overrides: Partial<TerritorialConstraint> = {}): TerritorialConstraint {
  const now = nowISO()
  return {
    id: generateId(), name: 'Test constraint', category: 'sanitary-protection',
    geometry: makeRect(0, 0, 200, 200) as any,
    geometryType: 'polygon', severity: 'strict', action: 'prohibit-placement',
    confidence: 'confirmed', isConfirmed: true,
    dataSource: { type: 'manual', label: 'Test' },
    priority: 0, userMetadata: {}, createdAt: now, updatedAt: now, ...overrides
  }
}

function mockParcel(geom = makeRect(50, 50, 50, 50)): LandParcel {
  const now = nowISO()
  return {
    id: generateId(), projectNumber: 'Ж-0001', blockId: 'b',
    geometry: geom, area: 2500, designation: 'residential', status: 'proposed',
    buildingIds: [], infrastructureObjectIds: [],
    footprintArea: 0, totalBuildingArea: 0, buildingCoverageRatio: 0,
    floorAreaRatio: 0, dominantFloors: 0, population: 0, parkingDemand: 0,
    normativeConstraints: [], violations: [], hasCriticalViolations: false,
    hasRoadAccess: true, hasVehicleAccess: true, isPedestrian: false,
    isExcludedFromCalculation: false, isPublicOpenSpace: false,
    source: 'manual', isManuallyEdited: false, isLocked: false,
    confidence: 'confirmed', userMetadata: {},
    dataSource: { type: 'manual', label: 'Test' }, createdAt: now, updatedAt: now
  }
}

describe('analyzeConstraintConflicts', () => {
  test('detects parcel inside constraint', () => {
    const constraint = mockConstraint()  // covers 0..200, 0..200
    const parcel = mockParcel(makeRect(50, 50, 50, 50)) // inside constraint

    const conflicts = analyzeConstraintConflicts([constraint], [parcel], [])
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts[0].objectType).toBe('parcel')
    expect(conflicts[0].constraintId).toBe(constraint.id)
  })

  test('no conflict when parcel outside constraint', () => {
    const constraint = mockConstraint() // 0..200, 0..200
    const parcel = mockParcel(makeRect(300, 300, 50, 50)) // completely outside

    const conflicts = analyzeConstraintConflicts([constraint], [parcel], [])
    expect(conflicts.length).toBe(0)
  })

  test('absolute severity maps to critical severity', () => {
    const constraint = mockConstraint({ severity: 'absolute', category: 'no-build-zone' })
    const parcel = mockParcel(makeRect(50, 50, 50, 50))

    const conflicts = analyzeConstraintConflicts([constraint], [parcel], [])
    const critical = conflicts.filter(c => c.severity === 'critical')
    expect(critical.length).toBeGreaterThan(0)
  })

  test('informational severity maps to info', () => {
    const constraint = mockConstraint({ severity: 'informational' })
    const parcel = mockParcel(makeRect(50, 50, 50, 50))

    const conflicts = analyzeConstraintConflicts([constraint], [parcel], [])
    expect(conflicts[0]?.severity).toBe('info')
  })
})

describe('calculateConstrainedAreaBreakdown', () => {
  test('strict/absolute constraints reduce available area', () => {
    const c = mockConstraint({ severity: 'absolute' })
    const breakdown = calculateConstrainedAreaBreakdown(10000, [c], [])
    expect(breakdown.strictlyProhibitedArea).toBeGreaterThan(0)
    expect(breakdown.availableArea).toBeLessThan(10000)
  })

  test('informational constraints do not reduce available area', () => {
    const c = mockConstraint({ severity: 'informational' })
    const breakdown = calculateConstrainedAreaBreakdown(10000, [c], [])
    expect(breakdown.strictlyProhibitedArea).toBe(0)
    expect(breakdown.availableArea).toBe(10000)
  })
})
