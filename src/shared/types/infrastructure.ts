// TerriMind — Social & public infrastructure domain model — Stage 5

import type { StableId, Timestamped, Violation, DataSource, DataQuality, ScenarioId, ConfidenceLevel } from './common'
import type { GeoPoint, GeoPolygon } from './geometry'

export type InfrastructureCategory =
  | 'education'
  | 'healthcare'
  | 'sport'
  | 'culture'
  | 'commercial'
  | 'safety'
  | 'utilities'

export type InfrastructureType =
  // Education
  | 'kindergarten'
  | 'school'
  | 'education-complex'
  | 'extra-curricular'
  | 'college'
  | 'education-custom'
  // Healthcare
  | 'polyclinic'
  | 'medical-post'
  | 'ambulatory'
  | 'diagnostic-center'
  | 'healthcare-custom'
  // Sport
  | 'fitness-center'
  | 'sport-hall'
  | 'stadium'
  | 'sport-ground'
  | 'swimming-pool'
  | 'sport-custom'
  // Culture
  | 'cultural-center'
  | 'library'
  | 'club'
  | 'leisure-center'
  | 'community-center'
  | 'administrative'
  | 'culture-custom'
  // Commercial
  | 'embedded-retail'
  | 'standalone-retail'
  | 'office'
  | 'business-center'
  | 'household-services'
  | 'food-service'
  | 'commercial-custom'
  // Safety
  | 'fire-station'
  | 'police-post'
  | 'emergency-service'
  | 'utilities-facility'
  | 'safety-custom'

export type CapacityUnit =
  | 'place'
  | 'student'
  | 'child'
  | 'visit-per-day'
  | 'seat'
  | 'bed'
  | 'employee'
  | 'm2'

export type TargetGroup =
  | 'children-0-3'
  | 'children-3-7'
  | 'children-7-18'
  | 'working-age'
  | 'elderly'
  | 'all'
  | 'custom'

export type ObjectExistence = 'existing' | 'projected'
export type ObjectActivation = 'active' | 'disabled'

/** A concrete infrastructure facility (building or ground-level object) */
export interface InfrastructureObject extends Timestamped {
  id: StableId
  category: InfrastructureCategory
  type: InfrastructureType
  subtype?: string
  name: string

  // Location
  geometry: GeoPoint | GeoPolygon
  parcelId?: StableId
  blockId?: StableId
  buildingId?: StableId

  // Capacity
  capacity: number
  capacityUnit: CapacityUnit
  buildingArea: number   // m2
  parcelArea: number     // m2
  floors: number

  // Service parameters
  operatingHours?: string
  targetGroup: TargetGroup
  customTargetGroupLabel?: string

  // Normative
  normativeStandard?: number     // places per 1000 people (or per N apartments etc.)
  normativeUnit?: string
  serviceRadius: number          // metres (straight-line fallback)
  maxAccessTimeMinutes: number   // minutes walk / drive

  // Access
  entrances: Array<{ position: [number, number]; type: 'pedestrian' | 'vehicle' }>
  parkingSpots: number

  // Status
  existence: ObjectExistence
  activation: ObjectActivation

  // Data quality
  dataSource: DataSource
  normativeSource?: string
  confidence: ConfidenceLevel
  scenarioId?: ScenarioId

  // Validation
  violations: Violation[]
  userMetadata: Record<string, unknown>
}

/** 
 * Balance of supply vs demand for one infrastructure type 
 * All values are in capacityUnit.
 */
export interface InfrastructureBalance {
  type: InfrastructureType
  typeName: string
  capacityUnit: CapacityUnit

  // Demand
  normativeDemand: number        // from normative profile
  demandSource: string
  demandQuality: DataQuality

  // Supply
  existingAvailableCapacity: number  // from surrounding existing objects
  projectedCapacity: number          // from objects placed in project
  totalCapacity: number              // existing + projected

  // Result
  deficit: number                    // negative = deficit, positive = surplus
  surplus: number
  coveragePercent: number            // totalCapacity / normativeDemand * 100

  // Population coverage
  populationServed: number
  populationOutsideZone: number      // can't reach any facility

  // Quality
  dataQuality: DataQuality
  assumptions: string[]
  limitations: string[]

  /** Explanation paragraph shown to user */
  explanation: string
}

/** External (surrounding area) infrastructure object that may partially serve the project */
export interface ExternalInfrastructureObject {
  id: StableId
  type: InfrastructureType
  name: string
  position: [number, number]
  capacity: number
  capacityUnit: CapacityUnit

  // User-set sharing parameters
  isIncluded: boolean
  availableShare: number   // 0..1 — share of capacity available to this project
  reliability: DataQuality
  isCurrentlyOperating: boolean
  hasAccessRestriction: boolean
  accessRestrictionNote?: string

  dataSource: DataSource
  importedAt: string
}
