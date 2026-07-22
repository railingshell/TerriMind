// TerriMind — Dijkstra shortest-path on mobility graph

import type { MobilityGraph, GraphEdge, TravelMode } from '@shared/types/accessibility'

export interface PathResult {
  found: boolean
  fromNodeId: string
  toNodeId: string
  mode: TravelMode
  distanceMetres: number
  travelTimeSeconds: number
  nodeIds: string[]
  edgeIds: string[]
}

export interface DijkstraResult {
  dist: Map<string, number>    // nodeId → distance (metres or time)
  prev: Map<string, string>    // nodeId → previous nodeId
  edgePrev: Map<string, string> // nodeId → edge used to reach it
}

/**
 * Run Dijkstra from sourceNodeId on the graph.
 * costFn extracts the cost of traversing an edge in the given mode.
 * maxCost — prune nodes beyond this cost (used for isochrones).
 */
export function dijkstra(
  graph: MobilityGraph,
  sourceNodeId: string,
  mode: TravelMode,
  costFn: (edge: GraphEdge, mode: TravelMode) => number | null,
  maxCost = Infinity
): DijkstraResult {
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  const edgePrev = new Map<string, string>()
  const visited = new Set<string>()

  // Build adjacency list
  const adj = new Map<string, GraphEdge[]>()
  for (const e of graph.edges) {
    if (!e.allowedModes.includes(mode)) continue
    const list = adj.get(e.fromNodeId) ?? []
    list.push(e)
    adj.set(e.fromNodeId, list)
  }

  // Simple priority queue (min-heap via sorted array — OK for small graphs)
  // For large graphs this should be replaced with a binary heap
  const queue: Array<{ id: string; cost: number }> = []

  for (const n of graph.nodes) {
    dist.set(n.id, Infinity)
  }
  dist.set(sourceNodeId, 0)
  queue.push({ id: sourceNodeId, cost: 0 })

  while (queue.length > 0) {
    // Extract minimum
    let minIdx = 0
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].cost < queue[minIdx].cost) minIdx = i
    }
    const { id: u } = queue.splice(minIdx, 1)[0]

    if (visited.has(u)) continue
    visited.add(u)

    const currentDist = dist.get(u) ?? Infinity
    if (currentDist > maxCost) continue

    const neighbors = adj.get(u) ?? []
    for (const edge of neighbors) {
      if (edge.status !== 'active') continue
      const edgeCost = costFn(edge, mode)
      if (edgeCost === null) continue

      const v = edge.toNodeId
      const newDist = currentDist + edgeCost
      if (newDist < (dist.get(v) ?? Infinity)) {
        dist.set(v, newDist)
        prev.set(v, u)
        edgePrev.set(v, edge.id)
        queue.push({ id: v, cost: newDist })
      }
    }
  }

  return { dist, prev, edgePrev }
}

/** Cost function: metres */
export function distanceCost(edge: GraphEdge, _mode: TravelMode): number | null {
  return edge.length
}

/** Cost function: seconds */
export function timeCost(edge: GraphEdge, mode: TravelMode): number | null {
  return edge.travelTimeByMode[mode] ?? null
}

/** Reconstruct path from Dijkstra result */
export function reconstructPath(
  result: DijkstraResult,
  fromId: string,
  toId: string
): string[] {
  const path: string[] = []
  let current: string | undefined = toId
  while (current && current !== fromId) {
    path.unshift(current)
    current = result.prev.get(current)
  }
  if (current === fromId) path.unshift(fromId)
  return path
}

/** Build a full PathResult */
export function buildPathResult(
  graph: MobilityGraph,
  fromNodeId: string,
  toNodeId: string,
  mode: TravelMode
): PathResult {
  const distResult = dijkstra(graph, fromNodeId, mode, distanceCost)
  const timeResult = dijkstra(graph, fromNodeId, mode, timeCost)

  const d = distResult.dist.get(toNodeId) ?? Infinity
  const t = timeResult.dist.get(toNodeId) ?? Infinity
  const found = d < Infinity

  const nodeIds = found ? reconstructPath(distResult, fromNodeId, toNodeId) : []
  const edgeIds = nodeIds
    .slice(1)
    .map((n, i) => distResult.edgePrev.get(n))
    .filter((e): e is string => !!e)

  return {
    found,
    fromNodeId,
    toNodeId,
    mode,
    distanceMetres: found ? Math.round(d) : -1,
    travelTimeSeconds: found ? Math.round(t) : -1,
    nodeIds,
    edgeIds
  }
}
