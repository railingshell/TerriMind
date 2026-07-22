import React, { useMemo } from 'react'
import { Car, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { store } from '../../store/projectStore'
import { DEFAULT_PARKING_RULES, calculateBuildingParkingDemand } from '../../services/parking-calculation/parkingEngine'

export function ParkingPanel() {
  const project = store.getProject()
  const rules = project.parkingRules.length > 0 ? project.parkingRules : DEFAULT_PARKING_RULES

  const demandItems = useMemo(() =>
    calculateBuildingParkingDemand(project.buildings, rules),
    [project.buildings, rules]
  )

  const totalDemand = demandItems.reduce((s, d) => s + d.totalDemand, 0)
  const totalCreated = project.parkingFacilities.reduce((s, p) => s + p.capacity, 0)
  const deficit = Math.max(0, totalDemand - totalCreated)
  const surplus = Math.max(0, totalCreated - totalDemand)

  const isDemoRules = rules.every(r => !r.isUserDefined)

  return (
    <div className="flex flex-col h-full bg-tm-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border bg-tm-surface shrink-0">
        <Car size={16} className="text-tm-accent" />
        <span className="font-semibold text-sm">Парковки</span>
        <span className="text-xs text-tm-muted ml-auto">{project.parkingFacilities.length} объектов</span>
      </div>

      {isDemoRules && (
        <div className="mx-4 mt-3 mb-2 p-2 bg-amber-900/20 border border-amber-700/40 rounded text-xs text-amber-400 shrink-0">
          ⚠ Используются демонстрационные нормативы парковки. Не являются официальными требованиями.
        </div>
      )}

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-3 p-4 border-b border-tm-border shrink-0">
        <SummaryCard label="Потребность" value={totalDemand} unit="мест" />
        <SummaryCard label="Создано" value={totalCreated} unit="мест" />
        <SummaryCard
          label={deficit > 0 ? 'Дефицит' : 'Профицит'}
          value={deficit > 0 ? deficit : surplus}
          unit="мест"
          accent={deficit > 0 ? 'error' : 'success'}
        />
      </div>

      {/* By land use */}
      <div className="flex-1 overflow-y-auto p-4">
        {project.buildings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-tm-dim">Потребность по назначению</h3>
            {groupByLandUse(demandItems).map(item => (
              <div key={item.use} className="bg-tm-surface rounded border border-tm-border px-3 py-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-tm-text">{item.useLabel}</span>
                  <span className="font-mono text-tm-muted">{item.totalDemand} мест</span>
                </div>
                <div className="flex justify-between text-xs text-tm-muted mt-1">
                  <span>{item.buildingCount} зданий</span>
                  <span>Правило: {item.ruleLabel}</span>
                </div>
              </div>
            ))}

            <h3 className="text-xs font-semibold text-tm-dim mt-4">Созданная ёмкость по типам</h3>
            {project.parkingFacilities.length === 0 ? (
              <p className="text-xs text-tm-muted">Нет парковок в проекте</p>
            ) : (
              Object.entries(groupByType(project.parkingFacilities)).map(([type, count]) => (
                <div key={type} className="bg-tm-surface rounded border border-tm-border px-3 py-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-tm-text">{PARKING_TYPE_LABELS[type] ?? type}</span>
                    <span className="font-mono">{count} мест</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const PARKING_TYPE_LABELS: Record<string, string> = {
  'open-surface': 'Открытая наземная', 'on-street': 'Уличная',
  'guest': 'Гостевая', 'embedded': 'Встроенная', 'underground': 'Подземная',
  'multi-level': 'Многоуровневая', 'park-and-ride': 'Перехватывающая',
  'service': 'Служебная', 'disabled': 'Для МГН', 'bicycle': 'Велосипедная'
}

function SummaryCard({ label, value, unit, accent }: {
  label: string; value: number; unit: string; accent?: 'error' | 'success'
}) {
  const color = accent === 'error' ? 'text-red-400' : accent === 'success' ? 'text-green-400' : 'text-tm-text'
  return (
    <div className="bg-tm-surface rounded-lg border border-tm-border p-3 text-center">
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-tm-muted">{unit}</div>
      <div className="text-xs text-tm-dim">{label}</div>
    </div>
  )
}

interface LandUseGroup {
  use: string; useLabel: string; buildingCount: number; totalDemand: number; ruleLabel: string
}

function groupByLandUse(items: ReturnType<typeof calculateBuildingParkingDemand>): LandUseGroup[] {
  const map = new Map<string, LandUseGroup>()
  for (const item of items) {
    const existing = map.get(item.landUse)
    if (existing) {
      existing.buildingCount++
      existing.totalDemand += item.totalDemand
    } else {
      map.set(item.landUse, {
        use: item.landUse,
        useLabel: USE_LABELS[item.landUse] ?? item.landUse,
        buildingCount: 1,
        totalDemand: item.totalDemand,
        ruleLabel: item.ruleId
      })
    }
  }
  return Array.from(map.values()).filter(g => g.totalDemand > 0)
}

function groupByType(facilities: typeof store.getParkingFacilities extends () => infer R ? R : never): Record<string, number> {
  const result: Record<string, number> = {}
  for (const f of facilities) {
    result[f.type] = (result[f.type] ?? 0) + f.capacity
  }
  return result
}

const USE_LABELS: Record<string, string> = {
  'residential': 'Жилая', 'mixed': 'Смешанная', 'commercial': 'Коммерция',
  'office': 'Офис', 'education': 'Образование', 'healthcare': 'Здравоохранение'
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-tm-muted">
      <AlertCircle size={32} className="mb-3" />
      <p>Нет зданий в проекте</p>
      <p className="text-xs mt-1">Добавьте здания для расчёта парковочной потребности</p>
    </div>
  )
}
