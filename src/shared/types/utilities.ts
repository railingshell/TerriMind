// TerriMind — Engineering utilities (инженерные сети) domain model — Stage 5

import type { StableId, Timestamped, Violation, DataSource, ScenarioId } from './common'
import type { GeoLineString, GeoPoint } from './geometry'

export type UtilityType =
  | 'water-supply'
  | 'sewage'
  | 'storm-drain'
  | 'electricity'
  | 'heating'
  | 'gas'
  | 'telecom'
  | 'custom'

export type UtilityExistence = 'existing' | 'projected'

export interface UtilityNetwork extends Timestamped {
  id: StableId
  type: UtilityType
  customTypeLabel?: string
  name: string

  geometry: GeoLineString
  length: number          // metres — computed from geometry
  existence: UtilityExistence

  // Physical parameters (optional)
  diameter?: number        // mm
  capacity?: number        // kW, l/s, etc.
  pressureClass?: string

  // Protection zone
  protectionZoneWidth: number  // metres each side

  // Service
  connectionPointIds: StableId[]
  servedObjectIds: StableId[]

  // Economics
  estimatedCostPerMetre: number  // RUB/m
  estimatedTotalCost: number

  status: 'active' | 'planned' | 'decommissioned'
  violations: Violation[]
  dataSource: DataSource
  scenarioId?: ScenarioId
  userMetadata: Record<string, unknown>
}

export interface UtilityConnectionPoint extends Timestamped {
  id: StableId
  type: UtilityType
  position: [number, number]
  geometry: GeoPoint
  label: string
  existence: UtilityExistence
  connectedNetworkIds: StableId[]
  servedObjectIds: StableId[]
  dataSource: DataSource
}

/** Engineering readiness assessment for a scope */
export interface EngineeringReadiness {
  scopeId: StableId
  scopeType: 'project' | 'block' | 'parcel'

  hasRoadAccess: boolean
  hasPedestrianAccess: boolean
  hasTerrainData: boolean
  slopeComplexity: 'low' | 'medium' | 'high'
  drainageRisk: 'low' | 'medium' | 'high' | 'unknown'

  // Utility presence
  utilityStatus: Partial<Record<UtilityType, 'connected' | 'nearby' | 'missing' | 'unknown'>>
  missingUtilities: UtilityType[]
  totalNetworkLength: number  // m — projected networks
  connectionPointsAvailable: number
  objectsWithoutConnection: number

  // Cost
  estimatedPreparationCost: number  // RUB — rough estimate

  // Conflicts
  networkConflictCount: number

  // Data completeness
  dataCompleteness: number  // 0..1
  status: 'ready' | 'partial' | 'not-ready' | 'unknown'
  missingDataItems: string[]
}
