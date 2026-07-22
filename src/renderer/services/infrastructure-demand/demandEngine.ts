// TerriMind — Infrastructure demand calculation engine
// All results are preliminary estimates based on normative profiles.
// Official normatives must be confirmed separately.

import type {
  InfrastructureType,
  InfrastructureObject,
  InfrastructureBalance,
  ExternalInfrastructureObject,
  CapacityUnit
} from '@shared/types/infrastructure'
import type { DataQuality } from '@shared/types/common'

export interface DemandParameters {
  population: number
  apartments: number
  workplaces: number
  children03: number    // children 0-3 years
  children37: number    // children 3-7 years
  children718: number   // school-age 7-18
  elderly: number       // 65+
}

export interface NormativeStandard {
  type: InfrastructureType
  typeName: string
  capacityUnit: CapacityUnit
  /** places per 1000 persons, or per apartment, etc. */
  ratePerUnit: number
  per: 'per-1000-persons' | 'per-apartment' | 'per-workplace' | 'per-child-0-3' | 'per-child-3-7' | 'per-child-7-18'
  source: string
  isUserDefined: boolean
  isDemoValue: boolean  // true if no official normative — must be labelled
  serviceRadiusMetres: number
  maxAccessMinutes: number
}

/** 
 * Built-in demonstration normative profile.
 * These are INDICATIVE values only — NOT official requirements.
 * Each value is marked isDemoValue = true.
 */
export const DEMO_NORMATIVE_STANDARDS: NormativeStandard[] = [
  {
    type: 'kindergarten',
    typeName: 'Детский сад',
    capacityUnit: 'place',
    ratePerUnit: 40,
    per: 'per-child-0-3',
    source: 'Демонстрационный профиль (не является официальным нормативом)',
    isUserDefined: false,
    isDemoValue: true,
    serviceRadiusMetres: 300,
    maxAccessMinutes: 5
  },
  {
    type: 'school',
    typeName: 'Общеобразовательная школа',
    capacityUnit: 'student',
    ratePerUnit: 100,
    per: 'per-child-7-18',
    source: 'Демонстрационный профиль (не является официальным нормативом)',
    isUserDefined: false,
    isDemoValue: true,
    serviceRadiusMetres: 500,
    maxAccessMinutes: 10
  },
  {
    type: 'polyclinic',
    typeName: 'Поликлиника',
    capacityUnit: 'visit-per-day',
    ratePerUnit: 18.15,
    per: 'per-1000-persons',
    source: 'Демонстрационный профиль (не является официальным нормативом)',
    isUserDefined: false,
    isDemoValue: true,
    serviceRadiusMetres: 1000,
    maxAccessMinutes: 15
  },
  {
    type: 'fitness-center',
    typeName: 'Физкультурно-оздоровительный комплекс',
    capacityUnit: 'm2',
    ratePerUnit: 70,
    per: 'per-1000-persons',
    source: 'Демонстрационный профиль (не является официальным нормативом)',
    isUserDefined: false,
    isDemoValue: true,
    serviceRadiusMetres: 800,
    maxAccessMinutes: 12
  }
]

/** 
 * Calculate normative demand for each infrastructure type.
 * Returns 'needs-data' status if population data is insufficient.
 */
export function calculateDemand(
  params: DemandParameters,
  standards: NormativeStandard[]
): Map<InfrastructureType, number> {
  const result = new Map<InfrastructureType, number>()

  for (const std of standards) {
    let demand = 0
    switch (std.per) {
      case 'per-1000-persons':
        demand = (params.population / 1000) * std.ratePerUnit
        break
      case 'per-apartment':
        demand = params.apartments * std.ratePerUnit
        break
      case 'per-workplace':
        demand = params.workplaces * std.ratePerUnit
        break
      case 'per-child-0-3':
        demand = params.children03 * std.ratePerUnit
        break
      case 'per-child-3-7':
        demand = params.children37 * std.ratePerUnit
        break
      case 'per-child-7-18':
        demand = params.children718 * std.ratePerUnit
        break
    }
    result.set(std.type, Math.ceil(demand))
  }
  return result
}

/** Calculate supply from projected infrastructure objects */
export function calculateProjectedSupply(
  objects: InfrastructureObject[],
  type: InfrastructureType
): number {
  return objects
    .filter(o => o.type === type && o.existence === 'projected' && o.activation === 'active')
    .reduce((s, o) => s + o.capacity, 0)
}

/** Calculate supply from external (surrounding) objects */
export function calculateExternalSupply(
  objects: ExternalInfrastructureObject[],
  type: InfrastructureType
): number {
  return objects
    .filter(o => o.type === type && o.isIncluded && o.isCurrentlyOperating)
    .reduce((s, o) => s + Math.floor(o.capacity * o.availableShare), 0)
}

/** Build a full balance for one infrastructure type */
export function buildInfrastructureBalance(
  type: InfrastructureType,
  typeName: string,
  capacityUnit: CapacityUnit,
  normativeDemand: number,
  demandSource: string,
  projectedObjects: InfrastructureObject[],
  externalObjects: ExternalInfrastructureObject[],
  population: number,
  isDemoValue: boolean
): InfrastructureBalance {
  const projectedCapacity = calculateProjectedSupply(projectedObjects, type)
  const existingCapacity = calculateExternalSupply(externalObjects, type)
  const totalCapacity = projectedCapacity + existingCapacity

  const deficit = Math.max(0, normativeDemand - totalCapacity)
  const surplus = Math.max(0, totalCapacity - normativeDemand)
  const coveragePercent = normativeDemand > 0 ? (totalCapacity / normativeDemand) * 100 : 100

  const populationServed = normativeDemand > 0
    ? Math.round(population * Math.min(1, totalCapacity / normativeDemand))
    : population
  const populationOutsideZone = population - populationServed

  const assumptions: string[] = []
  const limitations: string[] = []

  if (isDemoValue) {
    assumptions.push('Используется демонстрационный норматив — не является официальным требованием')
  }
  if (externalObjects.length > 0) {
    limitations.push('Вместимость существующих объектов окружения частично оценочная')
  }

  const dataQuality: DataQuality = isDemoValue ? 'low' : normativeDemand > 0 ? 'medium' : 'unknown'

  const explanation = buildExplanation(type, typeName, normativeDemand, totalCapacity, deficit, surplus, coveragePercent, isDemoValue)

  return {
    type,
    typeName,
    capacityUnit,
    normativeDemand,
    demandSource,
    demandQuality: dataQuality,
    existingAvailableCapacity: existingCapacity,
    projectedCapacity,
    totalCapacity,
    deficit,
    surplus,
    coveragePercent: Math.round(coveragePercent * 10) / 10,
    populationServed,
    populationOutsideZone: Math.max(0, populationOutsideZone),
    dataQuality,
    assumptions,
    limitations,
    explanation
  }
}

function buildExplanation(
  _type: InfrastructureType,
  typeName: string,
  demand: number,
  supply: number,
  deficit: number,
  surplus: number,
  coveragePercent: number,
  isDemoValue: boolean
): string {
  const status = deficit > 0 ? 'Дефицит' : 'Профицит'
  const note = isDemoValue ? ' ⚠ Норматив демонстрационный.' : ''
  return `${typeName}: потребность ${demand}, суммарная ёмкость ${supply}, ` +
    `${status}: ${deficit > 0 ? deficit : surplus}, обеспеченность ${coveragePercent.toFixed(1)}%.${note}`
}

/** Estimate children age structure from total population */
export function estimateAgeStructure(population: number, apartments: number): DemandParameters {
  // Indicative age distribution — user should override
  const children03 = Math.round(population * 0.04)
  const children37 = Math.round(population * 0.04)
  const children718 = Math.round(population * 0.10)
  const elderly = Math.round(population * 0.15)
  const workplaces = Math.round(apartments * 0.3) // embedded commercial estimate
  return { population, apartments, workplaces, children03, children37, children718, elderly }
}
