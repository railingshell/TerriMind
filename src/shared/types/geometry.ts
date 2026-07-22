// TerriMind — geometry types (GeoJSON-compatible)

export type GeoPosition = [number, number] // [x, y] in metres (local CRS) or [lng, lat]

export type GeoPosition3D = [number, number, number] // [x, y, z]

export interface GeoPoint {
  type: 'Point'
  coordinates: GeoPosition
}

export interface GeoLineString {
  type: 'LineString'
  coordinates: GeoPosition[]
}

export interface GeoPolygon {
  type: 'Polygon'
  coordinates: GeoPosition[][] // outer ring + holes
}

export interface GeoMultiPolygon {
  type: 'MultiPolygon'
  coordinates: GeoPosition[][][]
}

export type GeoGeometry = GeoPoint | GeoLineString | GeoPolygon | GeoMultiPolygon

export interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Local project coordinate system (metres, origin at project centre) */
export interface ProjectCRS {
  originLng: number
  originLat: number
  rotation: number // degrees CW from North
}

export interface GeoValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  hasSelfIntersections: boolean
  hasDuplicateVertices: boolean
  isClosed: boolean
  area?: number   // m2
  perimeter?: number // m
}
