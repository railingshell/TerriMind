import React, { useMemo, useState } from 'react'
import { AlertTriangle, Filter, X } from 'lucide-react'
import { store } from '../../store/projectStore'
import type { Severity } from '@shared/types/common'

type SeverityFilter = 'all' | Severity
type TypeFilter = 'all' | string

const SEVERITY_ORDER: Record<Severity, number> = { critical: 4, error: 3, warning: 2, info: 1 }
const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-red-400 border-red-700 bg-red-900/10',
  error: 'text-orange-400 border-orange-700 bg-orange-900/10',
  warning: 'text-yellow-400 border-yellow-700 bg-yellow-900/10',
  info: 'text-blue-400 border-blue-700 bg-blue-900/10'
}
const SEVERITY_LABELS: Record<Severity, string> = {
  critical: '⛔ Критическое', error: '❌ Ошибка', warning: '⚠ Предупреждение', info: 'ℹ Информация'
}

export function ViolationsCenter() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')

  const project = store.getProject()

  const allConflicts = project.spatialConflicts.map(c => ({
    id: c.id,
    severity: c.severity,
    message: c.violationType,
    type: 'Пространственный конфликт',
    objectType: c.objectType,
    status: c.status,
    actions: c.possibleActions
  }))

  const allViolations = project.parcels.flatMap(p => p.violations.map(v => ({
    id: v.id,
    severity: v.severity,
    message: v.message,
    type: 'Нарушение участка',
    objectType: 'parcel' as const,
    status: v.resolvedAt ? 'resolved' : 'open',
    actions: []
  })))

  const combined = [...allConflicts, ...allViolations]

  const filtered = useMemo(() => {
    let list = combined
    if (severityFilter !== 'all') list = list.filter(v => v.severity === severityFilter)
    if (typeFilter !== 'all') list = list.filter(v => v.type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(v => v.message.toLowerCase().includes(q) || v.type.toLowerCase().includes(q))
    }
    list.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
    return list
  }, [combined, severityFilter, typeFilter, search])

  const critical = combined.filter(v => v.severity === 'critical' && v.status === 'open').length
  const open = combined.filter(v => v.status === 'open').length

  return (
    <div className="flex flex-col h-full bg-tm-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border bg-tm-surface shrink-0">
        <AlertTriangle size={16} className="text-tm-warning" />
        <span className="font-semibold text-sm">Центр нарушений</span>
        <span className={`text-xs ml-auto ${open > 0 ? 'text-amber-400' : 'text-green-400'}`}>
          {open > 0 ? `${open} открытых` : 'Нет нарушений'}
        </span>
      </div>

      {/* Critical banner — cannot be hidden */}
      {critical > 0 && (
        <div className="mx-4 mt-3 p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400 shrink-0">
          ⛔ {critical} критических нарушений — требуют обязательного устранения перед принятием проектных решений.
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-tm-border shrink-0">
        <input
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-sm flex-1"
        />
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value as SeverityFilter)}
          className="input-sm"
        >
          <option value="all">Все уровни</option>
          {(['critical', 'error', 'warning', 'info'] as Severity[]).map(s => (
            <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-tm-muted">
            <AlertTriangle size={32} className="mb-3 text-green-500" />
            <p>Нарушений не найдено</p>
          </div>
        ) : (
          filtered.map(v => (
            <div key={v.id} className={`border rounded-lg px-3 py-2 text-xs ${SEVERITY_COLORS[v.severity]}`}>
              <div className="flex justify-between items-start gap-2">
                <span className="font-medium">{v.message}</span>
                <span className="text-tm-muted shrink-0">{v.type}</span>
              </div>
              {v.actions.length > 0 && (
                <div className="mt-1 text-tm-muted">
                  Рекомендации: {v.actions.join(' · ')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
