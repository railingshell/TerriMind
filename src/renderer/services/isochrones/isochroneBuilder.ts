// TerriMind — Isochrone builder
// Isochrones are based on the real mobility graph — NOT simple circles.
// Circles are available only as a labelled fallback mode.

import type { Isochrone } from '@shared/types/accessibility'
import type { MobilityGraph, TravelMode } from '@shared/types/accessibility'
import type { GeoPolygon, GeoPosition } from '@shared/types/geometry'
import { dijkstra, timeCost } from '../routing/dijkstra'
import { generateId, nowISO } from '@shared/utils/id'
import { circlePolygon } from '@shared/utils/geometry'

/** Build isochrones from a source node for given time thresholds */
export function buildIsochrones(
  graph: MobilityGraph,
  sourceNodeId: string,
  sourceObjectId: string,
  mode: TravelMode,
  thresholdsMinutes: number[],
  population: number = 0
): Isochrone[] {
  const maxSeconds = Math.max(...thresholdsMinutes) * 60
  const { dist } = dijkstra(graph, sourceNodeId, mode, timeCost, maxSeconds)

  const isochrones: Isochrone[] = []

  for (const tMin of thresholdsMinutes.sort((a, b) => a - b)) {
    const thresholdSec = tMin * 60

    // Collect reachable nodes within this threshold
    const reachableNodes = graph.nodes.filter(n => {
      const d = dist.get(n.id) ?? Infinity
      return d <= thresholdSec
    })

    if (reachableNodes.length === 0) continue

    const geometry = buildIsochronePolygon(reachableNodes.map(n => n.position))

    isochrones.push({
      id: generateId(),
      sourceObjectId,
      mode,
      thresholdMinutes: tMin,
      geometry,
      area: 0, // computed by caller
      populationInside: population > 0 ? estimatePopulationInside(population, reachableNodes.length, graph.nodes.length) : 0,
      buildingsInside: 0, // computed by caller
      method: 'graph',
      computedAt: nowISO()
    })
  }

  return isochrones
}

/**
 * FALLBACK: circle-based isochrone — clearly labelled.
 * Only use when graph is unavailable.
 */
export function buildCircleIsochrone(
  sourcePosition: GeoPosition,
  sourceObjectId: string,
  mode: TravelMode,
  thresholdMinutes: number
): Isochrone {
  const speedKmh = modeSpeed(mode)
  const radiusM = (speedKmh * 1000 / 60) * thresholdMinutes

  return {
    id: generateId(),
    sourceObjectId,
    mode,
    thresholdMinutes,
    geometry: circlePolygon(sourcePosition[0], sourcePosition[1], radiusM),
    area: Math.PI * radiusM * radiusM,
    populationInside: 0,
    buildingsInside: 0,
    method: 'buffer',   // EXPLICITLY labelled — not a real isochrone
    computedAt: nowISO()
  }
}

/** 
 * Build convex-hull-like polygon from reachable node positions.
 * For small sets, returns a bounding box expansion.
 * A proper implementation would use a concave-hull / alpha-shape.
 */
function buildIsochronePolygon(positions: GeoPosition[]): GeoPolygon {
  if (positions.length === 0) {
    return { type: 'Polygon', coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] }
  }
  if (positions.length === 1) {
    return circlePolygon(positions[0][0], positions[0][1], 50)
  }

  // Convex hull — Graham scan
  const hull = convexHull(positions)
  if (hull.length < 3) {
    // Degenerate — return bounding box
    return bboxPolygon(positions)
  }

  // Close the ring
  hull.push(hull[0])
  return { type: 'Polygon', coordinates: [hull] }
}

/** Graham scan convex hull */
function convexHull(points: GeoPosition[]): GeoPosition[] {
  if (points.length < 3) return [...points]

  const sorted = [...points].sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0])
  const lower: GeoPosition[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: GeoPosition[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

function cross(O: GeoPosition, A: GeoPosition, B: GeoPosition): number {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
}

function bboxPolygon(positions: GeoPosition[]): GeoPolygon {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of positions) {
    if (x < minX) minX = x; if (y < minY) minY = y
    if (x > maxX) maxX = x; if (y > maxY) maxY = y
  }
  return {
    type: 'Polygon',
    coordinates: [[
      [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]
    ]]
  }
}

function modeSpeed(mode: TravelMode): number {
  const speeds: Record<TravelMode, number> = {
    pedestrian: 5, vehicle: 30, bicycle: 15,
    transit: 25, 'mobility-impaired': 3,
    'service-vehicle': 20, emergency: 40
  }
  return speeds[mode] ?? 5
}

function estimatePopulationInside(totalPop: number, reachableNodes: number, totalNodes: number): number {
  if (totalNodes === 0) return 0
  return Math.round(totalPop * (reachableNodes / totalNodes))
}
