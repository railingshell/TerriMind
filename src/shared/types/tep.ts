// TerriMind — Technical-economic indicators (ТЭП) — Stage 5 extension

import type { StableId, DataQuality, CalculationMeta } from './common'
import type { InfrastructureType } from './infrastructure'
import type { ParkingType } from './parking'
import type { UtilityType } from './utilities'

/** Top-level ТЭП document for a project scenario */
export interface ProjectTEP {
  id: StableId
  projectId: StableId
  scenarioId?: StableId
  version: string
  calculatedAt: string
  meta: CalculationMeta

  // --- Previous stages ---
  general: GeneralTEP
  zoning: ZoningTEP
  buildings: BuildingsTEP
  economy: EconomyTEP

  // --- Stage 5 additions ---
  parcels: ParcelsTEP
  infrastructure: InfrastructureTEP
  parking: ParkingTEP
  accessibility: AccessibilityTEP
  constraints: ConstraintsTEP
  terrain: TerrainTEP
  engineering: EngineeringTEP
}

export interface GeneralTEP {
  totalArea: number        // ha
  population: number
  apartments: number
  workplaces: number
  density: number          // people/ha
}

export interface ZoningTEP {
  residentialArea: number
  commercialArea: number
  publicArea: number
  greenArea: number
  roadArea: number
  otherArea: number
}

export interface BuildingsTEP {
  totalBuildingCount: number
  totalFootprintArea: number
  totalGrossArea: number
  buildingCoverageRatio: number
  floorAreaRatio: number
  avgFloors: number
  residentialArea: number
  commercialArea: number
}

export interface EconomyTEP {
  constructionCost: number
  infrastructureCost: number
  revenueEstimate: number
  npv: number
}

// ---- Stage 5 ----

export interface ParcelsTEP {
  totalParcels: number
  parcelAreaByDesignation: Partial<Record<string, number>>  // m2
  avgParcelArea: number
  minParcelArea: number
  maxParcelArea: number
  publicOpenSpaceArea: number
  unassignedArea: number
  conflictParcelArea: number
  quality: DataQuality
}

export interface InfrastructureTEP {
  objectCountByType: Partial<Record<InfrastructureType, number>>
  totalCapacityByType: Partial<Record<InfrastructureType, number>>
  demandByType: Partial<Record<InfrastructureType, number>>
  deficitByType: Partial<Record<InfrastructureType, number>>
  coveragePercentByType: Partial<Record<InfrastructureType, number>>
  populationOutsideZone: number
  socialParcelArea: number
  socialBuildingArea: number
  overallCoveragePercent: number
  quality: DataQuality
}

export interface ParkingTEP {
  totalDemand: number
  totalCreated: number
  deficit: number
  surplus: number
  spotsByType: Partial<Record<ParkingType, number>>
  totalParkingArea: number
  avgDistanceToParking: number
  buildingsWithDeficit: number
  buildingsTotal: number
  quality: DataQuality
}

export interface AccessibilityTEP {
  avgTimeToNearestFacility: Record<string, number>  // facilityType -> minutes
  medianTimeToNearestFacility: Record<string, number>
  maxTimeToNearestFacility: Record<string, number>
  populationIn5min: number
  populationIn10min: number
  populationIn15min: number
  populationIn20min: number
  isolatedObjectCount: number
  pedestrianNetworkLength: number  // m
  vehicleNetworkLength: number     // m
  connectivityIndex?: number       // optional
  quality: DataQuality
}

export interface ConstraintsTEP {
  strictProhibitionArea: number
  conditionalArea: number
  conflictArea: number
  totalViolations: number
  criticalViolations: number
  availableAreaAfterConstraints: number
  quality: DataQuality
}

export interface TerrainTEP {
  minElevation: number
  maxElevation: number
  avgSlope: number
  steepSlopeArea: number    // m2 where slope > threshold
  noTerrainDataArea: number
  estimatedCutVolume: number
  estimatedFillVolume: number
  quality: DataQuality
}

export interface EngineeringTEP {
  networkLengthByType: Partial<Record<UtilityType, number>>  // m
  connectionPointCount: number
  objectsWithoutConnection: number
  estimatedUtilityCost: number
  networkConflictCount: number
  engineeringReadiness: 'ready' | 'partial' | 'not-ready' | 'unknown'
  quality: DataQuality
}
