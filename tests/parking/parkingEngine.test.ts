import { describe, test, expect } from '@jest/globals'
import {
  calculateBuildingParkingDemand,
  buildParkingBalance,
  DEFAULT_PARKING_RULES
} from '../../src/renderer/services/parking-calculation/parkingEngine'
import type { Building } from '../../src/shared/types/buildings'
import type { LandParcel } from '../../src/shared/types/parcels'
import type { ParkingFacility } from '../../src/shared/types/parking'
import { makeRect } from '../../src/shared/utils/geometry'
import { generateId, nowISO } from '../../src/shared/utils/id'

function mockBuilding(use: Building['use'], overrides: Partial<Building> = {}): Building {
  const now = nowISO()
  return {
    id: generateId(), blockId: 'b', parcelId: 'p',
    footprint: makeRect(0, 0, 20, 20), footprintArea: 400,
    floors: 5, height: 15, totalArea: 2000,
    residentialArea: 1500, commercialArea: 500,
    use, apartments: 20, residents: 40, workplaces: 5,
    entrances: [], parkingSpots: 0, violations: [],
    source: { type: 'manual', label: 'Test' }, isLocked: false,
    createdAt: now, updatedAt: now, ...overrides
  }
}

function mockParking(capacity: number, parcelIds: string[]): ParkingFacility {
  const now = nowISO()
  return {
    id: generateId(), type: 'open-surface',
    geometry: makeRect(10, 10, 20, 10), area: 200,
    capacity, levels: 1, disabledSpots: 2, bicycleSpots: 5,
    servedBuildingIds: [], servedParcelIds: parcelIds,
    accessMode: 'public',
    estimatedConstructionCost: 0, areaEfficiencyRatio: 0.8,
    existence: 'projected', violations: [],
    dataSource: { type: 'manual', label: 'Test' },
    userMetadata: {}, createdAt: now, updatedAt: now
  }
}

function mockParcel(id: string, buildingIds: string[]): LandParcel {
  const now = nowISO()
  return {
    id, projectNumber: 'Ж-0001', blockId: 'b',
    geometry: makeRect(0, 0, 100, 100), area: 10000,
    designation: 'residential', status: 'proposed',
    buildingIds, infrastructureObjectIds: [],
    footprintArea: 0, totalBuildingArea: 0,
    buildingCoverageRatio: 0, floorAreaRatio: 0,
    dominantFloors: 0, population: 0, parkingDemand: 0,
    normativeConstraints: [], violations: [], hasCriticalViolations: false,
    hasRoadAccess: true, hasVehicleAccess: true, isPedestrian: false,
    isExcludedFromCalculation: false, isPublicOpenSpace: false,
    source: 'manual', isManuallyEdited: false, isLocked: false,
    confidence: 'confirmed', userMetadata: {},
    dataSource: { type: 'manual', label: 'Test' },
    createdAt: now, updatedAt: now
  }
}

describe('calculateBuildingParkingDemand', () => {
  test('residential demand = apartments × rate', () => {
    const b = mockBuilding('residential', { apartments: 50 })
    const items = calculateBuildingParkingDemand([b], DEFAULT_PARKING_RULES)
    const item = items[0]
    const rule = DEFAULT_PARKING_RULES.find(r => r.landUse === 'residential')!
    const expected = Math.ceil(50 * rule.rate) + Math.ceil(50 * (rule.guestRate ?? 0))
    expect(item.totalDemand).toBe(expected)
  })

  test('commercial demand = per 100m2 rate', () => {
    const b = mockBuilding('commercial', { commercialArea: 500 })
    const items = calculateBuildingParkingDemand([b], DEFAULT_PARKING_RULES)
    const rule = DEFAULT_PARKING_RULES.find(r => r.landUse === 'commercial')!
    const expected = Math.ceil((500 / 100) * rule.rate * rule.sharedUseFactor)
    expect(items[0].demand).toBe(expected)
  })

  test('buildings with no matching rule get 0 demand', () => {
    const b = mockBuilding('custom')
    const items = calculateBuildingParkingDemand([b], [])
    expect(items[0].totalDemand).toBe(0)
  })
})

describe('buildParkingBalance', () => {
  test('detects deficit correctly', () => {
    const parcelId = generateId()
    const b = mockBuilding('residential', { apartments: 100 })
    const parcel = mockParcel(parcelId, [b.id])
    const parking = mockParking(50, [parcelId]) // far less than demand

    const balance = buildParkingBalance(parcel, [b], [parking], DEFAULT_PARKING_RULES)
    expect(balance.demand).toBeGreaterThan(0)
    // parking provides 50 spots, demand is likely > 50
    // deficit should be > 0 if demand > 50
    const rule = DEFAULT_PARKING_RULES.find(r => r.landUse === 'residential')!
    const expectedDemand = Math.ceil(100 * rule.rate) + Math.ceil(100 * (rule.guestRate ?? 0))
    if (expectedDemand > 50) {
      expect(balance.deficit).toBeGreaterThan(0)
    }
  })

  test('no deficit when sufficient parking', () => {
    const parcelId = generateId()
    const b = mockBuilding('residential', { apartments: 10 })
    const parcel = mockParcel(parcelId, [b.id])
    const parking = mockParking(1000, [parcelId]) // plenty

    const balance = buildParkingBalance(parcel, [b], [parking], DEFAULT_PARKING_RULES)
    expect(balance.deficit).toBe(0)
    expect(balance.surplus).toBeGreaterThan(0)
  })

  test('parking not in servedParcelIds is not counted in createdCapacity', () => {
    const parcelId = generateId()
    const b = mockBuilding('residential', { apartments: 20 })
    const parcel = mockParcel(parcelId, [b.id])
    // parking serves a different parcel
    const parking = mockParking(500, ['other-parcel-id'])

    const balance = buildParkingBalance(parcel, [b], [parking], DEFAULT_PARKING_RULES)
    expect(balance.createdCapacity).toBe(0)
  })
})
