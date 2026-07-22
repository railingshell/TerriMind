import React, { useMemo, useState } from 'react'
import { Shield, AlertTriangle, RefreshCw, Upload } from 'lucide-react'
import { store, addConstraintCommand } from '../../store/projectStore'
import { analyzeConstraintConflicts, calculateConstrainedAreaBreakdown } from '../../services/constraint-analysis/constraintEngine'
import type { TerritorialConstraint } from '@shared/types/constraints'
import { generateId, nowISO } from '@shared/utils/id'
import { taskQueue, TASK_IDS } from '../../workers/taskQueue'

const CATEGORY_LABELS: Record<string, string> = {
  'red-line': 'Красные линии',
  'sanitary-protection': 'СЗЗ',
  'utility-protection': 'Охранная зона сетей',
  'water-protection': 'Водоохранная зона',
  'coastal-protection': 'Прибрежная защитная полоса',
  'flood-zone': 'Зона затопления',
  'waterlogging-zone': 'Зона подтопления',
  'heritage-protection': 'Охранная зона ОКН',
  'heritage-territory': 'Территория ОКН',
  'no-build-zone': 'Зона запрета строительства',
  'height-restriction': 'Ограничение высоты',
  'custom': 'Пользовательское'
}

const SEVERITY_LABELS: Record<string, string> = {
  'absolute': 'Абсолютный запрет',
  'strict': 'Строгое',
  'conditional': 'Условное',
  'informational': 'Информационное'
}

export function ConstraintsPanel() {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const project = store.getProject()
  const conflicts = project.spatialConflicts

  const breakdown = useMemo(() => {
    const totalArea = project.blocks.reduce((s, b) => s + b.area, 0)
    return calculateConstrainedAreaBreakdown(totalArea, project.constraints, conflicts)
  }, [project.constraints, project.blocks, conflicts])

  const criticalConflicts = conflicts.filter(c => c.severity === 'critical' && c.status === 'open')
  const openConflicts = conflicts.filter(c => c.status === 'open')

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    await taskQueue.enqueue(
      TASK_IDS.CONSTRAINT_ANALYSIS,
      async () => {
        const result = analyzeConstraintConflicts(
          project.constraints,
          project.parcels,
          project.buildings
        )
        store.updateSpatialConflicts(result)
        return result
      }
    )
    setIsAnalyzing(false)
  }

  const handleImportGeoJSON = async () => {
    const result = await window.api.import.file({ accept: ['.geojson', '.json'] })
    if (!result.success || !result.content) return

    try {
      const geojson = JSON.parse(result.content)
      if (geojson.type !== 'FeatureCollection') {
        alert('Ожидается GeoJSON FeatureCollection')
        return
      }
      let count = 0
      for (const feature of geojson.features ?? []) {
        if (feature.geometry?.type !== 'Polygon') continue
        const props = feature.properties ?? {}
        const constraint: TerritorialConstraint = {
          id: generateId(),
          name: props.name ?? props.NAME ?? `Ограничение ${count + 1}`,
          category: props.category ?? 'custom',
          geometry: feature.geometry,
          geometryType: 'polygon',
          severity: props.severity ?? 'informational',
          action: 'info-warning',
          confidence: 'estimated',
          isConfirmed: false,
          dataSource: { type: 'imported-geojson', label: result.fileName ?? 'GeoJSON' },
          priority: 0,
          userMetadata: {},
          createdAt: nowISO(),
          updatedAt: nowISO()
        }
        store.execute(addConstraintCommand(constraint))
        count++
      }
      alert(`Импортировано ${count} ограничений`)
    } catch (e) {
      alert('Ошибка импорта: ' + (e instanceof Error ? e.message : 'Unknown'))
    }
  }

  return (
    <div className="flex flex-col h-full bg-tm-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border bg-tm-surface shrink-0">
        <Shield size={16} className="text-tm-accent" />
        <span className="font-semibold text-sm">Территориальные ограничения</span>
        <span className="text-xs text-tm-muted ml-auto">{project.constraints.length} ограничений</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-tm-border shrink-0">
        <button onClick={handleImportGeoJSON} className="btn-secondary flex items-center gap-2 text-xs">
          <Upload size={12} />
          Импорт GeoJSON
        </button>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || project.constraints.length === 0}
          className="btn-primary flex items-center gap-2 text-xs"
        >
          {isAnalyzing ? <RefreshCw size={12} className="animate-spin" /> : <Shield size={12} />}
          Анализ конфликтов
        </button>
      </div>

      {/* Summary */}
      {project.constraints.length > 0 && (
        <div className="grid grid-cols-3 gap-3 p-4 border-b border-tm-border shrink-0">
          <SummaryCard
            label="Зона запретов"
            value={`${(breakdown.strictlyProhibitedArea / 10000).toFixed(2)} га`}
            accent="error"
          />
          <SummaryCard
            label="Конфликтов"
            value={openConflicts.length}
            accent={openConflicts.length > 0 ? 'warning' : 'ok'}
          />
          <SummaryCard
            label="Критических"
            value={criticalConflicts.length}
            accent={criticalConflicts.length > 0 ? 'error' : 'ok'}
          />
        </div>
      )}

      {/* Critical conflicts warning */}
      {criticalConflicts.length > 0 && (
        <div className="mx-4 mb-2 p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400 shrink-0">
          ⛔ {criticalConflicts.length} критических нарушений — строительство в зоне абсолютного запрета.
          Требуется обязательное устранение.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {project.constraints.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <h3 className="text-xs font-semibold text-tm-dim">Ограничения</h3>
            {project.constraints.map(c => (
              <ConstraintRow key={c.id} constraint={c} />
            ))}

            {conflicts.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-tm-dim mt-4">Конфликты</h3>
                {conflicts
                  .filter(c => c.status === 'open')
                  .sort((a, b) => severityOrder(b.severity) - severityOrder(a.severity))
                  .map(conflict => (
                    <ConflictRow key={conflict.id} conflict={conflict} />
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ConstraintRow({ constraint }: { constraint: TerritorialConstraint }) {
  const severityColor: Record<string, string> = {
    'absolute': 'border-red-600 bg-red-900/10',
    'strict': 'border-orange-600 bg-orange-900/10',
    'conditional': 'border-yellow-600 bg-yellow-900/10',
    'informational': 'border-tm-border bg-tm-surface'
  }
  return (
    <div className={`border rounded-lg px-3 py-2 text-xs ${severityColor[constraint.severity] ?? severityColor.informational}`}>
      <div className="flex justify-between items-start">
        <span className="font-medium text-tm-text">{constraint.name}</span>
        <span className="text-tm-muted ml-2 shrink-0">{SEVERITY_LABELS[constraint.severity]}</span>
      </div>
      <div className="text-tm-muted mt-0.5">
        {CATEGORY_LABELS[constraint.category] ?? constraint.category}
        {constraint.normativeSource && ` · ${constraint.normativeSource}`}
      </div>
    </div>
  )
}

function ConflictRow({ conflict }: { conflict: ReturnType<typeof store.getSpatialConflicts>[0] }) {
  const colors: Record<string, string> = {
    'critical': 'text-red-400 border-red-700',
    'error': 'text-orange-400 border-orange-700',
    'warning': 'text-yellow-400 border-yellow-700',
    'info': 'text-blue-400 border-blue-700'
  }
  const cls = colors[conflict.severity] ?? colors.info
  return (
    <div className={`border rounded px-3 py-2 text-xs ${cls}`}>
      <div className="flex justify-between">
        <span className="font-medium">{conflict.violationType}</span>
        <span className="text-tm-muted">{conflict.objectType}</span>
      </div>
      <div className="text-tm-muted mt-0.5">
        Пересечение: {conflict.intersectionArea ?? 0} м² ({conflict.objectSharePercent.toFixed(1)}% объекта)
      </div>
    </div>
  )
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent?: 'ok' | 'warning' | 'error' }) {
  const color = accent === 'error' ? 'text-red-400' : accent === 'warning' ? 'text-yellow-400' : 'text-green-400'
  return (
    <div className="bg-tm-surface rounded-lg border border-tm-border p-3 text-center">
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-tm-muted">{label}</div>
    </div>
  )
}

function severityOrder(s: string): number {
  return { critical: 4, error: 3, warning: 2, info: 1 }[s] ?? 0
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-tm-muted">
      <Shield size={32} className="mb-3" />
      <p>Нет ограничений</p>
      <p className="text-xs mt-1">Импортируйте ограничения из GeoJSON или добавьте вручную</p>
    </div>
  )
}
