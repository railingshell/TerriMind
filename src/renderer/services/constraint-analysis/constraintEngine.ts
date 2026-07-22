// TerriMind — Territorial constraints analysis engine

import type {
  TerritorialConstraint,
  SpatialConflict,
  ConstrainedAreaBreakdown
} from '@shared/types/constraints'
import type { LandParcel } from '@shared/types/parcels'
import type { Building } from '@shared/types/buildings'
import type { GeoPolygon } from '@shared/types/geometry'
import { polygonArea, polygonBBox, pointInPolygon, polygonCentroid } from '@shared/utils/geometry'
import { generateId, nowISO } from '@shared/utils/id'
import type { Severity } from '@shared/types/common'

/** 
 * Analyse spatial conflicts between constraints and project objects.
 * Returns all detected conflicts (resolved or unresolved).
 */
export function analyzeConstraintConflicts(
  constraints: TerritorialConstraint[],
  parcels: LandParcel[],
  buildings: Building[]
): SpatialConflict[] {
  const conflicts: SpatialConflict[] = []

  for (const constraint of constraints) {
    if (constraint.geometry.type !== 'Polygon') continue // skip non-polygon for now
    const constraintPoly = constraint.geometry as GeoPolygon

    // Check parcels
    for (const parcel of parcels) {
      const conflict = checkPolygonConflict(constraint, constraintPoly, parcel.id, 'parcel', parcel.geometry, parcel.area)
      if (conflict) conflicts.push(conflict)
    }

    // Check buildings
    for (const building of buildings) {
      const conflict = checkPolygonConflict(constraint, constraintPoly, building.id, 'building', building.footprint, building.footprintArea)
      if (conflict) conflicts.push(conflict)
    }
  }

  return conflicts
}

function checkPolygonConflict(
  constraint: TerritorialConstraint,
  constraintPoly: GeoPolygon,
  objectId: string,
  objectType: SpatialConflict['objectType'],
  objectPoly: GeoPolygon,
  objectArea: number
): SpatialConflict | null {
  // Check if centroid or any vertex is inside constraint polygon
  const centroid = polygonCentroid(objectPoly)
  const centroidInside = pointInPolygon(centroid, constraintPoly)

  // Check if any vertex of object is inside constraint
  const verticesInside = objectPoly.coordinates[0].filter(v =>
    pointInPolygon([v[0], v[1]], constraintPoly)
  ).length

  if (!centroidInside && verticesInside === 0) return null

  // Estimate intersection area
  const objBBox = polygonBBox(objectPoly)
  const conBBox = polygonBBox(constraintPoly)
  const overlapX = Math.max(0, Math.min(objBBox.maxX, conBBox.maxX) - Math.max(objBBox.minX, conBBox.minX))
  const overlapY = Math.max(0, Math.min(objBBox.maxY, conBBox.maxY) - Math.max(objBBox.minY, conBBox.minY))
  const intersectionArea = overlapX * overlapY

  const sharePercent = objectArea > 0 ? (intersectionArea / objectArea) * 100 : 0

  const severity = mapConstraintSeverity(constraint.severity, sharePercent)
  const violationType = constraintViolationLabel(constraint)

  return {
    id: generateId(),
    constraintId: constraint.id,
    objectId,
    objectType,
    intersectionArea: Math.round(intersectionArea),
    objectSharePercent: Math.round(sharePercent * 10) / 10,
    violationType,
    severity,
    ruleSource: constraint.normativeSource ?? constraint.name,
    possibleActions: suggestActions(constraint),
    status: 'open',
    resolvedAt: undefined,
    resolvedBy: undefined
  }
}

function mapConstraintSeverity(
  constraintSeverity: TerritorialConstraint['severity'],
  sharePercent: number
): Severity {
  if (constraintSeverity === 'absolute') return 'critical'
  if (constraintSeverity === 'strict' && sharePercent > 10) return 'error'
  if (constraintSeverity === 'strict') return 'warning'
  if (constraintSeverity === 'conditional') return 'warning'
  return 'info'
}

function constraintViolationLabel(c: TerritorialConstraint): string {
  const labels: Record<TerritorialConstraint['category'], string> = {
    'red-line': 'Пересечение с красной линией',
    'sanitary-protection': 'Попадание в санитарно-защитную зону',
    'utility-protection': 'Попадание в охранную зону инженерной сети',
    'water-protection': 'Попадание в водоохранную зону',
    'coastal-protection': 'Попадание в прибрежную защитную полосу',
    'flood-zone': 'Попадание в зону затопления',
    'waterlogging-zone': 'Попадание в зону подтопления',
    'heritage-protection': 'Попадание в охранную зону ОКН',
    'heritage-territory': 'Попадание в территорию ОКН',
    'forest': 'Попадание в лесной фонд',
    'protected-area': 'Попадание в ООПТ',
    'airport-restriction': 'Нарушение приаэродромных ограничений',
    'noise-zone': 'Попадание в шумовую зону',
    'adverse-influence': 'Попадание в зону неблагоприятного воздействия',
    'easement': 'Нарушение сервитута',
    'min-setback': 'Нарушение минимального отступа',
    'height-restriction': 'Нарушение ограничения высоты',
    'no-build-zone': 'Строительство в зоне запрета',
    'conditional-use-zone': 'Требуется согласование условного использования',
    'mandatory-greenery': 'Нарушение обязательного озеленения',
    'custom': 'Нарушение пользовательского ограничения'
  }
  return labels[c.category] ?? `Нарушение ограничения: ${c.name}`
}

function suggestActions(c: TerritorialConstraint): string[] {
  if (c.severity === 'absolute') {
    return ['Переместить объект за пределы ограничения', 'Изменить назначение', 'Проконсультироваться с проектировщиком']
  }
  if (c.severity === 'strict') {
    return ['Скорректировать границы', 'Запросить согласование', 'Уменьшить высоту / плотность']
  }
  return ['Принять к сведению', 'Запросить дополнительную проверку']
}

/** Calculate area breakdown after applying constraints */
export function calculateConstrainedAreaBreakdown(
  projectArea: number,
  constraints: TerritorialConstraint[],
  conflicts: SpatialConflict[]
): ConstrainedAreaBreakdown {
  let strictlyProhibited = 0
  let conditionalArea = 0
  const exclusionReasons: ConstrainedAreaBreakdown['exclusionReasons'] = []

  for (const constraint of constraints) {
    if (constraint.geometry.type !== 'Polygon') continue
    const area = polygonArea(constraint.geometry as GeoPolygon)

    if (constraint.severity === 'absolute' || constraint.severity === 'strict') {
      strictlyProhibited += area
      exclusionReasons.push({
        constraintId: constraint.id,
        area,
        reason: constraintViolationLabel(constraint)
      })
    } else {
      conditionalArea += area
    }
  }

  const conflictArea = conflicts.reduce((s, c) => s + (c.intersectionArea ?? 0), 0)
  const availableArea = Math.max(0, projectArea - strictlyProhibited)

  return {
    totalProjectArea: projectArea,
    strictlyProhibitedArea: Math.min(strictlyProhibited, projectArea),
    conditionallyUsableArea: Math.min(conditionalArea, projectArea),
    availableArea,
    conflictArea,
    exclusionReasons
  }
}
