// TerriMind — Land parcel domain model factory & utilities

import type { LandParcel, ParcelDesignation, ParcelSource, BlockAreaBalance } from '@shared/types/parcels'
import type { Building } from '@shared/types/buildings'
import type { GeoPolygon } from '@shared/types/geometry'
import { generateId, generateProjectNumber, nowISO } from '@shared/utils/id'
import { polygonArea, validatePolygon, approximateMinWidth } from '@shared/utils/geometry'

export function createParcel(
  blockId: string,
  geometry: GeoPolygon,
  designation: ParcelDesignation,
  source: ParcelSource,
  existingParcelsInBlock: number
): LandParcel {
  const now = nowISO()
  const area = polygonArea(geometry)
  const prefix = designationPrefix(designation)
  return {
    id: generateId(),
    projectNumber: generateProjectNumber(prefix, existingParcelsInBlock + 1),
    blockId,
    geometry,
    area,
    designation,
    status: 'proposed',
    buildingIds: [],
    infrastructureObjectIds: [],
    footprintArea: 0,
    totalBuildingArea: 0,
    buildingCoverageRatio: 0,
    floorAreaRatio: 0,
    dominantFloors: 0,
    population: 0,
    parkingDemand: 0,
    normativeConstraints: [],
    violations: [],
    hasCriticalViolations: false,
    hasRoadAccess: false,
    hasVehicleAccess: false,
    isPedestrian: false,
    isExcludedFromCalculation: false,
    isPublicOpenSpace: designation === 'public-open-space' || designation === 'green-public',
    source,
    isManuallyEdited: false,
    isLocked: false,
    confidence: 'estimated',
    userMetadata: {},
    dataSource: { type: 'auto-generated', label: 'System' },
    createdAt: now,
    updatedAt: now
  }
}

function designationPrefix(d: ParcelDesignation): string {
  const map: Record<ParcelDesignation, string> = {
    'residential': 'Ж',
    'mixed-use': 'СМ',
    'commercial-business': 'Д',
    'commercial-retail': 'ТЦ',
    'education': 'ОБ',
    'preschool': 'ДС',
    'healthcare': 'МД',
    'sport': 'СП',
    'culture': 'КУ',
    'recreation': 'РК',
    'parking': 'ПК',
    'transport': 'ТР',
    'engineering': 'ИН',
    'utilities': 'КМ',
    'public-open-space': 'ТОП',
    'green-public': 'ЗО',
    'green-restricted': 'ЗОО',
    'reserve': 'РЗ',
    'custom': 'П'
  }
  return map[d] ?? 'П'
}

/** Derive computed metrics from building assignments */
export function recalculateParcelMetrics(
  parcel: LandParcel,
  buildings: Building[]
): LandParcel {
  const assigned = buildings.filter(b => parcel.buildingIds.includes(b.id))
  const footprintArea = assigned.reduce((s, b) => s + b.footprintArea, 0)
  const totalBuildingArea = assigned.reduce((s, b) => s + b.totalArea, 0)
  const population = assigned.reduce((s, b) => s + b.residents, 0)
  const maxFloors = assigned.length ? Math.max(...assigned.map(b => b.floors)) : 0

  const bcr = parcel.area > 0 ? footprintArea / parcel.area : 0
  const far = parcel.area > 0 ? totalBuildingArea / parcel.area : 0

  return {
    ...parcel,
    footprintArea,
    totalBuildingArea,
    buildingCoverageRatio: bcr,
    floorAreaRatio: far,
    dominantFloors: maxFloors,
    population,
    updatedAt: nowISO()
  }
}

/** Validate a parcel against minimum size rules */
export interface ParcelValidationConfig {
  minAreaM2: number
  maxAreaM2: number
  minWidthM: number
  requireRoadAccess: boolean
}

export interface ParcelValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  area: number
  minWidth: number
}

export function validateParcel(
  parcel: LandParcel,
  config: ParcelValidationConfig
): ParcelValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const geoResult = validatePolygon(parcel.geometry)
  errors.push(...geoResult.errors)
  warnings.push(...geoResult.warnings)

  const area = parcel.area
  const minWidth = approximateMinWidth(parcel.geometry)

  if (area < config.minAreaM2) {
    errors.push(`Area ${area.toFixed(0)} m² < minimum ${config.minAreaM2} m²`)
  }
  if (area > config.maxAreaM2) {
    warnings.push(`Area ${area.toFixed(0)} m² > maximum ${config.maxAreaM2} m²`)
  }
  if (minWidth < config.minWidthM) {
    warnings.push(`Min width ~${minWidth.toFixed(0)} m < recommended ${config.minWidthM} m`)
  }
  if (config.requireRoadAccess && !parcel.hasRoadAccess) {
    errors.push('No access to public road or open space')
  }

  return { isValid: errors.length === 0, errors, warnings, area, minWidth }
}

/** Calculate block area balance */
export function calcBlockAreaBalance(
  blockArea: number,
  parcels: LandParcel[],
  roadArea: number = 0,
  publicSpaceArea: number = 0,
  technicalArea: number = 0
): BlockAreaBalance {
  const blockId = parcels[0]?.blockId ?? ''
  const parcelArea = parcels.reduce((s, p) => s + p.area, 0)
  const excludedArea = parcels
    .filter(p => p.isExcludedFromCalculation)
    .reduce((s, p) => s + p.area, 0)
  const accountedArea = parcelArea + roadArea + publicSpaceArea + technicalArea
  const geometricError = Math.abs(blockArea - accountedArea - excludedArea)
  const threshold = Math.max(10, blockArea * 0.02) // 2% tolerance
  return {
    blockId,
    blockArea,
    parcelArea,
    roadArea,
    publicSpaceArea,
    technicalArea,
    excludedArea,
    geometricError,
    isBalanced: geometricError < threshold,
    balanceThreshold: threshold
  }
}
