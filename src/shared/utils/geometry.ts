// TerriMind — pure geometry helpers (no side effects, fully testable)

import type { GeoPolygon, GeoPosition, BoundingBox, GeoValidationResult } from '../types/geometry'

const EPSILON = 1e-9

/** Signed area of a ring (positive = CCW) */
export function ringSignedArea(ring: GeoPosition[]): number {
  let area = 0
  const n = ring.length
  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    area += (x1 * y2 - x2 * y1)
  }
  return area / 2
}

/** Area of polygon in square metres (assumes metric coordinates) */
export function polygonArea(poly: GeoPolygon): number {
  if (!poly.coordinates || poly.coordinates.length === 0) return 0
  const outer = Math.abs(ringSignedArea(poly.coordinates[0]))
  const holes = poly.coordinates.slice(1).reduce((s, h) => s + Math.abs(ringSignedArea(h)), 0)
  return outer - holes
}

/** Bounding box of a polygon */
export function polygonBBox(poly: GeoPolygon): BoundingBox {
  const pts = poly.coordinates.flat()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** Centroid of a polygon's outer ring */
export function polygonCentroid(poly: GeoPolygon): GeoPosition {
  const ring = poly.coordinates[0]
  const n = ring.length - 1
  let cx = 0, cy = 0, area = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % n]
    const cross = x0 * y1 - x1 * y0
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
    area += cross
  }
  area /= 2
  if (Math.abs(area) < EPSILON) {
    const mid = ring[Math.floor(n / 2)]
    return [mid[0], mid[1]]
  }
  return [cx / (6 * area), cy / (6 * area)]
}

/** Distance between two points */
export function distance(a: GeoPosition, b: GeoPosition): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/** Point-in-polygon (ray casting) */
export function pointInPolygon(point: GeoPosition, poly: GeoPolygon): boolean {
  const [px, py] = point
  const ring = poly.coordinates[0]
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  // subtract holes
  for (let h = 1; h < poly.coordinates.length; h++) {
    const hole = poly.coordinates[h]
    let insideHole = false
    for (let i = 0, j = hole.length - 2; i < hole.length - 1; j = i++) {
      const [xi, yi] = hole[i]
      const [xj, yj] = hole[j]
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      if (intersect) insideHole = !insideHole
    }
    if (insideHole) inside = false
  }
  return inside
}

/** Check if polygon coordinates are closed (first == last) */
export function isRingClosed(ring: GeoPosition[]): boolean {
  if (ring.length < 4) return false
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  return Math.abs(fx - lx) < EPSILON && Math.abs(fy - ly) < EPSILON
}

/** Check for duplicate consecutive vertices */
export function hasDuplicateVertices(ring: GeoPosition[]): boolean {
  for (let i = 0; i < ring.length - 1; i++) {
    if (distance(ring[i], ring[i + 1]) < EPSILON) return true
  }
  return false
}

/** Check if two segments intersect (excluding shared endpoints) */
export function segmentsIntersect(
  a1: GeoPosition, a2: GeoPosition,
  b1: GeoPosition, b2: GeoPosition
): boolean {
  const [ax, ay] = a1, [bx, by] = a2
  const [cx, cy] = b1, [dx, dy] = b2
  const d1x = bx - ax, d1y = by - ay
  const d2x = dx - cx, d2y = dy - cy
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < EPSILON) return false
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / cross
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / cross
  return t > EPSILON && t < 1 - EPSILON && u > EPSILON && u < 1 - EPSILON
}

/** Check polygon for self-intersections in outer ring */
export function hasSelfIntersections(ring: GeoPosition[]): boolean {
  const n = ring.length - 1 // exclude closing vertex
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // shared endpoint
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true
    }
  }
  return false
}

/** Validate a GeoPolygon */
export function validatePolygon(poly: GeoPolygon): GeoValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let hasSelfIntersects = false
  let hasDuplicates = false
  let isClosed = false

  if (!poly.coordinates || poly.coordinates.length === 0) {
    errors.push('Polygon has no rings')
    return { isValid: false, errors, warnings, hasSelfIntersections: false, hasDuplicateVertices: false, isClosed: false }
  }

  const outer = poly.coordinates[0]
  if (outer.length < 4) {
    errors.push('Outer ring must have at least 4 points (3 unique + closing)')
  }

  isClosed = isRingClosed(outer)
  if (!isClosed) errors.push('Outer ring is not closed')

  hasDuplicates = hasDuplicateVertices(outer)
  if (hasDuplicates) warnings.push('Ring has duplicate consecutive vertices')

  hasSelfIntersects = outer.length > 4 ? hasSelfIntersections(outer) : false
  if (hasSelfIntersects) errors.push('Outer ring has self-intersections')

  const area = polygonArea(poly)
  if (area < 0.01) warnings.push(`Very small area: ${area.toFixed(4)} m²`)

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    hasSelfIntersections: hasSelfIntersects,
    hasDuplicateVertices: hasDuplicates,
    isClosed,
    area,
    perimeter: ringPerimeter(outer)
  }
}

export function ringPerimeter(ring: GeoPosition[]): number {
  let p = 0
  for (let i = 0; i < ring.length - 1; i++) {
    p += distance(ring[i], ring[i + 1])
  }
  return p
}

/** Create a simple rectangular polygon */
export function makeRect(x: number, y: number, w: number, h: number): GeoPolygon {
  return {
    type: 'Polygon',
    coordinates: [[
      [x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]
    ]]
  }
}

/** Generate a buffer polygon (simplified — circle approximation) */
export function circlePolygon(cx: number, cy: number, r: number, steps = 32): GeoPolygon {
  const coords: GeoPosition[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps
    coords.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
  }
  coords[steps] = coords[0] // close
  return { type: 'Polygon', coordinates: [coords] }
}

/** Minimum width (minimum bounding rectangle width) — approximate */
export function approximateMinWidth(poly: GeoPolygon): number {
  const ring = poly.coordinates[0]
  const bbox = polygonBBox(poly)
  // Use centroid and test diameters — simplified
  const xSpan = bbox.maxX - bbox.minX
  const ySpan = bbox.maxY - bbox.minY
  return Math.min(xSpan, ySpan)
}
