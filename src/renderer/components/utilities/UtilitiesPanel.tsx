import React, { useMemo } from 'react'
import { Wrench, AlertCircle } from 'lucide-react'
import { store } from '../../store/projectStore'
import type { UtilityType } from '@shared/types/utilities'

const TYPE_LABELS: Record<UtilityType, string> = {
  'water-supply': 'Водоснабжение',
  'sewage': 'Канализация (хоз-быт.)',
  'storm-drain': 'Ливневая канализация',
  'electricity': 'Электроснабжение',
  'heating': 'Теплоснабжение',
  'gas': 'Газоснабжение',
  'telecom': 'Связь',
  'custom': 'Пользовательская'
}

const TYPE_COLORS: Record<UtilityType, string> = {
  'water-supply': 'bg-blue-500',
  'sewage': 'bg-yellow-800',
  'storm-drain': 'bg-cyan-500',
  'electricity': 'bg-yellow-400',
  'heating': 'bg-red-500',
  'gas': 'bg-orange-500',
  'telecom': 'bg-purple-500',
  'custom': 'bg-gray-500'
}

export function UtilitiesPanel() {
  const project = store.getProject()
  const utilities = project.utilities
  const connectionPoints = project.utilityConnectionPoints

  const byType = useMemo(() => {
    const map = new Map<UtilityType, { count: number; totalLength: number; cost: number }>()
    for (const u of utilities) {
      const existing = map.get(u.type) ?? { count: 0, totalLength: 0, cost: 0 }
      existing.count++
      existing.totalLength += u.length
      existing.cost += u.estimatedTotalCost
      map.set(u.type, existing)
    }
    return map
  }, [utilities])

  const totalLength = utilities.reduce((s, u) => s + u.length, 0)
  const totalCost = utilities.reduce((s, u) => s + u.estimatedTotalCost, 0)
  const conflictCount = utilities.reduce((s, u) => s + u.violations.length, 0)

  return (
    <div className="flex flex-col h-full bg-tm-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border bg-tm-surface shrink-0">
        <Wrench size={16} className="text-tm-accent" />
        <span className="font-semibold text-sm">Инженерные сети</span>
        <span className="text-xs text-tm-muted ml-auto">{utilities.length} сетей</span>
      </div>

      <div className="mx-4 mt-3 mb-2 p-2 bg-blue-900/20 border border-blue-700/40 rounded text-xs text-blue-300 shrink-0">
        ℹ Трассировка и стоимость — предварительная оценка.
        Не является проектом инженерных сетей.
      </div>

      {/* Summary */}
      {utilities.length > 0 && (
        <div className="grid grid-cols-3 gap-3 p-4 border-b border-tm-border shrink-0">
          <SummaryCard label="Суммарная длина" value={`${(totalLength / 1000).toFixed(2)} км`} />
          <SummaryCard label="Точек подкл." value={connectionPoints.length} />
          <SummaryCard label="Конфликтов" value={conflictCount} accent={conflictCount > 0 ? 'warning' : 'ok'} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {utilities.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {Array.from(byType.entries()).map(([type, stats]) => (
              <div key={type} className="bg-tm-surface rounded-lg border border-tm-border px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${TYPE_COLORS[type] ?? 'bg-gray-500'}`} />
                  <span className="text-sm font-medium">{TYPE_LABELS[type]}</span>
                  <span className="text-xs text-tm-muted ml-auto">{stats.count} сетей</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-tm-muted">Длина</span>
                  <span className="font-mono">{(stats.totalLength / 1000).toFixed(3)} км</span>
                  <span className="text-tm-muted">Ориент. стоимость</span>
                  <span className="font-mono">{stats.cost.toLocaleString('ru')} руб.</span>
                </div>
              </div>
            ))}

            {totalCost > 0 && (
              <div className="bg-tm-surface rounded-lg border border-tm-border px-4 py-3">
                <div className="text-xs font-semibold text-tm-dim mb-2">Итого (ориентировочно)</div>
                <div className="flex justify-between text-sm">
                  <span className="text-tm-muted">Общая стоимость</span>
                  <span className="font-mono font-bold text-tm-text">
                    {(totalCost / 1_000_000).toFixed(1)} млн руб.
                  </span>
                </div>
                <p className="text-xs text-amber-500 mt-2">
                  ⚠ Предварительная оценка. Требуется разработка проекта инженерных сетей.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, accent }: {
  label: string; value: string | number; accent?: 'ok' | 'warning'
}) {
  const color = accent === 'warning' ? 'text-amber-400' : accent === 'ok' ? 'text-green-400' : 'text-tm-text'
  return (
    <div className="bg-tm-surface rounded-lg border border-tm-border p-3 text-center">
      <div className={`text-base font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-tm-muted">{label}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-tm-muted">
      <Wrench size={32} className="mb-3" />
      <p>Нет инженерных сетей</p>
      <p className="text-xs mt-1">Добавьте сети через инспектор или импортируйте из GeoJSON</p>
    </div>
  )
}
