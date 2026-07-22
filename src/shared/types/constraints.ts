// TerriMind — Territorial constraints domain model — Stage 5

import type { StableId, Timestamped, Severity, DataSource, ConfidenceLevel, ScenarioId } from './common'
import type { GeoPolygon, GeoLineString, GeoPoint } from './geometry'

export type ConstraintCategory =
  | 'red-line'
  | 'sanitary-protection'
  | 'utility-protection'
  | 'water-protection'
  | 'coastal-protection'
  | 'flood-zone'
  | 'waterlogging-zone'
  | 'heritage-protection'
  | 'heritage-territory'
  | 'forest'
  | 'protected-area'
  | 'airport-restriction'
  | 'noise-zone'
  | 'adverse-influence'
  | 'easement'
  | 'min-setback'
  | 'height-restriction'
  | 'no-build-zone'
  | 'conditional-use-zone'
  | 'mandatory-greenery'
  | 'custom'

export type ConstraintGeometryType = 'polygon' | 'polyline' | 'point' | 'buffer'

export type ConstraintSeverity = 'absolute' | 'strict' | 'conditional' | 'informational'

export type ConstraintAction =
  | 'info-warning'
  | 'prohibit-placement'
  | 'restrict-object-type'
  | 'limit-floors'
  | 'limit-height'
  | 'require-setback'
  | 'exclude-from-area'
  | 'reduce-suitability'
  | 'require-confirmation'
  | 'custom-formula'

export interface TerritorialConstraint extends Timestamped {
  id: StableId
  name: string
  category: ConstraintCategory
  customCategoryLabel?: string

  geometry: GeoPolygon | GeoLineString | GeoPoint
  geometryType: ConstraintGeometryType
  bufferRadius?: number    // metres, if geometryType = 'buffer'

  // Effect
  severity: ConstraintSeverity
  action: ConstraintAction
  restrictedObjectTypes?: string[]
  allowedActions?: string[]
  prohibitedActions?: string[]

  // Quantitative limits
  minSetbackMetres?: number
  maxHeightMetres?: number
  maxFloors?: number
  maxIntersectionPercent?: number  // 0..100 — allowed overlap with objects

  // Regulatory source
  normativeSource?: string
  documentTitle?: string
  documentPage?: string
  documentFragment?: string
  documentDate?: string

  confidence: ConfidenceLevel
  isConfirmed: boolean
  dataSource: DataSource
  scenarioId?: ScenarioId

  priority: number          // higher = applies first in conflict
  displayStyle?: ConstraintDisplayStyle
  userMetadata: Record<string, unknown>
}

export interface ConstraintDisplayStyle {
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWidth: number
  pattern?: 'solid' | 'hatched' | 'dotted'
}

/** One detected spatial conflict between a constraint and a project object */
export interface SpatialConflict {
  id: StableId
  constraintId: StableId
  objectId: StableId
  objectType: 'block' | 'parcel' | 'building' | 'road' | 'parking' | 'infrastructure' | 'greenery' | 'utility'
  intersectionArea?: number     // m2
  intersectionLength?: number   // m
  objectSharePercent: number    // % of object that's in conflict
  violationType: string
  severity: Severity
  ruleSource: string
  possibleActions: string[]
  status: 'open' | 'accepted' | 'resolved' | 'ignored'
  resolutionComment?: string
  resolvedAt?: string
  resolvedBy?: string
}

/** Territorial area breakdown after applying constraints */
export interface ConstrainedAreaBreakdown {
  totalProjectArea: number
  strictlyProhibitedArea: number
  conditionallyUsableArea: number
  availableArea: number
  conflictArea: number
  exclusionReasons: Array<{ constraintId: StableId; area: number; reason: string }>
}
