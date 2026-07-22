// TerriMind — Project file format v5 — .terrimind.json schema

import type { StableId, ISODateString } from './common'
import type { ProjectCRS } from './geometry'
import type { Block } from './blocks'
import type { Building } from './buildings'
import type { RoadSegment } from './roads'
import type { LandParcel } from './parcels'
import type { InfrastructureObject, ExternalInfrastructureObject } from './infrastructure'
import type { ParkingFacility, ParkingDemandRule } from './parking'
import type { GraphNode, GraphEdge, TransitStop } from './accessibility'
import type { TerritorialConstraint, SpatialConflict } from './constraints'
import type { TerrainMetadata, DesignSurface, ElevationPoint } from './terrain'
import type { UtilityNetwork, UtilityConnectionPoint } from './utilities'
import type { SuitabilitySettings } from './suitability'
import type { ProjectTEP } from './tep'

export const PROJECT_FORMAT_VERSION = '5.0.0'

export interface Scenario {
  id: StableId
  name: string
  description: string
  isBase: boolean
  createdAt: ISODateString
}

export interface NormativeProfile {
  id: StableId
  name: string
  source: string
  isDefault: boolean
  rules: NormativeRule[]
}

export interface NormativeRule {
  id: string
  type: string
  parameter: string
  value: number
  unit: string
  minValue?: number
  maxValue?: number
  condition?: string
  source: string
  isUserDefined: boolean
  overriddenAt?: ISODateString
}

export interface TerrainFileRef {
  metadataId: StableId
  relativePath: string
  checksum: string
  isAvailable: boolean
  lastCheckedAt?: ISODateString
}

/** Root project document */
export interface TerriMindProject {
  /** Schema version — always increment on structural changes */
  version: string

  id: StableId
  name: string
  description: string
  createdAt: ISODateString
  updatedAt: ISODateString
  authorName?: string

  // Coordinate system
  crs: ProjectCRS

  // Base geometry (previous stages)
  blocks: Block[]
  buildings: Building[]
  roads: RoadSegment[]
  zones: ZoneRecord[]

  // Stage 5 entities
  parcels: LandParcel[]
  infrastructureObjects: InfrastructureObject[]
  externalInfrastructure: ExternalInfrastructureObject[]
  parkingFacilities: ParkingFacility[]
  parkingRules: ParkingDemandRule[]
  transitStops: TransitStop[]
  mobilityGraphNodes: GraphNode[]
  mobilityGraphEdges: GraphEdge[]
  constraints: TerritorialConstraint[]
  spatialConflicts: SpatialConflict[]
  userConflictResolutions: ConflictResolution[]
  terrainFiles: TerrainFileRef[]
  elevationPoints: ElevationPoint[]
  designSurfaces: DesignSurface[]
  utilities: UtilityNetwork[]
  utilityConnectionPoints: UtilityConnectionPoint[]

  // Normative
  normativeProfiles: NormativeProfile[]
  activeProfileId: StableId

  // Scenarios
  scenarios: Scenario[]
  activeScenarioId?: StableId

  // Analysis settings
  suitabilitySettings?: SuitabilitySettings

  // TEP (computed — stored for offline report generation)
  tep?: ProjectTEP

  // Metadata
  calculationModelVersions: Record<string, string>
  dataQualityLog: DataQualityEntry[]
}

export interface ZoneRecord {
  id: StableId
  type: string
  name: string
  geometry: unknown // GeoPolygon
}

export interface ConflictResolution {
  conflictId: StableId
  action: 'accepted' | 'resolved' | 'ignored'
  resolvedAt: ISODateString
  comment?: string
}

export interface DataQualityEntry {
  fieldPath: string
  quality: string
  note: string
  recordedAt: ISODateString
}

// ---- Migration ----

export type MigrationResult = {
  success: boolean
  fromVersion: string
  toVersion: string
  warnings: string[]
  errors: string[]
  lostFields: string[]
}
