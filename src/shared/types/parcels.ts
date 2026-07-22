// TerriMind — Land parcel (земельный участок) domain model — Stage 5

import type { StableId, Timestamped, Violation, DataSource, ConfidenceLevel, ScenarioId } from './common'
import type { GeoPolygon } from './geometry'

export type ParcelId = StableId

export type ParcelDesignation =
  | 'residential'
  | 'mixed-use'
  | 'commercial-business'
  | 'commercial-retail'
  | 'education'
  | 'preschool'
  | 'healthcare'
  | 'sport'
  | 'culture'
  | 'recreation'
  | 'parking'
  | 'transport'
  | 'engineering'
  | 'utilities'
  | 'public-open-space'
  | 'green-public'
  | 'green-restricted'
  | 'reserve'
  | 'custom'

export type ParcelStatus =
  | 'draft'
  | 'proposed'
  | 'approved'
  | 'conflict'
  | 'excluded'

export type ParcelSource =
  | 'auto-generated'
  | 'manual'
  | 'imported'
  | 'split-from'
  | 'merged-from'

/** 
 * PRELIMINARY project cadastral parcel — NOT official cadaster documentation.
 * Do NOT assign real cadastral numbers.
 */
export interface LandParcel extends Timestamped {
  id: ParcelId
  /** Internal project number — never a real cadastral number */
  projectNumber: string
  /** User-defined label */
  userLabel?: string
  /** Optional external identifier from imported data */
  externalId?: string

  blockId: StableId
  geometry: GeoPolygon
  area: number              // m2 — computed from geometry

  designation: ParcelDesignation
  customDesignationLabel?: string
  zoningType?: string
  landUseType?: string

  status: ParcelStatus

  /** Buildings assigned to this parcel */
  buildingIds: StableId[]
  /** Infrastructure objects on this parcel */
  infrastructureObjectIds: StableId[]

  // --- Derived metrics (calculated, not stored as source-of-truth) ---
  footprintArea: number     // m2 — sum of building footprints
  totalBuildingArea: number // m2 — sum of building gross areas
  buildingCoverageRatio: number   // BCR = footprintArea / area
  floorAreaRatio: number          // FAR = totalBuildingArea / area
  dominantFloors: number
  population: number
  parkingDemand: number

  // --- Normative ---
  normativeConstraints: ParcelNormativeConstraint[]
  violations: Violation[]
  hasCriticalViolations: boolean

  // --- Flags ---
  hasRoadAccess: boolean
  hasVehicleAccess: boolean
  isPedestrian: boolean
  isExcludedFromCalculation: boolean
  isPublicOpenSpace: boolean

  // --- Provenance ---
  source: ParcelSource
  sourceDetails?: string
  isManuallyEdited: boolean
  isLocked: boolean
  confidence: ConfidenceLevel

  displayColor?: string
  userMetadata: Record<string, unknown>
  scenarioId?: ScenarioId
  dataSource: DataSource
}

export interface ParcelNormativeConstraint {
  ruleId: string
  label: string
  parameter: string
  minValue?: number
  maxValue?: number
  unit: string
  source: string
  isViolated: boolean
}

/** Result of automatic parcel generation for one block */
export interface ParcelGenerationResult {
  blockId: StableId
  parcels: LandParcel[]
  unassignedArea: number    // m2 — must be explained
  unassignedAreaReason: string
  totalArea: number
  assignedArea: number
  roadArea: number
  publicSpaceArea: number
  geometricError: number    // m2 — floating point accumulation
  warnings: string[]
  errors: string[]
  quality: 'good' | 'acceptable' | 'poor'
}

/** Area balance for a block — sum of all parcels must explain block area */
export interface BlockAreaBalance {
  blockId: StableId
  blockArea: number
  parcelArea: number
  roadArea: number
  publicSpaceArea: number
  technicalArea: number
  excludedArea: number
  geometricError: number
  isBalanced: boolean        // |error| < threshold (e.g. 1 m2)
  balanceThreshold: number
}
