import React, { useState, useRef } from 'react'
import { Mountain, Upload, RefreshCw, AlertCircle, BarChart3 } from 'lucide-react'
import { store } from '../../store/projectStore'
import {
  createElevationGrid,
  analyzeAllSlopes,
  analyzeDrainage
} from '../../services/terrain-analysis/terrainEngine'
import type { ElevationGrid, SlopeInfo } from '@shared/types/terrain'
import { taskQueue, TASK_IDS } from '../../workers/taskQueue'

export function TerrainPanel() {
  const [grid, setGrid] = useState<ElevationGrid | null>(null)
  const [slopes, setSlopes] = useState<ReturnType<typeof analyzeAllSlopes> | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useFlat, setUseFlat] = useState(false)
  const [flatElevation, setFlatElevation] = useState(50)
  const project = store.getProject()

  const handleImportCSV = async () => {
    const result = await window.api.import.file({ accept: ['.csv', '.xyz'] })
    if (!result.success || !result.content) return

    setIsProcessing(true)
    setError(null)

    await taskQueue.enqueue(TASK_IDS.TERRAIN_IMPORT, async (onProgress) => {
      try {
        onProgress({ taskId: TASK_IDS.TERRAIN_IMPORT, phase: 'Импорт', percent: 10, message: 'Разбор файла...' })
        const parsed = parseCSVElevation(result.content!)

        if (parsed.error) {
          setError(parsed.error)
          return null
        }

        onProgress({ taskId: TASK_IDS.TERRAIN_IMPORT, phase: 'Импорт', percent: 50, message: 'Создание сетки...' })
        const g = buildGridFromPoints(parsed.points)
        setGrid(g)

        onProgress({ taskId: TASK_IDS.TERRAIN_IMPORT, phase: 'Импорт', percent: 80, message: 'Анализ уклонов...' })
        const s = analyzeAllSlopes(g)
        setSlopes(s)

        onProgress({ taskId: TASK_IDS.TERRAIN_IMPORT, phase: 'Импорт', percent: 100, message: 'Готово' })
        return g
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка импорта')
        return null
      }
    })
    setIsProcessing(false)
  }

  const handleUseFlatModel = () => {
    setUseFlat(true)
    // Create a 10x10 flat grid
    const data = Array(100).fill(flatElevation)
    const g = createElevationGrid(0, 0, 10, 10, 10, data)
    setGrid(g)
    const s = analyzeAllSlopes(g)
    setSlopes(s)
  }

  return (
    <div className="flex flex-col h-full bg-tm-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border bg-tm-surface shrink-0">
        <Mountain size={16} className="text-tm-accent" />
        <span className="font-semibold text-sm">Рельеф и инженерная подготовка</span>
      </div>

      <div className="mx-4 mt-3 mb-2 p-2 bg-blue-900/20 border border-blue-700/40 rounded text-xs text-blue-300 shrink-0">
        ℹ Предварительный анализ рельефа на основе локальных данных.
        Не является результатом инженерно-геодезических изысканий.
      </div>

      {/* Status */}
      {!grid && (
        <div className="mx-4 mb-2 p-3 bg-tm-surface border border-tm-border rounded text-xs shrink-0">
          <p className="text-amber-400 font-medium">Статус: Данные рельефа отсутствуют</p>
          <p className="text-tm-muted mt-1">Без данных рельефа расчёт уклонов и земляных масс невозможен.</p>
          <p className="text-tm-muted">Для демонстрации доступна плоская условная поверхность.</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-tm-border shrink-0">
        <button onClick={handleImportCSV} disabled={isProcessing} className="btn-secondary flex items-center gap-2 text-xs">
          <Upload size={12} />
          Импорт CSV/XYZ
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handleUseFlatModel} className="btn-secondary text-xs">
            Плоская модель
          </button>
          <input
            type="number"
            value={flatElevation}
            onChange={e => setFlatElevation(Number(e.target.value))}
            className="input-sm w-16"
            min={0}
            max={9999}
          />
          <span className="text-xs text-tm-muted">м</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-red-900/20 border border-red-700/40 rounded text-xs text-red-400 shrink-0">
          ⛔ {error}
        </div>
      )}

      {/* Processing */}
      {isProcessing && (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-tm-muted shrink-0">
          <RefreshCw size={12} className="animate-spin" />
          Обработка данных рельефа...
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {grid && slopes ? (
          <>
            {useFlat && (
              <div className="p-2 bg-yellow-900/20 border border-yellow-700/40 rounded text-xs text-yellow-400">
                ⚠ Используется плоская условная модель с отметкой {flatElevation} м.
                Расчёт земляных масс и стока невозможен.
              </div>
            )}
            <TerrainStats grid={grid} slopes={slopes} />
            <SlopeDistribution slopes={slopes} />
          </>
        ) : !isProcessing && (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

function TerrainStats({ grid, slopes }: { grid: ElevationGrid; slopes: ReturnType<typeof analyzeAllSlopes> }) {
  return (
    <div className="bg-tm-surface rounded-lg border border-tm-border p-4">
      <h3 className="text-sm font-semibold mb-3">Параметры рельефа</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Мин. отметка" value={`${grid.noDataValue !== grid.data[0] ? Math.min(...Array.from(grid.data).filter(v => !isNaN(v))).toFixed(1) : '—'} м`} />
        <Stat label="Макс. отметка" value={`${Math.max(...Array.from(grid.data).filter(v => !isNaN(v))).toFixed(1)} м`} />
        <Stat label="Средний уклон" value={`${slopes.avgSlope.toFixed(1)}%`} />
        <Stat label="Макс. уклон" value={`${slopes.maxSlope.toFixed(1)}%`} />
        <Stat label="Разрешение сетки" value={`${grid.cellSize} м`} />
        <Stat label="Ячеек без данных" value={slopes.noDataCells} accent={slopes.noDataCells > 0 ? 'warning' : 'ok'} />
      </div>
    </div>
  )
}

function SlopeDistribution({ slopes }: { slopes: ReturnType<typeof analyzeAllSlopes> }) {
  const total = Object.values(slopes.distribution).reduce((s, v) => s + v, 0)
  if (total === 0) return null

  const SLOPE_LABELS: Record<string, string> = {
    flat: 'Равнинный < 0.5%',
    gentle: 'Пологий 0.5–2%',
    moderate: 'Средний 2–5%',
    steep: 'Крутой 5–10%',
    'very-steep': 'Очень крутой 10–20%',
    extreme: 'Экстремальный > 20%'
  }

  return (
    <div className="bg-tm-surface rounded-lg border border-tm-border p-4">
      <h3 className="text-sm font-semibold mb-3">Распределение уклонов</h3>
      <div className="space-y-1.5">
        {Object.entries(slopes.distribution).map(([cls, count]) => {
          const pct = Math.round((count / total) * 100)
          return (
            <div key={cls} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className="text-tm-muted">{SLOPE_LABELS[cls] ?? cls}</span>
                <span className="font-mono text-tm-text">{pct}%</span>
              </div>
              <div className="h-1.5 bg-tm-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-tm-accent rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: 'ok' | 'warning' }) {
  const color = accent === 'warning' ? 'text-amber-400' : accent === 'ok' ? 'text-green-400' : 'text-tm-text'
  return (
    <>
      <span className="text-tm-muted">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-tm-muted">
      <Mountain size={32} className="mb-3" />
      <p>Данные рельефа отсутствуют</p>
      <p className="text-xs mt-1">Импортируйте CSV/XYZ или используйте плоскую модель</p>
    </div>
  )
}

// ---- CSV parser ----

interface ElevationPoint { x: number; y: number; z: number }

function parseCSVElevation(content: string): { points: ElevationPoint[]; error?: string } {
  const lines = content.trim().split('\n')
  const points: ElevationPoint[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/[,;\s\t]+/)
    if (parts.length < 3) continue
    const x = parseFloat(parts[0])
    const y = parseFloat(parts[1])
    const z = parseFloat(parts[2])
    if (isNaN(x) || isNaN(y) || isNaN(z)) continue
    points.push({ x, y, z })
  }
  if (points.length < 4) {
    return { points: [], error: `Недостаточно точек (${points.length}). Минимум 4.` }
  }
  return { points }
}

function buildGridFromPoints(points: ElevationPoint[]): ElevationGrid {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
  }
  const cellSize = Math.max(1, Math.round(Math.sqrt(((maxX - minX) * (maxY - minY)) / points.length)))
  const cols = Math.ceil((maxX - minX) / cellSize) + 1
  const rows = Math.ceil((maxY - minY) / cellSize) + 1

  const data = new Float32Array(cols * rows).fill(NaN)

  // Nearest-point assignment
  for (const p of points) {
    const col = Math.round((p.x - minX) / cellSize)
    const row = Math.round((p.y - minY) / cellSize)
    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      const idx = row * cols + col
      if (isNaN(data[idx])) data[idx] = p.z
    }
  }

  return { originX: minX, originY: minY, cellSize, cols, rows, data, noDataValue: -9999 }
}
