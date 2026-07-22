// TerriMind — Terrain & relief domain model — Stage 5

import type { StableId, Timestamped, DataQuality, DataSource } from './common'
import type { BoundingBox } from './geometry'

export type TerrainSourceType =
  | 'geotiff'
  | 'grid'
  | 'csv-xyz'
  | 'elevation-points'
  | 'contour-lines'
  | 'tin'
  | 'manual'
  | 'flat-model'   // explicit flat assumption

export interface TerrainMetadata extends Timestamped {
  id: StableId
  projectId: StableId
  sourceType: TerrainSourceType
  fileName?: string
  fileChecksum?: string
  filePath?: string       // relative path within project data dir
  fileSize?: number       // bytes
  isFileAvailable: boolean

  // Coverage
  bounds: BoundingBox
  resolution: number      // metres per cell (grid)
  crs?: string            // coordinate reference system WKT or EPSG code

  // Statistics (computed during import)
  minElevation: number    // metres
  maxElevation: number    // metres
  avgElevation: number
  hasNoDataAreas: boolean
  noDataPercent: number   // 0..100

  quality: DataQuality
  dataSource: DataSource
  importedAt: string
}

/** In-memory sampled elevation grid for fast queries */
export interface ElevationGrid {
  originX: number
  originY: number
  cellSize: number       // metres
  cols: number
  rows: number
  data: Float32Array     // row-major, NaN = no data
  noDataValue: number
}

export interface ElevationPoint {
  id: StableId
  position: [number, number]
  elevation: number    // metres
  source: 'import' | 'manual'
  label?: string
}

/** Slope analysis result for one cell or polygon */
export interface SlopeInfo {
  position: [number, number]
  elevation: number
  slopePercent: number      // rise/run * 100
  slopeDegrees: number
  aspect: number            // degrees from North, 0..360
  drainageDirection?: [number, number] // unit vector
  classification: SlopeClass
}

export type SlopeClass =
  | 'flat'           // < 0.5%
  | 'gentle'         // 0.5–2%
  | 'moderate'       // 2–5%
  | 'steep'          // 5–10%
  | 'very-steep'     // 10–20%
  | 'extreme'        // > 20%

/** User-defined design elevation surface */
export interface DesignSurface extends Timestamped {
  id: StableId
  projectId: StableId
  name: string
  controlPoints: DesignControlPoint[]
  roadGrades: RoadGradeSegment[]
  isActive: boolean
}

export interface DesignControlPoint {
  id: StableId
  position: [number, number]
  designElevation: number   // metres
  existingElevation?: number
  isFixed: boolean
}

export interface RoadGradeSegment {
  id: StableId
  roadSegmentId?: StableId
  startElevation: number
  endElevation: number
  length: number
  grade: number   // %
}

/** Earthworks volume estimate */
export interface EarthworksEstimate {
  id: StableId
  designSurfaceId: StableId
  computedAt: string

  cutVolume: number    // m3
  fillVolume: number   // m3
  balance: number      // fill - cut (negative = net cut)
  affectedArea: number // m2

  avgCutDepth: number  // metres
  avgFillHeight: number
  maxCutDepth: number
  maxFillHeight: number

  cellSize: number     // m — computation grid
  uncertainty: number  // % estimated error

  // Areas with no data
  noDataArea: number

  quality: DataQuality
  method: string
  assumptions: string[]
}

/** Preliminary drainage analysis result */
export interface DrainageAnalysis {
  computedAt: string
  drainageArrows: Array<{ from: [number, number]; to: [number, number] }>
  localDepressions: Array<{ position: [number, number]; area: number }>
  accumulationZones: Array<{ position: [number, number]; upstreamArea: number }>
  streamsWithoutOutlet: Array<{ path: Array<[number, number]> }>
  roadCrossings: Array<{ position: [number, number]; roadId: StableId }>
  userOutletPoints: Array<{ position: [number, number]; label: string }>
  disclaimer: string
}
