// TerriMind — Building domain model

import type { StableId, Timestamped, Violation, DataSource } from './common'
import type { GeoPolygon } from './geometry'

export type BuildingId = StableId

export type BuildingUse =
  | 'residential'
  | 'mixed'
  | 'commercial'
  | 'office'
  | 'education'
  | 'healthcare'
  | 'sport'
  | 'culture'
  | 'industrial'
  | 'utility'
  | 'parking-structure'
  | 'custom'

export interface Building extends Timestamped {
  id: BuildingId
  blockId: StableId
  parcelId?: StableId
  footprint: GeoPolygon
  footprintArea: number   // m2
  floors: number
  height: number          // metres
  totalArea: number       // m2 = footprintArea * floors (gross)
  residentialArea: number // m2
  commercialArea: number  // m2
  use: BuildingUse
  apartments: number
  residents: number
  workplaces: number
  entrances: Array<{ position: [number, number]; type: 'pedestrian' | 'vehicle' | 'emergency' }>
  parkingSpots: number    // in-building
  violations: Violation[]
  source: DataSource
  isLocked: boolean
  userLabel?: string
  scenarioId?: StableId
}
