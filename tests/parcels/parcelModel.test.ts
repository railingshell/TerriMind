import { describe, test, expect } from '@jest/globals'
import { createParcel, recalculateParcelMetrics, validateParcel, calcBlockAreaBalance } from '../../src/renderer/domain/parcels/parcelModel'
import { makeRect } from '../../src/shared/utils/geometry'
import type { Building } from '../../src/shared/types/buildings'
import type { LandParcel } from '../../src/shared/types/parcels'
import { generateId, nowISO } from '../../src/shared/utils/id'

function mockBuilding(blockId: string, parcelId: string, area: number, floors: number): Building {
  const now = nowISO()
  return {
    id: generateId(), blockId, parcelId,
    footprint: makeRect(0, 0, Math.sqrt(area), Math.sqrt(area)),
    footprintArea: area,
    floors, height: floors * 3,
    totalArea: area * floors,
    residentialArea: area * floors * 0.8,
    commercialArea: 0,
    use: 'residential',
    apartments: Math.floor(area * floors / 50),
    residents: Math.floor(area * floors / 50) * 2,
    workplaces: 0,
    entrances: [],
    parkingSpots: 0,
    violations: [],
    source: { type: 'manual', label: 'Test' },
    isLocked: false,
    createdAt: now, updatedAt: now
  }
}

describe('createParcel', () => {
  test('creates parcel with correct designation and geometry', () => {
    const geom = makeRect(0, 0, 100, 80)
    const parcel = createParcel('block-1', geom, 'residential', 'manual', 0)

    expect(parcel.blockId).toBe('block-1')
    expect(parcel.designation).toBe('residential')
    expect(parcel.area).toBeCloseTo(8000, 0)
    expect(parcel.source).toBe('manual')
    expect(parcel.projectNumber).toBe('Ж-0001')
    expect(parcel.status).toBe('proposed')
  })

  test('generates unique IDs', () => {
    const geom = makeRect(0, 0, 50, 50)
    const a = createParcel('b', geom, 'residential', 'manual', 0)
    const b = createParcel('b', geom, 'residential', 'manual', 1)
    expect(a.id).not.toBe(b.id)
  })
})

describe('recalculateParcelMetrics', () => {
  test('correctly sums building footprints and floors', () => {
    const geom = makeRect(0, 0, 200, 200) // 40 000 m²
    const parcel = createParcel('block-1', geom, 'residential', 'manual', 0)
    const b1 = mockBuilding('block-1', parcel.id, 1000, 5) // 5000 m² total
    const b2 = mockBuilding('block-1', parcel.id, 2000, 3) // 6000 m² total

    const updated: LandParcel = { ...parcel, buildingIds: [b1.id, b2.id] }
    const result = recalculateParcelMetrics(updated, [b1, b2])

    expect(result.footprintArea).toBeCloseTo(3000, 0)
    expect(result.totalBuildingArea).toBeCloseTo(11000, 0)
    expect(result.buildingCoverageRatio).toBeCloseTo(3000 / 40000, 4)
    expect(result.floorAreaRatio).toBeCloseTo(11000 / 40000, 4)
    expect(result.dominantFloors).toBe(5)
    expect(result.population).toBe(b1.residents + b2.residents)
  })

  test('returns zero metrics for empty building list', () => {
    const parcel = createParcel('b', makeRect(0, 0, 100, 100), 'residential', 'manual', 0)
    const result = recalculateParcelMetrics(parcel, [])
    expect(result.footprintArea).toBe(0)
    expect(result.buildingCoverageRatio).toBe(0)
  })
})

describe('validateParcel', () => {
  const cfg = { minAreaM2: 200, maxAreaM2: 50000, minWidthM: 10, requireRoadAccess: false }

  test('valid parcel passes validation', () => {
    const parcel = createParcel('b', makeRect(0, 0, 50, 60), 'residential', 'manual', 0)
    const result = validateParcel(parcel, cfg)
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('too-small parcel fails', () => {
    const parcel = createParcel('b', makeRect(0, 0, 5, 5), 'residential', 'manual', 0) // 25 m²
    const result = validateParcel(parcel, cfg)
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.includes('minimum'))).toBe(true)
  })

  test('road access required and missing fails', () => {
    const cfgWithAccess = { ...cfg, requireRoadAccess: true }
    const parcel = createParcel('b', makeRect(0, 0, 50, 50), 'residential', 'manual', 0)
    const result = validateParcel(parcel, cfgWithAccess)
    expect(result.isValid).toBe(false)
  })
})

describe('calcBlockAreaBalance', () => {
  test('balanced when parcels + roads ≈ block area', () => {
    const blockArea = 10000
    const p1 = createParcel('b', makeRect(0, 0, 80, 80), 'residential', 'manual', 0) // 6400
    const p2 = createParcel('b', makeRect(0, 0, 50, 50), 'green-public', 'manual', 1)  // 2500
    const roadArea = 1000
    const balance = calcBlockAreaBalance(blockArea, [p1, p2], roadArea)
    expect(balance.parcelArea).toBeCloseTo(6400 + 2500, 0)
    expect(balance.roadArea).toBe(roadArea)
    expect(balance.isBalanced).toBe(true)
  })

  test('unbalanced when large area unexplained', () => {
    const blockArea = 20000
    const p1 = createParcel('b', makeRect(0, 0, 50, 50), 'residential', 'manual', 0)
    const balance = calcBlockAreaBalance(blockArea, [p1], 0)
    // parcel 2500, block 20000 → large unaccounted area
    expect(balance.isBalanced).toBe(false)
  })
})
