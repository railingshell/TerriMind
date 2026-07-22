// TerriMind — Terrain analysis engine
// Works with local elevation data only — no internet required.
// Results are preliminary — not engineering survey quality.

import type {
  ElevationGrid,
  SlopeInfo,
  SlopeClass,
  EarthworksEstimate,
  DesignSurface,
  DrainageAnalysis
} from '@shared/types/terrain'
import type { GeoPosition } from '@shared/types/geometry'
import { generateId, nowISO } from '@shared/utils/id'

const NO_DATA = NaN

/** Get interpolated elevation at a point using bilinear interpolation */
export function getElevationAt(grid: ElevationGrid, x: number, y: number): number | null {
  const col = (x - grid.originX) / grid.cellSize
  const row = (y - grid.originY) / grid.cellSize

  if (col < 0 || row < 0 || col > grid.cols - 1 || row > grid.rows - 1) return null

  const col0 = Math.floor(col)
  const row0 = Math.floor(row)
  const col1 = Math.min(col0 + 1, grid.cols - 1)
  const row1 = Math.min(row0 + 1, grid.rows - 1)

  const q00 = grid.data[row0 * grid.cols + col0]
  const q10 = grid.data[row0 * grid.cols + col1]
  const q01 = grid.data[row1 * grid.cols + col0]
  const q11 = grid.data[row1 * grid.cols + col1]

  if ([q00, q10, q01, q11].some(v => isNaN(v) || v === grid.noDataValue)) return null

  const tx = col - col0
  const ty = row - row0
  const top = q00 * (1 - tx) + q10 * tx
  const bot = q01 * (1 - tx) + q11 * tx
  return top * (1 - ty) + bot * ty
}

/** Calculate slope at a grid cell using finite differences */
export function calculateSlopeAt(grid: ElevationGrid, col: number, row: number): SlopeInfo | null {
  if (col <= 0 || row <= 0 || col >= grid.cols - 1 || row >= grid.rows - 1) return null

  const h = (c: number, r: number) => {
    const v = grid.data[r * grid.cols + c]
    return isNaN(v) || v === grid.noDataValue ? null : v
  }

  const east = h(col + 1, row)
  const west = h(col - 1, row)
  const north = h(col, row - 1)
  const south = h(col, row + 1)
  const center = h(col, row)

  if (center === null || east === null || west === null || north === null || south === null) return null

  const dzdx = (east - west) / (2 * grid.cellSize)
  const dzdy = (south - north) / (2 * grid.cellSize)

  const slopeFrac = Math.sqrt(dzdx * dzdx + dzdy * dzdy)
  const slopePercent = slopeFrac * 100
  const slopeDegrees = Math.atan(slopeFrac) * (180 / Math.PI)
  const aspect = (Math.atan2(-dzdx, dzdy) * (180 / Math.PI) + 360) % 360

  const x = grid.originX + col * grid.cellSize
  const y = grid.originY + row * grid.cellSize

  return {
    position: [x, y],
    elevation: center,
    slopePercent: Math.round(slopePercent * 10) / 10,
    slopeDegrees: Math.round(slopeDegrees * 10) / 10,
    aspect: Math.round(aspect),
    drainageDirection: [-dzdx, -dzdy],
    classification: classifySlope(slopePercent)
  }
}

export function classifySlope(slopePercent: number): SlopeClass {
  if (slopePercent < 0.5) return 'flat'
  if (slopePercent < 2) return 'gentle'
  if (slopePercent < 5) return 'moderate'
  if (slopePercent < 10) return 'steep'
  if (slopePercent < 20) return 'very-steep'
  return 'extreme'
}

/** Analyse all grid cells and return slope distribution */
export function analyzeAllSlopes(grid: ElevationGrid): {
  slopeInfos: SlopeInfo[]
  distribution: Record<SlopeClass, number>
  avgSlope: number
  maxSlope: number
  noDataCells: number
} {
  const infos: SlopeInfo[] = []
  let sumSlope = 0
  let maxSlope = 0
  let noDataCells = 0

  const dist: Record<SlopeClass, number> = {
    flat: 0, gentle: 0, moderate: 0, steep: 0, 'very-steep': 0, extreme: 0
  }

  for (let r = 1; r < grid.rows - 1; r++) {
    for (let c = 1; c < grid.cols - 1; c++) {
      const info = calculateSlopeAt(grid, c, r)
      if (!info) { noDataCells++; continue }
      infos.push(info)
      sumSlope += info.slopePercent
      if (info.slopePercent > maxSlope) maxSlope = info.slopePercent
      dist[info.classification]++
    }
  }

  const avgSlope = infos.length > 0 ? sumSlope / infos.length : 0

  return { slopeInfos: infos, distribution: dist, avgSlope, maxSlope, noDataCells }
}

/** 
 * Preliminary earthworks estimate.
 * PRELIMINARY ONLY — not engineering documentation.
 */
export function estimateEarthworks(
  grid: ElevationGrid,
  designSurface: DesignSurface,
  designSurfaceId: string
): EarthworksEstimate {
  if (designSurface.controlPoints.length === 0) {
    return emptyEarthworksEstimate(designSurfaceId)
  }

  // Build a simple design elevation for each grid cell
  // by nearest control point (Voronoi approximation)
  let cutVolume = 0
  let fillVolume = 0
  let affectedCells = 0
  let noDataCells = 0
  let maxCutDepth = 0
  let maxFillHeight = 0
  let sumCut = 0, sumFill = 0, cutCells = 0, fillCells = 0

  const cellArea = grid.cellSize * grid.cellSize

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const existingElev = grid.data[r * grid.cols + c]
      if (isNaN(existingElev) || existingElev === grid.noDataValue) { noDataCells++; continue }

      const x = grid.originX + c * grid.cellSize
      const y = grid.originY + r * grid.cellSize

      const designElev = interpolateDesignElevation(designSurface, x, y)
      if (designElev === null) continue

      const diff = designElev - existingElev // positive = fill, negative = cut

      if (Math.abs(diff) < 0.01) continue  // negligible
      affectedCells++

      if (diff < 0) {
        const cut = Math.abs(diff) * cellArea
        cutVolume += cut
        sumCut += Math.abs(diff)
        cutCells++
        if (Math.abs(diff) > maxCutDepth) maxCutDepth = Math.abs(diff)
      } else {
        const fill = diff * cellArea
        fillVolume += fill
        sumFill += diff
        fillCells++
        if (diff > maxFillHeight) maxFillHeight = diff
      }
    }
  }

  const totalCells = grid.rows * grid.cols
  const uncertainty = noDataCells > 0 ? Math.round((noDataCells / totalCells) * 100) : 5

  return {
    id: generateId(),
    designSurfaceId,
    computedAt: nowISO(),
    cutVolume: Math.round(cutVolume),
    fillVolume: Math.round(fillVolume),
    balance: Math.round(fillVolume - cutVolume),
    affectedArea: affectedCells * cellArea,
    avgCutDepth: cutCells > 0 ? Math.round((sumCut / cutCells) * 100) / 100 : 0,
    avgFillHeight: fillCells > 0 ? Math.round((sumFill / fillCells) * 100) / 100 : 0,
    maxCutDepth: Math.round(maxCutDepth * 100) / 100,
    maxFillHeight: Math.round(maxFillHeight * 100) / 100,
    cellSize: grid.cellSize,
    uncertainty,
    noDataArea: noDataCells * cellArea,
    quality: uncertainty > 20 ? 'low' : uncertainty > 10 ? 'medium' : 'high',
    method: 'Grid cell difference (nearest design control point)',
    assumptions: [
      'Предварительная оценка, не является рабочей документацией',
      'Проектные отметки интерполированы по ближайшим контрольным точкам',
      `Погрешность оценивается в ~${uncertainty}%`
    ]
  }
}

function interpolateDesignElevation(surface: DesignSurface, x: number, y: number): number | null {
  if (surface.controlPoints.length === 0) return null
  // IDW interpolation from control points
  let weightSum = 0, elevSum = 0
  for (const cp of surface.controlPoints) {
    const dx = x - cp.position[0]
    const dy = y - cp.position[1]
    const d2 = dx * dx + dy * dy
    if (d2 < 0.0001) return cp.designElevation // exact match
    const w = 1 / d2
    weightSum += w
    elevSum += w * cp.designElevation
  }
  return weightSum > 0 ? elevSum / weightSum : null
}

function emptyEarthworksEstimate(designSurfaceId: string): EarthworksEstimate {
  return {
    id: generateId(),
    designSurfaceId,
    computedAt: nowISO(),
    cutVolume: 0, fillVolume: 0, balance: 0, affectedArea: 0,
    avgCutDepth: 0, avgFillHeight: 0, maxCutDepth: 0, maxFillHeight: 0,
    cellSize: 0, uncertainty: 100, noDataArea: 0,
    quality: 'unknown',
    method: 'No design surface defined',
    assumptions: ['Нет проектных отметок — расчёт невозможен']
  }
}

/**
 * Preliminary drainage analysis.
 * NOT a hydrological model — for conceptual planning only.
 */
export function analyzeDrainage(grid: ElevationGrid): DrainageAnalysis {
  const arrows: DrainageAnalysis['drainageArrows'] = []
  const depressions: DrainageAnalysis['localDepressions'] = []
  const cellSize = grid.cellSize

  // Sample every Nth cell for display
  const step = Math.max(1, Math.floor(Math.min(grid.rows, grid.cols) / 20))

  for (let r = 1; r < grid.rows - 1; r += step) {
    for (let c = 1; c < grid.cols - 1; c += step) {
      const info = calculateSlopeAt(grid, c, r)
      if (!info || !info.drainageDirection) continue

      const from: GeoPosition = [info.position[0], info.position[1]]
      const dir = info.drainageDirection
      const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1])
      if (len < 0.001) {
        // Local depression
        depressions.push({ position: from, area: cellSize * cellSize })
        continue
      }
      const scale = cellSize * 0.8 / len
      const to: GeoPosition = [from[0] + dir[0] * scale, from[1] + dir[1] * scale]
      arrows.push({ from, to })
    }
  }

  return {
    computedAt: nowISO(),
    drainageArrows: arrows,
    localDepressions: depressions,
    accumulationZones: [],
    streamsWithoutOutlet: [],
    roadCrossings: [],
    userOutletPoints: [],
    disclaimer: 'Предварительная схема водоотвода. Не является гидрологическим расчётом. ' +
      'Требуется профессиональный анализ для проектных решений.'
  }
}

/** Parse a simple GeoTIFF-like grid from a flat array of elevations (row-major) */
export function createElevationGrid(
  originX: number,
  originY: number,
  cellSize: number,
  cols: number,
  rows: number,
  data: number[],
  noDataValue = -9999
): ElevationGrid {
  const typed = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) {
    typed[i] = data[i] === noDataValue ? NaN : data[i]
  }
  return { originX, originY, cellSize, cols, rows, data: typed, noDataValue }
}
