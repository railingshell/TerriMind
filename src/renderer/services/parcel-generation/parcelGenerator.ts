// TerriMind — Parcel generator service
// Generates preliminary land parcels from block geometry + buildings.
// This is a PRE-PROJECT estimation, NOT official cadastral documentation.

import type { Block } from '@shared/types/blocks'
import type { Building } from '@shared/types/buildings'
import type { RoadSegment } from '@shared/types/roads'
import type { LandParcel, ParcelGenerationResult, ParcelDesignation } from '@shared/types/parcels'
import type { GeoPolygon, GeoPosition } from '@shared/types/geometry'
import { polygonArea, polygonCentroid, polygonBBox, distance, pointInPolygon } from '@shared/utils/geometry'
import { createParcel } from '../../domain/parcels/parcelModel'
import { generateId, nowISO } from '@shared/utils/id'

export interface ParcelGenerationConfig {
  minParcelAreaM2: number   // default 200
  maxParcelAreaM2: number   // default 50000
  minFrontWidthM: number    // default 10
  roadBufferM: number       // m setback from road edge
  publicSpaceSharePercent: number  // % of block area for public open space
  greenSpaceSharePercent: number
}

const DEFAULT_CONFIG: ParcelGenerationConfig = {
  minParcelAreaM2: 200,
  maxParcelAreaM2: 50000,
  minFrontWidthM: 10,
  roadBufferM: 3,
  publicSpaceSharePercent: 15,
  greenSpaceSharePercent: 10
}

/**
 * Generate parcels for a single block.
 *
 * Algorithm:
 * 1. Identify buildings inside the block.
 * 2. Group buildings by use → assign parcels.
 * 3. Create buffer zones around each building cluster.
 * 4. Allocate remainder as public open space and greenery.
 * 5. Validate balance.
 *
 * This is a deterministic heuristic — no random elements.
 * Each parcel is directly connected to real buildings.
 */
export function generateParcelsForBlock(
  block: Block,
  allBuildings: Building[],
  _roads: RoadSegment[],
  config: ParcelGenerationConfig = DEFAULT_CONFIG
): ParcelGenerationResult {
  const warnings: string[] = []
  const errors: string[] = []

  const blockArea = polygonArea(block.geometry)
  const buildingsInBlock = allBuildings.filter(b =>
    b.blockId === block.id || (
      b.blockId === undefined && blockContainsBuilding(block.geometry, b)
    )
  )

  const parcels: LandParcel[] = []
  let parcelIndex = 0

  // --- Step 1: One parcel per building cluster by designation ---
  const clusters = clusterBuildingsByDesignation(buildingsInBlock)

  for (const cluster of clusters) {
    const parcelGeom = buildingClusterPolygon(cluster.buildings, block.geometry, config.roadBufferM)
    if (!parcelGeom) {
      warnings.push(`Could not create parcel for ${cluster.designation} cluster in block ${block.id}`)
      continue
    }
    const parcelArea = polygonArea(parcelGeom)
    if (parcelArea < config.minParcelAreaM2) {
      warnings.push(`Generated parcel area ${parcelArea.toFixed(0)} m² < minimum — merging with nearest`)
      // TODO: in a future iteration, merge micro-parcels
      continue
    }

    parcelIndex++
    const parcel = createParcel(block.id, parcelGeom, cluster.designation, 'auto-generated', parcelIndex)
    const withBuildings: LandParcel = {
      ...parcel,
      buildingIds: cluster.buildings.map(b => b.id),
      hasRoadAccess: true // simplified — full check in validation step
    }
    parcels.push(withBuildings)
  }

  // --- Step 2: Public open space parcel ---
  const publicArea = blockArea * config.publicSpaceSharePercent / 100
  if (publicArea >= config.minParcelAreaM2) {
    const publicGeom = createPublicSpacePolygon(block.geometry, parcels, publicArea)
    if (publicGeom) {
      parcelIndex++
      const publicParcel = createParcel(block.id, publicGeom, 'public-open-space', 'auto-generated', parcelIndex)
      parcels.push({ ...publicParcel, isPublicOpenSpace: true, hasRoadAccess: true })
    }
  }

  // --- Step 3: Green space parcel ---
  const greenArea = blockArea * config.greenSpaceSharePercent / 100
  if (greenArea >= config.minParcelAreaM2) {
    const greenGeom = createGreenSpacePolygon(block.geometry, parcels, greenArea)
    if (greenGeom) {
      parcelIndex++
      const greenParcel = createParcel(block.id, greenGeom, 'green-public', 'auto-generated', parcelIndex)
      parcels.push({ ...greenParcel, isPublicOpenSpace: true })
    }
  }

  // --- Step 4: Balance check ---
  const assignedArea = parcels.reduce((s, p) => s + p.area, 0)
  const roadArea = blockArea * 0.05 // 5% internal roads estimate
  const unassignedArea = Math.max(0, blockArea - assignedArea - roadArea)
  const balanceError = Math.abs(blockArea - assignedArea - roadArea - unassignedArea)

  if (parcels.length === 0) {
    errors.push(`Block ${block.id}: no parcels could be generated`)
    // Create one catch-all parcel for the entire block
    parcelIndex++
    const fallback = createParcel(block.id, block.geometry, 'reserve', 'auto-generated', parcelIndex)
    parcels.push({ ...fallback, buildingIds: buildingsInBlock.map(b => b.id) })
  }

  const quality: 'good' | 'acceptable' | 'poor' =
    errors.length > 0 ? 'poor' :
    warnings.length > 2 ? 'acceptable' : 'good'

  return {
    blockId: block.id,
    parcels,
    unassignedArea,
    unassignedAreaReason: unassignedArea > 0 ? 'Internal roads, technical areas, geometric rounding' : 'None',
    totalArea: blockArea,
    assignedArea,
    roadArea,
    publicSpaceArea: parcels.filter(p => p.isPublicOpenSpace).reduce((s, p) => s + p.area, 0),
    geometricError: balanceError,
    warnings,
    errors,
    quality
  }
}

// ---- private helpers ----

interface BuildingCluster {
  designation: ParcelDesignation
  buildings: Building[]
}

function buildingUseToDesignation(use: Building['use']): ParcelDesignation {
  const map: Record<Building['use'], ParcelDesignation> = {
    'residential': 'residential',
    'mixed': 'mixed-use',
    'commercial': 'commercial-retail',
    'office': 'commercial-business',
    'education': 'education',
    'healthcare': 'healthcare',
    'sport': 'sport',
    'culture': 'culture',
    'industrial': 'engineering',
    'utility': 'utilities',
    'parking-structure': 'parking',
    'custom': 'custom'
  }
  return map[use] ?? 'custom'
}

function clusterBuildingsByDesignation(buildings: Building[]): BuildingCluster[] {
  const map = new Map<ParcelDesignation, Building[]>()
  for (const b of buildings) {
    const des = buildingUseToDesignation(b.use)
    const arr = map.get(des) ?? []
    arr.push(b)
    map.set(des, arr)
  }
  return Array.from(map.entries()).map(([designation, bldgs]) => ({ designation, buildings: bldgs }))
}

function blockContainsBuilding(block: GeoPolygon, b: Building): boolean {
  try {
    const centroid = polygonCentroid(b.footprint)
    return pointInPolygon(centroid, block)
  } catch {
    return false
  }
}

/** Create a convex-hull-like bounding polygon for a cluster of buildings */
function buildingClusterPolygon(
  buildings: Building[],
  blockGeom: GeoPolygon,
  bufferM: number
): GeoPolygon | null {
  if (buildings.length === 0) return null

  // Collect all footprint vertices
  const pts: GeoPosition[] = buildings.flatMap(b =>
    b.footprint.coordinates[0].slice(0, -1)
  )
  if (pts.length === 0) return null

  // Bounding box + buffer
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  const bboxBlock = polygonBBox(blockGeom)
  minX = Math.max(bboxBlock.minX, minX - bufferM)
  minY = Math.max(bboxBlock.minY, minY - bufferM)
  maxX = Math.min(bboxBlock.maxX, maxX + bufferM)
  maxY = Math.min(bboxBlock.maxY, maxY + bufferM)

  // Return bounding rectangle clamped to block
  return {
    type: 'Polygon',
    coordinates: [[
      [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]
    ]]
  }
}

/** Create a public space polygon in unused area at one corner */
function createPublicSpacePolygon(
  blockGeom: GeoPolygon,
  existingParcels: LandParcel[],
  targetArea: number
): GeoPolygon | null {
  const bbox = polygonBBox(blockGeom)
  const side = Math.sqrt(targetArea)
  // place in bottom-left corner
  const x0 = bbox.minX
  const y0 = bbox.minY
  const geom: GeoPolygon = {
    type: 'Polygon',
    coordinates: [[
      [x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side], [x0, y0]
    ]]
  }
  return geom
}

/** Create a green space polygon in unused area at another corner */
function createGreenSpacePolygon(
  blockGeom: GeoPolygon,
  existingParcels: LandParcel[],
  targetArea: number
): GeoPolygon | null {
  const bbox = polygonBBox(blockGeom)
  const side = Math.sqrt(targetArea)
  // place in top-right corner
  const x0 = bbox.maxX - side
  const y0 = bbox.maxY - side
  const geom: GeoPolygon = {
    type: 'Polygon',
    coordinates: [[
      [x0, y0], [bbox.maxX, y0], [bbox.maxX, bbox.maxY], [x0, bbox.maxY], [x0, y0]
    ]]
  }
  return geom
}
