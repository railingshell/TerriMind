// TerriMind — Project format migration
// Handles opening projects from older format versions without data loss.

import type { TerriMindProject, MigrationResult } from '../types/project'
import { PROJECT_FORMAT_VERSION } from '../types/project'
import { generateId, nowISO } from './id'

type RawProject = Record<string, unknown>

/** Migrate a raw parsed project to the current format version */
export function migrateProject(raw: RawProject): { project: TerriMindProject; result: MigrationResult } {
  const fromVersion = (raw.version as string) ?? '0.0.0'
  const warnings: string[] = []
  const errors: string[] = []
  const lostFields: string[] = []

  let p = raw

  // Apply migrations in order
  if (compareVersions(fromVersion, '3.0.0') < 0) {
    p = migrate_to_3(p, warnings, lostFields)
  }
  if (compareVersions(fromVersion, '4.0.0') < 0) {
    p = migrate_to_4(p, warnings, lostFields)
  }
  if (compareVersions(fromVersion, '5.0.0') < 0) {
    p = migrate_to_5(p, warnings, lostFields)
  }

  // Ensure required arrays exist
  const project = ensureArrays(p) as unknown as TerriMindProject
  project.version = PROJECT_FORMAT_VERSION

  return {
    project,
    result: {
      success: errors.length === 0,
      fromVersion,
      toVersion: PROJECT_FORMAT_VERSION,
      warnings,
      errors,
      lostFields
    }
  }
}

function migrate_to_3(p: RawProject, w: string[], _l: string[]): RawProject {
  w.push('Применена миграция v2→v3: добавлены нормативные профили')
  return {
    ...p,
    normativeProfiles: p.normativeProfiles ?? [],
    activeProfileId: p.activeProfileId ?? '',
    scenarios: p.scenarios ?? [{ id: generateId(), name: 'Базовый', isBase: true, createdAt: nowISO(), description: '' }]
  }
}

function migrate_to_4(p: RawProject, w: string[], _l: string[]): RawProject {
  w.push('Применена миграция v3→v4: добавлена 3D-конфигурация и квартирография')
  return { ...p }
}

function migrate_to_5(p: RawProject, w: string[], _l: string[]): RawProject {
  w.push('Применена миграция v4→v5: добавлены земельные участки, инфраструктура, парковки, ограничения, рельеф, сети')

  const now = nowISO()
  return {
    ...p,
    parcels: p.parcels ?? [],
    infrastructureObjects: p.infrastructureObjects ?? [],
    externalInfrastructure: p.externalInfrastructure ?? [],
    parkingFacilities: p.parkingFacilities ?? [],
    parkingRules: p.parkingRules ?? [],
    transitStops: p.transitStops ?? [],
    mobilityGraphNodes: p.mobilityGraphNodes ?? [],
    mobilityGraphEdges: p.mobilityGraphEdges ?? [],
    constraints: p.constraints ?? [],
    spatialConflicts: p.spatialConflicts ?? [],
    userConflictResolutions: p.userConflictResolutions ?? [],
    terrainFiles: p.terrainFiles ?? [],
    elevationPoints: p.elevationPoints ?? [],
    designSurfaces: p.designSurfaces ?? [],
    utilities: p.utilities ?? [],
    utilityConnectionPoints: p.utilityConnectionPoints ?? [],
    calculationModelVersions: {
      ...((p.calculationModelVersions as Record<string, string>) ?? {}),
      parcels: '5.0',
      infrastructure: '5.0',
      accessibility: '5.0',
      parking: '5.0',
      terrain: '5.0'
    },
    dataQualityLog: p.dataQualityLog ?? [],
    updatedAt: now
  }
}

function ensureArrays(p: RawProject): RawProject {
  const arrayFields = [
    'blocks', 'buildings', 'roads', 'zones', 'parcels',
    'infrastructureObjects', 'externalInfrastructure', 'parkingFacilities',
    'parkingRules', 'transitStops', 'mobilityGraphNodes', 'mobilityGraphEdges',
    'constraints', 'spatialConflicts', 'userConflictResolutions',
    'terrainFiles', 'elevationPoints', 'designSurfaces',
    'utilities', 'utilityConnectionPoints', 'normativeProfiles',
    'scenarios', 'dataQualityLog'
  ]
  const result = { ...p }
  for (const f of arrayFields) {
    if (!Array.isArray(result[f])) result[f] = []
  }
  if (!result.crs) result.crs = { originLng: 0, originLat: 0, rotation: 0 }
  return result
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Validate that the project JSON is safe to load */
export function validateProjectJson(raw: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    errors.push('Файл проекта не является объектом JSON')
    return { valid: false, errors }
  }

  const obj = raw as Record<string, unknown>

  if (typeof obj.id !== 'string') errors.push('Отсутствует поле id')
  if (typeof obj.name !== 'string') errors.push('Отсутствует поле name')
  if (typeof obj.version !== 'string') errors.push('Отсутствует поле version')

  // Refuse to load if version is from future
  if (typeof obj.version === 'string') {
    const { compareVersions: cv } = { compareVersions }
    if (cv(obj.version, PROJECT_FORMAT_VERSION) > 0) {
      errors.push(`Версия файла ${obj.version} новее, чем поддерживаемая ${PROJECT_FORMAT_VERSION}. Обновите TerriMind.`)
    }
  }

  return { valid: errors.length === 0, errors }
}
