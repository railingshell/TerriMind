import React, { useRef, useEffect, useCallback, useState } from 'react'
import { store } from '../../store/projectStore'
import { polygonCentroid, polygonArea } from '@shared/utils/geometry'
import type { LandParcel } from '@shared/types/parcels'
import type { TerritorialConstraint } from '@shared/types/constraints'
import type { UtilityNetwork } from '@shared/types/utilities'

type MapLayer =
  | 'blocks'
  | 'buildings'
  | 'roads'
  | 'parcels'
  | 'designations'
  | 'infrastructure'
  | 'parking'
  | 'constraints'
  | 'utilities'
  | 'isochrones'

const DESIGNATION_COLORS: Record<string, string> = {
  'residential': '#4ade80',
  'mixed-use': '#86efac',
  'commercial-business': '#fbbf24',
  'commercial-retail': '#f59e0b',
  'education': '#60a5fa',
  'preschool': '#93c5fd',
  'healthcare': '#f87171',
  'sport': '#34d399',
  'culture': '#a78bfa',
  'recreation': '#6ee7b7',
  'parking': '#94a3b8',
  'public-open-space': '#bef264',
  'green-public': '#86efac',
  'green-restricted': '#4ade80',
  'reserve': '#6b7280',
  'custom': '#e2e8f0'
}

const CONSTRAINT_COLORS: Record<string, string> = {
  'red-line': '#ef4444',
  'sanitary-protection': '#f97316',
  'water-protection': '#3b82f6',
  'flood-zone': '#06b6d4',
  'heritage-protection': '#a855f7',
  'no-build-zone': '#dc2626'
}

const UTILITY_COLORS: Record<string, string> = {
  'water-supply': '#3b82f6',
  'sewage': '#92400e',
  'storm-drain': '#06b6d4',
  'electricity': '#fbbf24',
  'heating': '#ef4444',
  'gas': '#f97316',
  'telecom': '#8b5cf6',
  'custom': '#94a3b8'
}

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activeLayers, setActiveLayers] = useState<Set<MapLayer>>(
    new Set(['blocks', 'buildings', 'roads', 'parcels'])
  )
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 })
  const isDragging = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const project = store.getProject()
    const { x: cx, y: cy, scale } = camera

    ctx.save()
    ctx.translate(canvas.width / 2 + cx, canvas.height / 2 + cy)
    ctx.scale(scale, -scale)

    // Draw blocks
    if (activeLayers.has('blocks')) {
      for (const block of project.blocks) {
        ctx.beginPath()
        const ring = block.geometry.coordinates[0]
        if (ring.length < 2) continue
        ctx.moveTo(ring[0][0], ring[0][1])
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1])
        ctx.closePath()
        ctx.strokeStyle = '#2d3148'
        ctx.lineWidth = 2 / scale
        ctx.stroke()
      }
    }

    // Draw parcels with designation colors
    if (activeLayers.has('parcels') || activeLayers.has('designations')) {
      for (const parcel of project.parcels) {
        const ring = parcel.geometry.coordinates[0]
        if (ring.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(ring[0][0], ring[0][1])
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1])
        ctx.closePath()
        const color = DESIGNATION_COLORS[parcel.designation] ?? '#64748b'
        ctx.fillStyle = color + '40' // 25% opacity
        ctx.fill()
        ctx.strokeStyle = parcel.id === selectedObjectId ? '#ffffff' : color
        ctx.lineWidth = (parcel.id === selectedObjectId ? 2 : 1) / scale
        ctx.stroke()
      }
    }

    // Draw buildings
    if (activeLayers.has('buildings')) {
      for (const building of project.buildings) {
        const ring = building.footprint.coordinates[0]
        if (ring.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(ring[0][0], ring[0][1])
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1])
        ctx.closePath()
        ctx.fillStyle = '#4f6ef780'
        ctx.fill()
        ctx.strokeStyle = '#6b85ff'
        ctx.lineWidth = 1 / scale
        ctx.stroke()
      }
    }

    // Draw roads
    if (activeLayers.has('roads')) {
      for (const road of project.roads) {
        const coords = road.geometry.coordinates
        if (coords.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(coords[0][0], coords[0][1])
        for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1])
        ctx.strokeStyle = '#94a3b8'
        ctx.lineWidth = Math.max(1, road.width / 2) / scale
        ctx.stroke()
      }
    }

    // Draw constraints
    if (activeLayers.has('constraints')) {
      for (const c of project.constraints) {
        if (c.geometry.type !== 'Polygon') continue
        const ring = (c.geometry as any).coordinates[0]
        ctx.beginPath()
        ctx.moveTo(ring[0][0], ring[0][1])
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1])
        ctx.closePath()
        const color = CONSTRAINT_COLORS[c.category] ?? '#ef4444'
        ctx.fillStyle = color + '30'
        ctx.fill()
        ctx.setLineDash([6 / scale, 3 / scale])
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5 / scale
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Draw utilities
    if (activeLayers.has('utilities')) {
      for (const u of project.utilities) {
        const coords = u.geometry.coordinates
        if (coords.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(coords[0][0], coords[0][1])
        for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1])
        const color = UTILITY_COLORS[u.type] ?? '#94a3b8'
        ctx.strokeStyle = color
        ctx.lineWidth = 2 / scale
        ctx.stroke()
      }
    }

    // Draw infrastructure objects
    if (activeLayers.has('infrastructure')) {
      for (const obj of project.infrastructureObjects) {
        if (obj.geometry.type !== 'Point') continue
        const [ox, oy] = (obj.geometry as any).coordinates
        ctx.beginPath()
        ctx.arc(ox, oy, 8 / scale, 0, Math.PI * 2)
        ctx.fillStyle = '#f59e0b'
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1 / scale
        ctx.stroke()
      }
    }

    // Draw parking
    if (activeLayers.has('parking')) {
      for (const p of project.parkingFacilities) {
        const ring = p.geometry.coordinates[0]
        if (ring.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(ring[0][0], ring[0][1])
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1])
        ctx.closePath()
        ctx.fillStyle = '#94a3b840'
        ctx.fill()
        ctx.strokeStyle = '#94a3b8'
        ctx.lineWidth = 1 / scale
        ctx.stroke()
      }
    }

    ctx.restore()
  }, [camera, activeLayers, selectedObjectId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resizeObserver = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      draw()
    })
    resizeObserver.observe(canvas)
    return () => resizeObserver.disconnect()
  }, [draw])

  useEffect(() => {
    const unsub = store.subscribe(draw)
    draw()
    return unsub
  }, [draw])

  const handleWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setCamera(c => ({ ...c, scale: Math.max(0.01, Math.min(100, c.scale * factor)) }))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    lastMousePos.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastMousePos.current.x
    const dy = e.clientY - lastMousePos.current.y
    lastMousePos.current = { x: e.clientX, y: e.clientY }
    setCamera(c => ({ ...c, x: c.x + dx, y: c.y + dy }))
  }

  const handleMouseUp = () => { isDragging.current = false }

  const toggleLayer = (layer: MapLayer) => {
    setActiveLayers(prev => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }

  const LAYERS: Array<{ id: MapLayer; label: string }> = [
    { id: 'blocks', label: 'Кварталы' },
    { id: 'parcels', label: 'Участки' },
    { id: 'designations', label: 'Назначения' },
    { id: 'buildings', label: 'Здания' },
    { id: 'roads', label: 'Дороги' },
    { id: 'constraints', label: 'Ограничения' },
    { id: 'infrastructure', label: 'Инфраструктура' },
    { id: 'parking', label: 'Парковки' },
    { id: 'utilities', label: 'Сети' }
  ]

  return (
    <div className="relative w-full h-full bg-tm-bg">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Layer controls */}
      <div className="absolute top-3 right-3 bg-tm-surface/90 rounded-lg border border-tm-border p-2 text-xs">
        <div className="text-tm-dim font-semibold mb-2">Слои</div>
        {LAYERS.map(l => (
          <label key={l.id} className="flex items-center gap-2 cursor-pointer py-0.5">
            <input
              type="checkbox"
              checked={activeLayers.has(l.id)}
              onChange={() => toggleLayer(l.id)}
              className="accent-tm-accent"
            />
            <span className="text-tm-text">{l.label}</span>
          </label>
        ))}
      </div>

      {/* Empty state */}
      {store.getBlocks().length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-tm-muted">
            <p className="text-lg font-semibold">Проект пуст</p>
            <p className="text-sm mt-1">Добавьте кварталы или импортируйте GeoJSON</p>
          </div>
        </div>
      )}
    </div>
  )
}
