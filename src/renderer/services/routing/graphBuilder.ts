// TerriMind — Mobility graph builder

import type { MobilityGraph, GraphNode, GraphEdge, TravelMode, EdgeType } from '@shared/types/accessibility'
import type { RoadSegment } from '@shared/types/roads'
import type { Building } from '@shared/types/buildings'
import type { LandParcel } from '@shared/types/parcels'
import type { GeoPosition } from '@shared/types/geometry'
import { generateId, nowISO } from '@shared/utils/id'
import { distance } from '@shared/utils/geometry'

const WALK_SPEED_KMH = 5
const BIKE_SPEED_KMH = 15
const CAR_SPEED_KMH = 30

/** Build mobility graph from road network + building entrances */
export function buildMobilityGraph(
  projectId: string,
  roads: RoadSegment[],
  buildings: Building[],
  parcels: LandParcel[]
): MobilityGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeMap = new Map<string, GraphNode>() // key → node

  // 1. Create nodes from road segment endpoints
  for (const road of roads) {
    const coords = road.geometry.coordinates
    const startNode = getOrCreateNode(coords[0], 'intersection', nodeMap, nodes)
    const endNode = getOrCreateNode(coords[coords.length - 1], 'intersection', nodeMap, nodes)

    const len = segmentLength(coords)
    const edge = makeEdge(startNode.id, endNode.id, road, len)
    edges.push(edge)

    if (!road.isOneWay) {
      // Add reverse direction
      const reverse = makeEdge(endNode.id, startNode.id, road, len, true)
      edges.push(reverse)
    }
  }

  // 2. Add building entrance nodes
  for (const b of buildings) {
    for (const entrance of b.entrances) {
      const node = getOrCreateNode(entrance.position, 'entrance', nodeMap, nodes, b.id)

      // Connect to nearest road node
      const nearest = findNearestNode(entrance.position, nodes.filter(n => n.type === 'intersection'))
      if (nearest) {
        const d = distance(entrance.position, nearest.position)
        const modes: TravelMode[] = entrance.type === 'vehicle'
          ? ['vehicle', 'service-vehicle', 'emergency']
          : ['pedestrian', 'mobility-impaired', 'bicycle']

        edges.push({
          id: generateId(),
          fromNodeId: node.id,
          toNodeId: nearest.id,
          geometry: { type: 'LineString', coordinates: [entrance.position, nearest.position] },
          type: 'building-entrance',
          length: d,
          allowedModes: modes,
          speedByMode: modeSpeedMap(modes),
          travelTimeByMode: travelTimeMap(d, modes),
          isAccessible: entrance.type === 'pedestrian',
          status: 'active',
          passageCost: 1,
          dataSource: { type: 'calculated', label: 'Auto' }
        })
        edges.push({
          id: generateId(),
          fromNodeId: nearest.id,
          toNodeId: node.id,
          geometry: { type: 'LineString', coordinates: [nearest.position, entrance.position] },
          type: 'building-entrance',
          length: d,
          allowedModes: modes,
          speedByMode: modeSpeedMap(modes),
          travelTimeByMode: travelTimeMap(d, modes),
          isAccessible: entrance.type === 'pedestrian',
          status: 'active',
          passageCost: 1,
          dataSource: { type: 'calculated', label: 'Auto' }
        })
      }
    }
  }

  return {
    id: generateId(),
    projectId,
    nodes,
    edges,
    version: 1,
    builtAt: nowISO(),
    isStale: false,
    quality: 'medium'
  }
}

function posKey(p: GeoPosition): string {
  return `${p[0].toFixed(3)},${p[1].toFixed(3)}`
}

function getOrCreateNode(
  pos: GeoPosition,
  type: GraphNode['type'],
  map: Map<string, GraphNode>,
  nodes: GraphNode[],
  refId?: string
): GraphNode {
  const key = posKey(pos)
  const existing = map.get(key)
  if (existing) return existing
  const node: GraphNode = {
    id: generateId(),
    position: [pos[0], pos[1]],
    type,
    refObjectId: refId,
    allowedModes: allModes()
  }
  map.set(key, node)
  nodes.push(node)
  return node
}

function makeEdge(
  fromId: string,
  toId: string,
  road: RoadSegment,
  len: number,
  reverse = false
): GraphEdge {
  const modes = roadAllowedModes(road)
  const coords = road.geometry.coordinates
  return {
    id: generateId(),
    fromNodeId: fromId,
    toNodeId: toId,
    geometry: {
      type: 'LineString',
      coordinates: reverse ? [...coords].reverse() : coords
    },
    type: roadCategoryToEdgeType(road.category),
    length: len,
    allowedModes: modes,
    speedByMode: modeSpeedMap(modes, road),
    travelTimeByMode: travelTimeMap(len, modes, road),
    isAccessible: road.allowsPedestrian,
    status: 'active',
    passageCost: road.allowsVehicle ? 1 : 2,
    dataSource: road.source
  }
}

function roadCategoryToEdgeType(cat: RoadSegment['category']): EdgeType {
  const m: Record<RoadSegment['category'], EdgeType> = {
    'arterial': 'arterial',
    'collector': 'street',
    'local': 'street',
    'internal-drive': 'internal-drive',
    'pedestrian': 'pedestrian-path',
    'bicycle': 'pedestrian-path',
    'service': 'internal-drive',
    'emergency': 'internal-drive'
  }
  return m[cat] ?? 'street'
}

function roadAllowedModes(road: RoadSegment): TravelMode[] {
  const modes: TravelMode[] = []
  if (road.allowsPedestrian) modes.push('pedestrian', 'mobility-impaired')
  if (road.allowsBicycle) modes.push('bicycle')
  if (road.allowsVehicle) modes.push('vehicle')
  if (road.allowsEmergency) modes.push('emergency')
  if (road.allowsService) modes.push('service-vehicle')
  return modes.length ? modes : ['pedestrian']
}

function allModes(): TravelMode[] {
  return ['pedestrian', 'vehicle', 'bicycle', 'mobility-impaired', 'service-vehicle', 'emergency']
}

function modeSpeedMap(
  modes: TravelMode[],
  road?: RoadSegment
): Partial<Record<TravelMode, number>> {
  const result: Partial<Record<TravelMode, number>> = {}
  const carSpeed = road?.speedLimit ?? CAR_SPEED_KMH
  for (const m of modes) {
    switch (m) {
      case 'pedestrian': result[m] = WALK_SPEED_KMH; break
      case 'mobility-impaired': result[m] = 3; break
      case 'bicycle': result[m] = BIKE_SPEED_KMH; break
      case 'vehicle': result[m] = Math.min(carSpeed, CAR_SPEED_KMH); break
      case 'service-vehicle': result[m] = 20; break
      case 'emergency': result[m] = 40; break
      case 'transit': result[m] = 25; break
    }
  }
  return result
}

function travelTimeMap(
  lenM: number,
  modes: TravelMode[],
  road?: RoadSegment
): Partial<Record<TravelMode, number>> {
  const speeds = modeSpeedMap(modes, road)
  const result: Partial<Record<TravelMode, number>> = {}
  for (const m of modes) {
    const speedKmh = speeds[m] ?? WALK_SPEED_KMH
    result[m] = Math.round((lenM / (speedKmh * 1000 / 3600)))  // seconds
  }
  return result
}

function segmentLength(coords: GeoPosition[]): number {
  let len = 0
  for (let i = 0; i < coords.length - 1; i++) {
    len += distance(coords[i], coords[i + 1])
  }
  return len
}

function findNearestNode(pos: GeoPosition, nodes: GraphNode[]): GraphNode | null {
  let best: GraphNode | null = null
  let bestDist = Infinity
  for (const n of nodes) {
    const d = distance(pos, n.position)
    if (d < bestDist) { bestDist = d; best = n }
  }
  return best
}
