// TerriMind — Parking demand calculation engine

import type { ParkingFacility, ParkingDemandRule, ParkingBalance } from '@shared/types/parking'
import type { LandParcel } from '@shared/types/parcels'
import type { Building } from '@shared/types/buildings'
import type { DataQuality } from '@shared/types/common'
import { distance, polygonCentroid } from '@shared/utils/geometry'

/** Default parking rules (demonstration values — marked explicitly) */
export const DEFAULT_PARKING_RULES: ParkingDemandRule[] = [
  {
    id: 'residential-apt',
    label: 'Жилая застройка — на квартиру',
    landUse: 'residential',
    unit: 'per-apartment',
    rate: 1.0,
    guestRate: 0.15,
    maxDistance: 300,
    sharedUseFactor: 1.0,
    source: 'Демонстрационный профиль',
    isUserDefined: false
  },
  {
    id: 'commercial-100m2',
    label: 'Коммерция — на 100 м²',
    landUse: 'commercial',
    unit: 'per-100m2',
    rate: 3.0,
    maxDistance: 200,
    sharedUseFactor: 0.8,
    source: 'Демонстрационный профиль',
    isUserDefined: false
  },
  {
    id: 'office-100m2',
    label: 'Офис — на 100 м²',
    landUse: 'office',
    unit: 'per-100m2',
    rate: 2.5,
    maxDistance: 250,
    sharedUseFactor: 0.7,
    source: 'Демонстрационный профиль',
    isUserDefined: false
  },
  {
    id: 'education-seat',
    label: 'Образование — на место',
    landUse: 'education',
    unit: 'per-seat',
    rate: 0.05,
    maxDistance: 150,
    sharedUseFactor: 1.0,
    source: 'Демонстрационный профиль',
    isUserDefined: false
  }
]

export interface ParkingDemandItem {
  buildingId: string
  landUse: string
  ruleId: string
  baseCount: number   // apartments / 100m2 / seats
  demand: number
  guestDemand: number
  totalDemand: number
}

/** Calculate parking demand for a set of buildings */
export function calculateBuildingParkingDemand(
  buildings: Building[],
  rules: ParkingDemandRule[]
): ParkingDemandItem[] {
  const items: ParkingDemandItem[] = []

  for (const building of buildings) {
    const use = building.use
    const rule = findMatchingRule(use, rules)

    if (!rule) {
      // No rule → unknown demand
      items.push({
        buildingId: building.id,
        landUse: use,
        ruleId: 'none',
        baseCount: 0,
        demand: 0,
        guestDemand: 0,
        totalDemand: 0
      })
      continue
    }

    let baseCount = 0
    let demand = 0

    switch (rule.unit) {
      case 'per-apartment':
        baseCount = building.apartments
        demand = baseCount * rule.rate
        break
      case 'per-100m2':
        baseCount = building.commercialArea / 100
        demand = baseCount * rule.rate
        break
      case 'per-seat':
        baseCount = building.residents // proxy for seats
        demand = baseCount * rule.rate
        break
      case 'per-person':
        baseCount = building.residents
        demand = baseCount * rule.rate
        break
      case 'per-employee':
        baseCount = building.workplaces
        demand = baseCount * rule.rate
        break
    }

    demand = demand * rule.sharedUseFactor
    const guestDemand = baseCount * (rule.guestRate ?? 0)

    items.push({
      buildingId: building.id,
      landUse: use,
      ruleId: rule.id,
      baseCount,
      demand: Math.ceil(demand),
      guestDemand: Math.ceil(guestDemand),
      totalDemand: Math.ceil(demand + guestDemand)
    })
  }

  return items
}

function findMatchingRule(use: Building['use'], rules: ParkingDemandRule[]): ParkingDemandRule | undefined {
  const map: Record<Building['use'], string> = {
    'residential': 'residential',
    'mixed': 'residential',
    'commercial': 'commercial',
    'office': 'office',
    'education': 'education',
    'healthcare': 'commercial',
    'sport': 'commercial',
    'culture': 'commercial',
    'industrial': 'office',
    'utility': 'office',
    'parking-structure': 'residential',
    'custom': 'residential'
  }
  const landUse = map[use] ?? 'residential'
  return rules.find(r => r.landUse === landUse)
}

/** 
 * Build parking balance for a parcel scope.
 * CRITICAL: one parking spot is never counted twice unless
 * the rule explicitly defines sharedUseFactor.
 */
export function buildParkingBalance(
  parcel: LandParcel,
  buildings: Building[],
  parkingFacilities: ParkingFacility[],
  rules: ParkingDemandRule[]
): ParkingBalance {
  const parcelBuildings = buildings.filter(b => parcel.buildingIds.includes(b.id))
  const demandItems = calculateBuildingParkingDemand(parcelBuildings, rules)
  const totalDemand = demandItems.reduce((s, d) => s + d.totalDemand, 0)

  // Find accessible facilities
  const parcelCentroid = polygonCentroid(parcel.geometry)
  const maxDistance = Math.max(...rules.map(r => r.maxDistance), 300)

  const accessibleFacilities = parkingFacilities.filter(f => {
    if (!f.servedParcelIds.includes(parcel.id) && f.servedParcelIds.length > 0) return false
    const facCentroid = polygonCentroid(f.geometry)
    return distance(parcelCentroid, facCentroid) <= maxDistance
  })

  // Sum capacity — each facility counted once per parcel
  const createdCapacity = accessibleFacilities
    .filter(f => f.servedParcelIds.includes(parcel.id))
    .reduce((s, f) => s + f.capacity, 0)

  const accessibleCapacity = accessibleFacilities.reduce((s, f) => s + f.capacity, 0)

  const deficit = Math.max(0, totalDemand - accessibleCapacity)
  const surplus = Math.max(0, accessibleCapacity - totalDemand)

  const distances = accessibleFacilities.map(f => {
    const facCentroid = polygonCentroid(f.geometry)
    return distance(parcelCentroid, facCentroid)
  })
  const avgDist = distances.length ? distances.reduce((s, d) => s + d, 0) / distances.length : 0

  const byLandUse = groupDemandByLandUse(demandItems)
  const byType = groupCapacityByType(accessibleFacilities)

  const quality: DataQuality = rules.some(r => r.isUserDefined) ? 'medium' : 'low'

  return {
    scopeId: parcel.id,
    scopeType: 'parcel',
    demand: totalDemand,
    createdCapacity,
    accessibleCapacity,
    deficit,
    surplus,
    demandByLandUse: byLandUse,
    capacityByType: byType,
    avgDistanceToParking: Math.round(avgDist),
    buildingsWithDeficit: parcelBuildings.filter((_, i) => (demandItems[i]?.totalDemand ?? 0) > 0 && accessibleCapacity === 0).length,
    buildingsTotal: parcelBuildings.length,
    rulesUsed: rules.filter(r => demandItems.some(d => d.ruleId === r.id)),
    sharedParkingGroups: [],
    dataQuality: quality,
    assumptions: ['Демонстрационные нормативы. Требуется подтверждение официальными нормами.']
  }
}

function groupDemandByLandUse(
  items: ParkingDemandItem[]
): Array<{ landUse: string; demand: number; rule: string }> {
  const map = new Map<string, { demand: number; rule: string }>()
  for (const item of items) {
    const existing = map.get(item.landUse)
    if (existing) {
      existing.demand += item.totalDemand
    } else {
      map.set(item.landUse, { demand: item.totalDemand, rule: item.ruleId })
    }
  }
  return Array.from(map.entries()).map(([landUse, v]) => ({ landUse, ...v }))
}

function groupCapacityByType(
  facilities: ParkingFacility[]
): Partial<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const f of facilities) {
    result[f.type] = (result[f.type] ?? 0) + f.capacity
  }
  return result
}
