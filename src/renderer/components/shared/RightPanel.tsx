import React from 'react'
import { X } from 'lucide-react'
import { store } from '../../store/projectStore'

interface Props {
  onClose(): void
}

export function RightPanel({ onClose }: Props) {
  const project = store.getProject()

  const totalPopulation = project.buildings.reduce((s, b) => s + b.residents, 0)
  const totalArea = project.blocks.reduce((s, b) => s + b.area, 0)
  const parcelCount = project.parcels.length
  const violationCount = project.spatialConflicts.filter(c => c.status === 'open').length
  const criticalViolations = project.spatialConflicts.filter(
    c => c.status === 'open' && c.severity === 'critical'
  ).length

  return (
    <aside className="w-64 bg-tm-surface border-l border-tm-border flex flex-col shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-tm-border">
        <span className="text-xs font-semibold text-tm-dim">ТЭП проекта</span>
        <button onClick={onClose} className="text-tm-muted hover:text-tm-text">
          <X size={14} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <TepRow label="Территория" value={`${(totalArea / 10000).toFixed(2)} га`} />
        <TepRow label="Кварталов" value={project.blocks.length} />
        <TepRow label="Зданий" value={project.buildings.length} />
        <TepRow label="Участков" value={parcelCount} />
        <TepRow label="Население" value={totalPopulation.toLocaleString('ru')} />
        <TepRow label="Инфра объектов" value={project.infrastructureObjects.length} />
        <TepRow label="Парковок" value={project.parkingFacilities.length} />
        <TepRow label="Ограничений" value={project.constraints.length} />
        <TepRow label="Сетей" value={project.utilities.length} />
        <div className="pt-2 border-t border-tm-border">
          <TepRow
            label="Нарушений (всего)"
            value={violationCount}
            accent={violationCount > 0 ? 'warning' : 'ok'}
          />
          {criticalViolations > 0 && (
            <TepRow
              label="Критических"
              value={criticalViolations}
              accent="error"
            />
          )}
        </div>
      </div>

      <div className="p-3 mt-auto border-t border-tm-border">
        <p className="text-xs text-tm-muted leading-relaxed">
          ⚠ Предпроектная оценка. Не является официальной документацией.
        </p>
      </div>
    </aside>
  )
}

function TepRow({
  label,
  value,
  accent
}: {
  label: string
  value: string | number
  accent?: 'ok' | 'warning' | 'error'
}) {
  const color = accent === 'error' ? 'text-tm-error' :
    accent === 'warning' ? 'text-tm-warning' : 'text-tm-text'
  return (
    <div className="flex justify-between items-baseline gap-2 text-xs">
      <span className="text-tm-muted truncate">{label}</span>
      <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
  )
}
