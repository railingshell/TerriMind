// TerriMind — Accessibility & mobility domain model — Stage 5

import type { StableId, Timestamped, DataSource, DataQuality } from './common'
import type { GeoPoint, GeoLineString, GeoPolygon } from './geometry'

export type TravelMode =
  | 'pedestrian'
  | 'vehicle'
  | 'bicycle'
  | 'transit'          // preliminary — route data required
  | 'mobility-impaired'
  | 'service-vehicle'
  | 'emergency'

export type EdgeType =
  | 'street'
  | 'arterial'
  | 'internal-drive'
  | 'pedestrian-path'
  | 'sidewalk'
  | 'crossing'
  | 'building-entrance'
  | 'parcel-entrance'
  | 'facility-entrance'
  | 'parking-entrance'
  | 'transit-stop'
  | 'user-defined'

/** A single directed edge in the mobility graph */
export interface GraphEdge {
  id: StableId
  fromNodeId: StableId
  toNodeId: StableId
  geometry: GeoLineString
  type: EdgeType
  length: number           // metres
  allowedModes: TravelMode[]
  speedByMode: Partial<Record<TravelMode, number>>  // km/h
  travelTimeByMode: Partial<Record<TravelMode, number>> // seconds
  isAccessible: boolean    // meets accessibility standards
  status: 'active' | 'blocked' | 'projected'
  passageCost: number      // abstract cost (higher = less preferred)
  restrictions?: string
  dataSource: DataSource
}

export interface GraphNode {
  id: StableId
  position: [number, number]
  type: 'intersection' | 'entrance' | 'stop' | 'parking' | 'waypoint'
  refObjectId?: StableId   // building, parcel, facility, or parking
  allowedModes: TravelMode[]
}

export interface MobilityGraph {
  id: StableId
  projectId: StableId
  nodes: GraphNode[]
  edges: GraphEdge[]
  version: number
  builtAt: string   // ISO
  isStale: boolean  // needs rebuild after project change
  quality: DataQuality
}

/** Isochrone polygon from a source point for a given time/distance */
export interface Isochrone {
  id: StableId
  sourceObjectId: StableId
  mode: TravelMode
  thresholdMinutes: number   // 5 | 10 | 15 | 20
  geometry: GeoPolygon
  area: number               // m2
  populationInside: number
  buildingsInside: number
  method: 'graph' | 'buffer' // 'buffer' is a degraded mode — always labelled
  computedAt: string
}

/** Accessibility score for a building/parcel to a category of facility */
export interface AccessibilityScore {
  fromObjectId: StableId
  fromObjectType: 'building' | 'parcel'
  toFacilityType: string     // InfrastructureType
  mode: TravelMode
  nearestFacilityId?: StableId
  distanceMetres?: number
  travelTimeSeconds?: number
  isReachable: boolean
  isWithinStandard: boolean  // meets normative time/distance
  standardMaxTime: number    // seconds
}

export type TransitStopType = 'bus' | 'trolleybus' | 'tram' | 'metro' | 'custom'

export interface TransitStop extends Timestamped {
  id: StableId
  name: string
  position: [number, number]
  type: TransitStopType
  direction?: string
  routes: string[]           // user-entered route labels
  isAccessible: boolean
  existence: 'existing' | 'projected'
  serviceZoneMinutes: number  // walk time threshold
  populationInZone: number    // computed
  avgApproachTimeMinutes: number // computed
  dataSource: DataSource
}
