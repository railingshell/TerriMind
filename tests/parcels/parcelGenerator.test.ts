import { describe, test, expect } from '@jest/globals'
import { generateParcelsForBlock } from '../../src/renderer/services/parcel-generation/parcelGenerator'
import type { Block } from '../../src/shared/types/blocks'
import type { Building } from '../../src/shared/types/buildings'
import { makeRect } from '../../src/shared/utils/geometry'
import { generateId, nowISO } from '../../src/shared/utils/id'

function mockBlock(): Block {
  const now = nowISO()
  return {
    id: generateId(), name: 'Test Block', number: '1',
    geometry: makeRect(0, 0, 200, 200), area: 40000,
    usableArea: 35000, zoningType: 'residential',
    parcelIds: [], buildingIds: [], roadEdgeIds: [],
    violations: [], source: { type: 'manual', label: 'Test' },
    isLocked: false, createdAt: now, updatedAt: now
  }
}

function mockBuilding(blockId: string, use: Building['use'], area: number): Building {
  const now = nowISO()
  return {
    id: generateId(), blockId,
    footprint: makeRect(50, 50, Math.sqrt(area), Math.sqrt(area)),
    footprintArea: area, floors: 5, height: 15,
    totalArea: area * 5, residentialArea: area * 4, commercialArea: area,
    use, apartments: Math.floor(area * 5 / 50), residents: Math.floor(area * 5 / 50) * 2, workplaces: 10,
    entrances: [{ position: [50, 50], type: 'pedestrian' }],
    parkingSpots: 0, violations: [],
    source: { type: 'manual', label: 'Test' }, isLocked: false,
    createdAt: now, updatedAt: now
  }
}

describe('generateParcelsForBlock', () => {
  test('generates at least one parcel per block', () => {
    const block = mockBlock()
    const result = generateParcelsForBlock(block, [], [])
    expect(result.parcels.length).toBeGreaterThan(0)
  })

  test('all parcels reference the correct blockId', () => {
    const block = mockBlock()
    const result = generateParcelsForBlock(block, [], [])
    for (const parcel of result.parcels) {
      expect(parcel.blockId).toBe(block.id)
    }
  })

  test('parcels with buildings have buildingIds set', () => {
    const block = mockBlock()
    const b = mockBuilding(block.id, 'residential', 500)
    const result = generateParcelsForBlock(block, [b], [])
    const withBuildings = result.parcels.filter(p => p.buildingIds.length > 0)
    expect(withBuildings.length).toBeGreaterThan(0)
  })

  test('result has quality field', () => {
    const block = mockBlock()
    const result = generateParcelsForBlock(block, [], [])
    expect(['good', 'acceptable', 'poor']).toContain(result.quality)
  })

  test('result has blockId matching input', () => {
    const block = mockBlock()
    const result = generateParcelsForBlock(block, [], [])
    expect(result.blockId).toBe(block.id)
  })

  test('unassigned area is non-negative', () => {
    const block = mockBlock()
    const result = generateParcelsForBlock(block, [], [])
    expect(result.unassignedArea).toBeGreaterThanOrEqual(0)
  })

  test('parcel areas are positive', () => {
    const block = mockBlock()
    const result = generateParcelsForBlock(block, [], [])
    for (const parcel of result.parcels) {
      expect(parcel.area).toBeGreaterThan(0)
    }
  })
})
