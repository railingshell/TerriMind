import { describe, test, expect } from '@jest/globals'
import {
  getElevationAt,
  calculateSlopeAt,
  classifySlope,
  analyzeAllSlopes,
  estimateEarthworks,
  createElevationGrid
} from '../../src/renderer/services/terrain-analysis/terrainEngine'
import type { DesignSurface } from '../../src/shared/types/terrain'
import { generateId, nowISO } from '../../src/shared/utils/id'

function flatGrid(elevation: number, size: number = 5): ReturnType<typeof createElevationGrid> {
  const data = Array(size * size).fill(elevation)
  return createElevationGrid(0, 0, 10, size, size, data)
}

function slopedGrid(): ReturnType<typeof createElevationGrid> {
  // 5x5 grid with elevation increasing along X
  const data: number[] = []
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      data.push(c * 1) // 1m rise per 10m horizontal → 10% slope
    }
  }
  return createElevationGrid(0, 0, 10, 5, 5, data)
}

describe('getElevationAt', () => {
  test('returns correct elevation for on-grid point', () => {
    const grid = flatGrid(50)
    const elev = getElevationAt(grid, 0, 0)
    expect(elev).toBeCloseTo(50, 1)
  })

  test('returns null for out-of-bounds point', () => {
    const grid = flatGrid(50)
    expect(getElevationAt(grid, 999, 999)).toBeNull()
  })

  test('interpolates between grid points', () => {
    const grid = createElevationGrid(0, 0, 10, 3, 3, [
      0, 10, 20,
      0, 10, 20,
      0, 10, 20
    ])
    const elev = getElevationAt(grid, 5, 5) // midpoint should be ~5
    expect(elev).not.toBeNull()
    expect(elev!).toBeCloseTo(5, 0)
  })
})

describe('calculateSlopeAt', () => {
  test('returns ~0% slope for flat surface', () => {
    const grid = flatGrid(50)
    const info = calculateSlopeAt(grid, 2, 2)
    expect(info).not.toBeNull()
    expect(info!.slopePercent).toBeCloseTo(0, 1)
  })

  test('returns non-zero slope for tilted surface', () => {
    const grid = slopedGrid()
    const info = calculateSlopeAt(grid, 2, 2)
    expect(info).not.toBeNull()
    expect(info!.slopePercent).toBeGreaterThan(0)
  })

  test('returns null for boundary cells', () => {
    const grid = flatGrid(50)
    expect(calculateSlopeAt(grid, 0, 0)).toBeNull()
    expect(calculateSlopeAt(grid, 4, 4)).toBeNull()
  })
})

describe('classifySlope', () => {
  test('classifies flat correctly', () => { expect(classifySlope(0.3)).toBe('flat') })
  test('classifies gentle correctly', () => { expect(classifySlope(1.5)).toBe('gentle') })
  test('classifies moderate correctly', () => { expect(classifySlope(3)).toBe('moderate') })
  test('classifies steep correctly', () => { expect(classifySlope(7)).toBe('steep') })
  test('classifies very-steep correctly', () => { expect(classifySlope(15)).toBe('very-steep') })
  test('classifies extreme correctly', () => { expect(classifySlope(25)).toBe('extreme') })
})

describe('analyzeAllSlopes', () => {
  test('processes flat grid without errors', () => {
    const grid = flatGrid(50, 7)
    const result = analyzeAllSlopes(grid)
    expect(result.distribution.flat).toBeGreaterThan(0)
    expect(result.avgSlope).toBeCloseTo(0, 1)
  })

  test('returns distribution summing to total cells (minus border)', () => {
    const grid = flatGrid(10, 6)
    const result = analyzeAllSlopes(grid)
    const totalCells = Object.values(result.distribution).reduce((s, v) => s + v, 0)
    // interior cells = (6-2) × (6-2) = 16
    expect(totalCells).toBe(16)
  })
})

describe('estimateEarthworks', () => {
  test('zero volumes for empty design surface', () => {
    const grid = flatGrid(10)
    const ds: DesignSurface = {
      id: generateId(), projectId: 'p', name: 'Test',
      controlPoints: [], roadGrades: [], isActive: true,
      createdAt: nowISO(), updatedAt: nowISO()
    }
    const result = estimateEarthworks(grid, ds, ds.id)
    expect(result.cutVolume).toBe(0)
    expect(result.fillVolume).toBe(0)
  })

  test('generates fill when design > existing', () => {
    const grid = flatGrid(10) // existing = 10m everywhere
    const ds: DesignSurface = {
      id: generateId(), projectId: 'p', name: 'Test',
      controlPoints: [
        { id: generateId(), position: [20, 20], designElevation: 12, isFixed: false } // design = 12 > existing 10
      ],
      roadGrades: [], isActive: true,
      createdAt: nowISO(), updatedAt: nowISO()
    }
    const result = estimateEarthworks(grid, ds, ds.id)
    expect(result.fillVolume).toBeGreaterThan(0)
    expect(result.cutVolume).toBe(0)
  })

  test('generates cut when design < existing', () => {
    const grid = flatGrid(10) // existing = 10m
    const ds: DesignSurface = {
      id: generateId(), projectId: 'p', name: 'Test',
      controlPoints: [
        { id: generateId(), position: [20, 20], designElevation: 7, isFixed: false } // design = 7 < existing 10
      ],
      roadGrades: [], isActive: true,
      createdAt: nowISO(), updatedAt: nowISO()
    }
    const result = estimateEarthworks(grid, ds, ds.id)
    expect(result.cutVolume).toBeGreaterThan(0)
    expect(result.fillVolume).toBe(0)
  })
})
