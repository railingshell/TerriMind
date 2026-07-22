// TerriMind — Block (квартал) domain model

import type { StableId, Timestamped, Violation, DataSource } from './common'
import type { GeoPolygon } from './geometry'

export type BlockId = StableId

export interface Block extends Timestamped {
  id: BlockId
  name: string
  number: string
  geometry: GeoPolygon
  area: number           // m2 — computed from geometry
  usableArea: number     // m2 — after roads / public space deduction
  zoningType: string
  parcelIds: StableId[]  // child land parcels
  buildingIds: StableId[]
  roadEdgeIds: StableId[]
  violations: Violation[]
  source: DataSource
  isLocked: boolean
  scenarioId?: StableId
}
