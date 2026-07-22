// TerriMind — Road network domain model

import type { StableId, Timestamped, DataSource } from './common'
import type { GeoLineString } from './geometry'

export type RoadCategory =
  | 'arterial'        // магистраль
  | 'collector'       // коллектор
  | 'local'           // местная улица
  | 'internal-drive'  // внутриквартальный проезд
  | 'pedestrian'      // пешеходная
  | 'bicycle'         // велодорожка
  | 'service'         // служебный
  | 'emergency'       // аварийный проезд

export interface RoadSegment extends Timestamped {
  id: StableId
  geometry: GeoLineString
  length: number       // metres
  category: RoadCategory
  width: number        // metres
  lanes: number
  isOneWay: boolean
  speedLimit: number   // km/h, 0 = pedestrian only
  allowsPedestrian: boolean
  allowsBicycle: boolean
  allowsVehicle: boolean
  allowsEmergency: boolean
  allowsService: boolean
  isBidirectional: boolean
  redLineOffset?: number // metres from geometry to red line
  source: DataSource
  blockIds: StableId[] // adjacent blocks
}
