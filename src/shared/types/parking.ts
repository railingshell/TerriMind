// TerriMind — Parking domain model — Stage 5

import type { StableId, Timestamped, Violation, DataSource, DataQuality, ScenarioId } from './common'
import type { GeoPolygon } from './geometry'

export type ParkingType =
  | 'open-surface'      // наземная открытая
  | 'on-street'         // уличная
  | 'guest'             // гостевая
  | 'embedded'          // встроенная
  | 'underground'       // подземная
  | 'multi-level'       // многоуровневая
  | 'park-and-ride'     // перехватывающая
  | 'service'           // служебная
  | 'disabled'          // для маломобильных
  | 'bicycle'           // велосипедная
  | 'custom'

export type ParkingExistence = 'existing' | 'projected'

export interface ParkingFacility extends Timestamped {
  id: StableId
  type: ParkingType
  customTypeLabel?: string

  geometry: GeoPolygon
  area: number          // m2
  capacity: number      // total spots
  levels: number        // 1 for surface, N for multi-level or underground
  disabledSpots: number
  bicycleSpots: number

  // Service scope
  servedBuildingIds: StableId[]
  servedParcelIds: StableId[]

  // Access
  accessMode: 'public' | 'restricted' | 'private'

  // Economics
  estimatedConstructionCost: number // RUB
  areaEfficiencyRatio: number       // useful spots / total area (spots/m2)

  existence: ParkingExistence
  violations: Violation[]
  dataSource: DataSource
  scenarioId?: ScenarioId
  userMetadata: Record<string, unknown>
}

/** Parking demand rule — one rule per land-use category */
export interface ParkingDemandRule {
  id: string
  label: string
  landUse: string
  unit: 'per-apartment' | 'per-100m2' | 'per-person' | 'per-employee' | 'per-seat'
  rate: number           // spots per unit
  guestRate?: number     // additional guest spots per unit
  maxDistance: number    // max metres to shared parking
  sharedUseFactor: number  // 0..1 — reduction if shared with other uses
  source: string
  isUserDefined: boolean
}

/** Aggregated parking balance for one scope (parcel / block / project) */
export interface ParkingBalance {
  scopeId: StableId
  scopeType: 'parcel' | 'block' | 'project'

  demand: number
  createdCapacity: number     // parking facilities inside scope
  accessibleCapacity: number  // parking within maxDistance
  deficit: number
  surplus: number

  demandByLandUse: Array<{ landUse: string; demand: number; rule: string }>
  capacityByType: Partial<Record<ParkingType, number>>

  avgDistanceToParking: number  // metres
  buildingsWithDeficit: number
  buildingsTotal: number

  // Rules applied
  rulesUsed: ParkingDemandRule[]
  sharedParkingGroups: Array<{ spotId: StableId; sharedWith: StableId[] }>

  dataQuality: DataQuality
  assumptions: string[]
}
