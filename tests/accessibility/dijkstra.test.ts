import { describe, test, expect } from '@jest/globals'
import { dijkstra, distanceCost, timeCost, reconstructPath, buildPathResult } from '../../src/renderer/services/routing/dijkstra'
import type { MobilityGraph, GraphNode, GraphEdge } from '../../src/shared/types/accessibility'
import { generateId, nowISO } from '../../src/shared/utils/id'

function node(id: string, x: number, y: number): GraphNode {
  return { id, position: [x, y], type: 'intersection', allowedModes: ['pedestrian', 'vehicle'] }
}

function edge(id: string, from: string, to: string, len: number, modes: string[] = ['pedestrian', 'vehicle']): GraphEdge {
  const speed = 5
  return {
    id, fromNodeId: from, toNodeId: to,
    geometry: { type: 'LineString', coordinates: [[0, 0], [len, 0]] },
    type: 'street',
    length: len,
    allowedModes: modes as any,
    speedByMode: { pedestrian: 5, vehicle: 30 },
    travelTimeByMode: { pedestrian: Math.round(len / (5 * 1000 / 3600)), vehicle: Math.round(len / (30 * 1000 / 3600)) },
    isAccessible: true,
    status: 'active',
    passageCost: 1,
    dataSource: { type: 'calculated', label: 'Test' }
  }
}

function mockGraph(nodes: GraphNode[], edges: GraphEdge[]): MobilityGraph {
  return { id: generateId(), projectId: 'test', nodes, edges, version: 1, builtAt: nowISO(), isStale: false, quality: 'high' }
}

describe('dijkstra', () => {
  test('finds shortest path in simple chain A→B→C', () => {
    const A = node('A', 0, 0)
    const B = node('B', 100, 0)
    const C = node('C', 200, 0)
    const g = mockGraph([A, B, C], [
      edge('e1', 'A', 'B', 100),
      edge('e2', 'B', 'C', 100)
    ])

    const result = dijkstra(g, 'A', 'pedestrian', distanceCost)
    expect(result.dist.get('C')).toBeCloseTo(200, 0)
    expect(result.dist.get('B')).toBeCloseTo(100, 0)
  })

  test('respects one-way edges', () => {
    const A = node('A', 0, 0)
    const B = node('B', 100, 0)
    const g = mockGraph([A, B], [edge('e1', 'A', 'B', 100)])

    const fromA = dijkstra(g, 'A', 'pedestrian', distanceCost)
    const fromB = dijkstra(g, 'B', 'pedestrian', distanceCost)

    expect(fromA.dist.get('B')).toBeCloseTo(100, 0)
    expect(fromB.dist.get('A')).toBe(Infinity) // no reverse edge
  })

  test('returns Infinity for unreachable node', () => {
    const A = node('A', 0, 0)
    const B = node('B', 100, 0)
    const C = node('C', 200, 0) // disconnected
    const g = mockGraph([A, B, C], [edge('e1', 'A', 'B', 100)])

    const result = dijkstra(g, 'A', 'pedestrian', distanceCost)
    expect(result.dist.get('C')).toBe(Infinity)
  })

  test('respects mode restrictions', () => {
    const A = node('A', 0, 0)
    const B = node('B', 100, 0)
    const g = mockGraph([A, B], [edge('e1', 'A', 'B', 100, ['pedestrian'])])

    // Vehicle should not traverse pedestrian-only edge
    const result = dijkstra(g, 'A', 'vehicle', distanceCost)
    expect(result.dist.get('B')).toBe(Infinity)

    const resultPed = dijkstra(g, 'A', 'pedestrian', distanceCost)
    expect(resultPed.dist.get('B')).toBeCloseTo(100, 0)
  })

  test('chooses shorter of two paths', () => {
    const A = node('A', 0, 0)
    const B = node('B', 50, 0)
    const C = node('C', 100, 0)
    // direct A→C = 200, via B = 50 + 50 = 100
    const g = mockGraph([A, B, C], [
      edge('e1', 'A', 'C', 200),
      edge('e2', 'A', 'B', 50),
      edge('e3', 'B', 'C', 50)
    ])

    const result = dijkstra(g, 'A', 'pedestrian', distanceCost)
    expect(result.dist.get('C')).toBeCloseTo(100, 0)
    expect(result.prev.get('C')).toBe('B')
  })

  test('reconstructPath returns correct node sequence', () => {
    const A = node('A', 0, 0)
    const B = node('B', 50, 0)
    const C = node('C', 100, 0)
    const g = mockGraph([A, B, C], [
      edge('e1', 'A', 'B', 50),
      edge('e2', 'B', 'C', 50)
    ])
    const result = dijkstra(g, 'A', 'pedestrian', distanceCost)
    const path = reconstructPath(result, 'A', 'C')
    expect(path).toEqual(['A', 'B', 'C'])
  })
})

describe('buildPathResult', () => {
  test('found=true for connected nodes', () => {
    const A = node('A', 0, 0)
    const B = node('B', 100, 0)
    const g = mockGraph([A, B], [edge('e1', 'A', 'B', 100)])
    const result = buildPathResult(g, 'A', 'B', 'pedestrian')
    expect(result.found).toBe(true)
    expect(result.distanceMetres).toBe(100)
  })

  test('found=false for isolated node', () => {
    const A = node('A', 0, 0)
    const B = node('B', 100, 0)
    const g = mockGraph([A, B], [])
    const result = buildPathResult(g, 'A', 'B', 'pedestrian')
    expect(result.found).toBe(false)
    expect(result.distanceMetres).toBe(-1)
  })
})
